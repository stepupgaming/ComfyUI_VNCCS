import type { QwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import { currentPoseData } from "@workspace/core/hooks/use-pose-studio";
import {
  type GeneratorSources,
  generatorData,
  prepareGeneratorRun,
  syncGenerator,
} from "@workspace/core/lib/generator-actions";
import { createSpritePreview } from "@workspace/core/lib/images";
import { runPrompt } from "@workspace/core/lib/jobs";
import { studioHttp } from "@workspace/core/lib/studio";
import {
  clonerContext,
  useClonerStore,
} from "@workspace/core/stores/cloner-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  type GeneratorTarget,
  useGeneratorStore,
} from "@workspace/core/stores/generator-store";
import { usePoseStudioStore } from "@workspace/core/stores/pose-studio-store";
import { nativeSeedvrProblem } from "@workspace/vnccs/character-generator";
import type {
  PresetGroup,
  TraitField,
} from "@workspace/vnccs/character-presets";
import {
  analysisError,
  analyzeClonerSource,
  ClonerTagLoader,
  DEPENDENCY_HINT,
  ONE_IMAGE_ONLY_MESSAGE,
  uploadClonerSource,
} from "@workspace/vnccs/cloner";
import {
  clonerQueueProblem,
  initializeClonerState,
  parseClonerState,
  serializeClonerState,
  sourceKey,
  updateClonerState,
} from "@workspace/vnccs/cloner-state";
import {
  cachedPreviewUrl,
  createCharacter,
  deleteCharacter,
  fetchCharacterInfo,
  fetchContextLists,
} from "@workspace/vnccs/creator";
import {
  buildCharacterClonerPrompt,
  CLONER_IDS,
} from "@workspace/vnccs/graphs";
import type { SpritePreviewNavigator } from "@workspace/vnccs/sprite-preview";
import { toast } from "sonner";

/**
 * The Character Cloner widget's async flows (init, character loading, the
 * reference upload, caption analysis, tag presets, create/delete, queueing),
 * ported from `web/vnccs_character_cloner.js`. Each flow takes a request
 * guard so a newer request makes older replies stale, like the widget's
 * `createRequestGuard`; leaving the page invalidates them all.
 */

function requestGuard() {
  let current = 0;
  return () => {
    current += 1;
    const id = current;
    return () => id === current;
  };
}

const beginCharacterRequest = requestGuard();
const beginCaptionRequest = requestGuard();
const beginUploadRequest = requestGuard();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function store() {
  return useClonerStore.getState();
}

function currentCharacter(): string {
  return store().state?.character ?? "";
}

function currentSourceKey(): string {
  const state = store().state;
  return state ? sourceKey(state) : "";
}

let navigator: SpritePreviewNavigator | null = null;

/** The source preview's sprite navigator (no costume), mirrored into the store. */
function spritePreview(): SpritePreviewNavigator {
  navigator ??= createSpritePreview({
    isSelectionCurrent: (selection) =>
      selection.character === currentCharacter(),
    onChange: (preview) => store().set({ preview }),
    onLoaded: (url, preview) =>
      store().update((model) => model.setPreviewSprite(url, preview)),
    onMissing: () => store().update((model) => model.clearPreviewSprite()),
  });
  return navigator;
}

export function stepSprite(delta: number): void {
  spritePreview().step(delta);
}

/** `node.onRemoved`: replies to anything started on the page are dropped. */
export function leaveCloner(): void {
  beginCharacterRequest();
  beginCaptionRequest();
  beginUploadRequest();
  navigator?.invalidate();
  store().set({ describe: null, uploading: false });
}

/**
 * `loadChar`: read the character's metadata (unless the saved widget data
 * already holds it), then its preview. Changing the character clears the
 * reference when asked. On failure the previous character stays selected.
 * Resolves true when the selection stuck.
 */
export async function loadCharacter(
  name: string,
  options: { clearSources?: boolean; skipInfoLoad?: boolean } = {}
): Promise<boolean> {
  beginCaptionRequest();
  const isCurrentRequest = beginCharacterRequest();
  const original = currentCharacter();
  const isCurrent = () =>
    isCurrentRequest() &&
    (currentCharacter() === original || currentCharacter() === name);
  const http = studioHttp();
  try {
    const info =
      name && !options.skipInfoLoad
        ? await fetchCharacterInfo(http, name)
        : null;
    if (!isCurrent()) {
      return false;
    }
    const changed = currentCharacter() !== name;
    store().update((model) => {
      model.state.character = name;
      if (info || !name) {
        model.loadCharacterInfo(name, info);
      }
      if (changed && options.clearSources) {
        model.clearSources();
      }
      if (!name) {
        model.clearPreviewSprite();
      }
    });
    if (changed && options.clearSources) {
      store().set({ describe: null });
    }
    const preview = spritePreview();
    preview.invalidate();
    await preview.load(name, {
      fallbackUrl: name ? cachedPreviewUrl(http, name) : "",
    });
    return isCurrent();
  } catch (error) {
    if (isCurrent()) {
      toast.error("Character Load Failed", { description: errorText(error) });
    }
    return false;
  }
}

/** The widget's init: saved state, the character list, then the selected character. */
export async function initCloner(): Promise<void> {
  try {
    const lists = await fetchContextLists(studioHttp());
    const { state, restoredInfoCharacter } = parseClonerState(
      store().widgetData
    );
    store().set({ characters: lists.characters, loadError: null });
    store().setState(initializeClonerState(state, clonerContext()));
    const saved = currentCharacter();
    const selected = lists.characters.includes(saved)
      ? saved
      : lists.characters[0] || "";
    await loadCharacter(selected, {
      clearSources: true,
      skipInfoLoad: Boolean(selected) && restoredInfoCharacter === selected,
    });
  } catch (error) {
    store().set({ loadError: errorText(error) });
  }
}

/** NEW: create the character (server defaults, no catalog) and select it. */
export async function createNewCharacter(name: string): Promise<boolean> {
  await createCharacter(studioHttp(), name, null);
  const { characters } = store();
  if (!characters.includes(name)) {
    store().set({ characters: [...characters, name] });
  }
  return loadCharacter(name, { clearSources: true });
}

/** DEL: delete the character and select the first remaining one. */
export async function deleteCurrentCharacter(): Promise<void> {
  const name = currentCharacter();
  if (!name) {
    return;
  }
  await deleteCharacter(studioHttp(), name);
  const characters = store().characters.filter((item) => item !== name);
  store().set({ characters });
  await loadCharacter("", { clearSources: true });
  await loadCharacter(characters[0] ?? "", { clearSources: true });
}

/** `syncBackgroundControl`: re-apply the Alpha rule after the Control Center model changed. */
export function syncClonerBackground(): void {
  const { state } = store();
  if (!state) {
    return;
  }
  const next = updateClonerState(state, clonerContext(), () => undefined);
  if (serializeClonerState(next) !== serializeClonerState(state)) {
    store().setState(next);
  }
}

/** Re-apply the background rule whenever the Control Center's model kind changes. */
export function watchClonerBackground(): () => void {
  let kind = clonerContext().modelKind;
  return useControlCenterStore.subscribe(() => {
    const next = clonerContext().modelKind;
    if (next !== kind) {
      kind = next;
      syncClonerBackground();
    }
  });
}

let describeIsCurrent: (() => boolean) | null = null;
let describeId = 0;

/** "Describe Your Character": offered after each successful upload. */
function openDescribePrompt(): void {
  const isCurrentRequest = beginCaptionRequest();
  const character = currentCharacter();
  const key = currentSourceKey();
  describeIsCurrent = () =>
    isCurrentRequest() &&
    currentCharacter() === character &&
    currentSourceKey() === key;
  describeId += 1;
  store().set({ describe: { id: describeId } });
}

export function closeDescribePrompt(): void {
  store().set({ describe: null });
}

/**
 * A choice in the prompt. Choices made for a stale context (another
 * character or reference, or the page was left) do nothing.
 */
export async function chooseDescribe(
  choice: "manual" | "analyze",
  gate: QwenModelGate
): Promise<void> {
  const isCurrent = describeIsCurrent ?? (() => false);
  if (choice === "analyze" && isCurrent() && store().analysis !== "idle") {
    return;
  }
  closeDescribePrompt();
  if (!isCurrent()) {
    return;
  }
  if (choice === "manual") {
    store().set({ editRequest: { field: "face", id: describeId } });
    return;
  }
  await analyzeSource(gate);
}

/**
 * The file input: exactly one image replaces the reference, then the
 * describe prompt opens. Late replies for another character or reference
 * are dropped.
 */
export async function uploadSource(files: File[]): Promise<void> {
  const [file] = files;
  if (!(file && store().state)) {
    return;
  }
  if (files.length > 1) {
    toast.error("One Image Only", { description: ONE_IMAGE_ONLY_MESSAGE });
    return;
  }
  const isCurrentRequest = beginUploadRequest();
  const character = currentCharacter();
  const key = currentSourceKey();
  const isCurrent = () =>
    isCurrentRequest() &&
    currentCharacter() === character &&
    currentSourceKey() === key;
  store().set({ uploading: true });
  try {
    const ref = await uploadClonerSource(studioHttp(), file);
    if (!isCurrent()) {
      return;
    }
    beginCaptionRequest();
    store().update((model) => model.setUploadedSource(ref));
    openDescribePrompt();
  } catch (error) {
    if (isCurrent()) {
      toast.error("Upload Error", {
        description: `Upload Failed: ${errorText(error)}`,
      });
    }
  } finally {
    if (isCurrentRequest()) {
      store().set({ uploading: false });
    }
  }
}

export function removeSource(index: number): void {
  beginCaptionRequest();
  store().update((model) => model.removeSource(index));
}

let analysisRun = 0;

/**
 * Analyze Captions: check the vision model (offering a download), read the
 * traits off the selected reference and merge them into the fields. Replies
 * for another character or reference, superseded runs and runs from a page
 * that was left are dropped.
 */
export async function analyzeSource(gate: QwenModelGate): Promise<void> {
  const state = store().state;
  if (!state || store().analysis !== "idle") {
    return;
  }
  if (state.source_images.length === 0) {
    toast.error("No Images", {
      description: "Please upload a source image to analyze.",
    });
    return;
  }
  const image = state.source_images[state.selected_idx || 0];
  if (image === undefined) {
    return;
  }
  const character = state.character;
  const key = sourceKey(state);
  const isCurrentRequest = beginCaptionRequest();
  const isCurrent = () =>
    isCurrentRequest() &&
    currentCharacter() === character &&
    currentSourceKey() === key;
  analysisRun += 1;
  const run = analysisRun;
  store().set({ analysis: "checking" });
  try {
    if (!((await gate.ensureReady()) && isCurrent())) {
      return;
    }
    store().set({ analysis: "analyzing" });
    const data = await analyzeClonerSource(
      studioHttp(),
      image,
      CLONER_IDS.source
    );
    if (isCurrent()) {
      store().update((model) => model.applyAnalysis(data));
    }
  } catch (error) {
    if (isCurrent()) {
      await reportAnalysisError(error, gate);
    }
  } finally {
    if (run === analysisRun) {
      store().set({ analysis: "idle" });
    }
  }
}

async function reportAnalysisError(
  error: unknown,
  gate: QwenModelGate
): Promise<void> {
  const failure = analysisError(error);
  if (failure.kind === "dependency") {
    toast.error(failure.title, {
      description: `Missing AI Library: ${failure.message}${failure.model ? ` (Model: ${failure.model})` : ""}. ${DEPENDENCY_HINT}`,
      duration: 15_000,
    });
    return;
  }
  if (failure.kind === "model") {
    try {
      if (await gate.offerDownload(failure.failure)) {
        toast.success("Model installed", {
          description: "Run Analyze Captions again.",
        });
      }
    } catch (reason) {
      toast.error("Error", { description: errorText(reason) });
    }
    return;
  }
  toast.error(failure.title, { description: failure.message });
}

const tags = new ClonerTagLoader(studioHttp);

/** The tag constructor's choices for a trait row; null after reporting a load failure. */
export async function loadTagGroups(
  field: TraitField
): Promise<PresetGroup[] | null> {
  try {
    const groups = await tags.groups(field);
    if (groups.length === 0) {
      toast.info("No Tags", {
        description: "No tags found for this category.",
      });
      return null;
    }
    return groups;
  } catch (error) {
    toast.error("Error", {
      description: `Error loading tag database: ${errorText(error)}`,
    });
    return null;
  }
}

/** `vnccs.character_cloner.validation_error`: the node ran without a reference image. */
export function handleValidationError(event: unknown): void {
  const detail = event as {
    code?: unknown;
    message?: unknown;
    node_id?: unknown;
  } | null;
  if (
    String(detail?.node_id ?? "") !== CLONER_IDS.source ||
    detail?.code !== "SOURCE_IMAGE_REQUIRED"
  ) {
    return;
  }
  toast.error("Source Image Required", {
    description:
      typeof detail.message === "string" && detail.message
        ? detail.message
        : "Upload a character image first.",
  });
}

const CLONE_GENERATOR: GeneratorTarget = {
  kind: "clone",
  nodeId: CLONER_IDS.generator,
};

/**
 * Queue Step 1.1 (Control Center → Cloner → Pose Studio → Clone Generator),
 * with the checks the node and widgets ran before ComfyUI's queue. Resolves
 * true once the run finished.
 */
export async function queueCloneSheets(
  sources: GeneratorSources
): Promise<boolean> {
  syncClonerBackground();
  const state = store().state;
  if (!state) {
    toast.error("Cloner not ready", {
      description: "Wait for the Character Cloner to load.",
    });
    return false;
  }
  const problem = clonerQueueProblem(state);
  if (problem) {
    toast.error(problem.title, { description: problem.message });
    return false;
  }
  const host = usePoseStudioStore.getState().host;
  if (!(host?.nodeId === CLONER_IDS.pose && host.ready)) {
    toast.error("Pose Studio is not ready", {
      description:
        host?.error ??
        "Wait for Pose Studio to finish loading, then try again.",
    });
    return false;
  }
  syncGenerator(CLONE_GENERATOR, sources);
  const seedvrProblem = nativeSeedvrProblem(
    generatorData(CLONE_GENERATOR),
    useGeneratorStore.getState().schemas
  );
  if (seedvrProblem) {
    toast.error("ComfyUI Update Required", { description: seedvrProblem });
    return false;
  }
  const { nodeState, repoId } = useControlCenterStore.getState();
  const prompt = buildCharacterClonerPrompt({
    controlCenter: { nodeState, repoId },
    source: { widgetData: serializeClonerState(state) },
    poseStudio: { poseData: currentPoseData(CLONER_IDS.pose) },
    generator: { widgetData: prepareGeneratorRun(CLONE_GENERATOR) },
  });
  try {
    await runPrompt(`Clone sheets · ${state.character}`, prompt);
    return true;
  } catch (error) {
    toast.error("Run failed", { description: errorText(error) });
    return false;
  }
}
