import { currentPoseData } from "@workspace/core/hooks/use-pose-studio";
import {
  type GeneratorSources,
  generatorData,
  prepareGeneratorRun,
  syncGenerator,
} from "@workspace/core/lib/generator-actions";
import { runPrompt } from "@workspace/core/lib/jobs";
import { studioHttp } from "@workspace/core/lib/studio";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  creatorContext,
  currentCreatorModel,
  useCreatorStore,
} from "@workspace/core/stores/creator-store";
import {
  type GeneratorTarget,
  useGeneratorStore,
} from "@workspace/core/stores/generator-store";
import { usePoseStudioStore } from "@workspace/core/stores/pose-studio-store";
import { nativeSeedvrProblem } from "@workspace/vnccs/character-generator";
import { fetchPresetCatalog } from "@workspace/vnccs/character-presets";
import {
  defaultStyleId,
  EMPTY_STYLE_CATALOG,
  fetchStyleCatalog,
} from "@workspace/vnccs/character-styles";
import {
  cachedPreviewUrl,
  createCharacter,
  deleteCharacter,
  fetchCharacterInfo,
  fetchContextLists,
  fetchPosePreviewCount,
  generatePreview,
  normalizeSpriteIndex,
  posePreviewUrl,
  runCharacterWizard,
} from "@workspace/vnccs/creator";
import {
  initializeCreatorState,
  parseCreatorState,
  serializeCreatorState,
} from "@workspace/vnccs/creator-state";
import {
  buildCharacterCreatorPrompt,
  CREATOR_IDS,
} from "@workspace/vnccs/graphs";
import { toast } from "sonner";

/**
 * The Creator V2 widget's async flows (init, character loading, preview
 * images, create/delete, wizard), ported from
 * `web/vnccs_character_creator_v2.js`. Each flow takes a request guard so a
 * newer request makes older replies stale, like the widget's
 * `createRequestGuard`.
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
const beginPreviewRequest = requestGuard();
const beginWizardRequest = requestGuard();

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function store() {
  return useCreatorStore.getState();
}

function currentCharacter(): string {
  return store().state?.character ?? "";
}

/** Resolves once the browser loaded the image, or failed to. */
function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

function prefetch(url: string) {
  const image = new Image();
  image.src = url;
}

function hideSpriteNav() {
  store().patchState((state) => {
    state.sprite_preview_count = 0;
    state.sprite_preview_index = 0;
  });
}

/** The preview the Creator node cached for the character. */
export async function tryCachePreview(character: string): Promise<void> {
  const isCurrentRequest = beginPreviewRequest();
  const isCurrent = () =>
    isCurrentRequest() && currentCharacter() === character;
  const url = cachedPreviewUrl(studioHttp(), character);
  hideSpriteNav();
  store().setPreview({ loading: true });
  const loaded = await probeImage(url);
  if (!isCurrent()) {
    return;
  }
  store().setPreview(
    loaded
      ? { loading: false, message: "", url }
      : { loading: false, message: "No Preview Image", url: null }
  );
  store().update(
    (model) => {
      model.state.preview_source = "gen";
      model.state.sprite_preview_count = 0;
      model.state.sprite_preview_index = 0;
    },
    { previewValid: loaded }
  );
}

/** One of the character's saved pose sprites, falling back to the cached preview. */
export async function showSpritePreview(
  character: string,
  index: number
): Promise<void> {
  const state = store().state;
  const count = Number(state?.sprite_preview_count || 0);
  if (!(state && character) || count <= 0) {
    return;
  }
  const isCurrentRequest = beginPreviewRequest();
  const isCurrent = () =>
    isCurrentRequest() && currentCharacter() === character;
  const normalized = normalizeSpriteIndex(index, count);
  const http = studioHttp();
  const cacheBust = state.sprite_preview_cache_bust;
  const url = posePreviewUrl(http, character, normalized, cacheBust);
  store().patchState((next) => {
    next.sprite_preview_request_id =
      Number(next.sprite_preview_request_id || 0) + 1;
    next.sprite_preview_index = normalized;
  });
  store().setPreview({ loading: true });
  const loaded = await probeImage(url);
  if (!isCurrent()) {
    return;
  }
  if (!loaded) {
    store().setPreview({ loading: false });
    hideSpriteNav();
    await tryCachePreview(character);
    return;
  }
  store().setPreview({ loading: false, message: "", url });
  store().update(
    (model) => {
      model.state.preview_source = "pose";
    },
    { previewValid: true }
  );
  if (count > 1) {
    for (const neighbour of [normalized - 1, normalized + 1]) {
      prefetch(
        posePreviewUrl(
          http,
          character,
          normalizeSpriteIndex(neighbour, count),
          cacheBust
        )
      );
    }
  }
}

export function stepSprite(delta: number): void {
  const state = store().state;
  if (state?.character) {
    showSpritePreview(
      state.character,
      Number(state.sprite_preview_index || 0) + delta
    );
  }
}

/** Show a random saved sprite when there are any, else the cached preview. */
async function loadCharacterPreview(
  character: string,
  isCurrent: () => boolean,
  isCurrentPreview: () => boolean
): Promise<void> {
  const count = await fetchPosePreviewCount(studioHttp(), character);
  if (!(isCurrent() && isCurrentPreview())) {
    return;
  }
  store().patchState((state) => {
    state.sprite_preview_count = count;
    state.sprite_preview_cache_bust = `${character}:${Date.now()}`;
  });
  if (count > 0) {
    await showSpritePreview(character, Math.floor(Math.random() * count));
  } else {
    await tryCachePreview(character);
  }
}

/**
 * Select a character: read its metadata (unless the saved widget data already
 * holds it), then its preview. Resolves true when the selection stuck.
 */
export async function loadCharacter(
  name: string,
  skipInfoLoad = false
): Promise<boolean> {
  beginWizardRequest();
  const isCurrentRequest = beginCharacterRequest();
  const isCurrentPreview = beginPreviewRequest();
  const original = currentCharacter();
  const isCurrent = () =>
    isCurrentRequest() &&
    (currentCharacter() === original || currentCharacter() === name);
  if (!name) {
    return false;
  }
  try {
    const info = skipInfoLoad
      ? null
      : await fetchCharacterInfo(studioHttp(), name);
    if (!isCurrent()) {
      return false;
    }
    store().update((model) => {
      if (info) {
        model.loadCharacterInfo(name, info);
      } else {
        model.state.character = name;
      }
    });
    if (isCurrentPreview()) {
      await loadCharacterPreview(name, isCurrent, isCurrentPreview);
    }
    return isCurrent();
  } catch (error) {
    if (isCurrent()) {
      toast.error("Character Load Failed", { description: errorText(error) });
    }
    return false;
  }
}

export function clearCharacterSelection(): void {
  beginCharacterRequest();
  beginWizardRequest();
  beginPreviewRequest();
  store().update((model) => model.clearCharacterSelection());
  store().setPreview({
    loading: false,
    message: "Create a character to begin",
    url: null,
  });
}

/** The widget's `init()`: lists, styles and presets, saved state, then the selected character. */
export async function initCreator(): Promise<void> {
  const http = studioHttp();
  try {
    const [lists, styles, presets] = await Promise.all([
      fetchContextLists(http),
      fetchStyleCatalog(http).catch(() => EMPTY_STYLE_CATALOG),
      fetchPresetCatalog(http).catch(() => null),
    ]);
    store().set({ lists, loadError: null, presets, styles });
    const { state, restoredInfoCharacter } = parseCreatorState(
      store().widgetData,
      defaultStyleId(styles)
    );
    store().setState(initializeCreatorState(state, creatorContext()));
    const characters = lists.characters;
    const saved = store().state?.character ?? "";
    const selected = characters.includes(saved) ? saved : characters[0] || "";
    if (selected) {
      await loadCharacter(selected, restoredInfoCharacter === selected);
    } else {
      clearCharacterSelection();
    }
  } catch (error) {
    store().set({ loadError: errorText(error) });
  }
}

/** GENERATE PREVIEW: render outside the queue and show the result. */
export async function generateCreatorPreview(): Promise<void> {
  const problem = currentCreatorModel()?.previewProblem();
  if (problem) {
    toast.error(problem.title, { description: problem.message });
    return;
  }
  store().update((model) => {
    model.randomizeSeedIfNeeded();
  });
  const model = currentCreatorModel();
  if (!model) {
    return;
  }
  const character = model.state.character;
  const isCurrentRequest = beginPreviewRequest();
  const isCurrent = () =>
    isCurrentRequest() && currentCharacter() === character;
  store().set({ previewRunning: true });
  try {
    const image = await generatePreview(studioHttp(), model.previewPayload());
    if (isCurrent() && image) {
      store().setPreview({ loading: false, message: "", url: image });
      store().update(
        (next) => {
          next.state.preview_source = "gen";
          next.state.sprite_preview_count = 0;
          next.state.sprite_preview_index = 0;
        },
        { previewValid: true }
      );
    }
  } catch (error) {
    if (isCurrent()) {
      toast.error("Preview failed", { description: errorText(error) });
    }
  } finally {
    store().set({ previewRunning: false });
  }
}

export async function createNewCharacter(name: string): Promise<boolean> {
  await createCharacter(studioHttp(), name);
  const lists = store().lists;
  if (lists && !lists.characters.includes(name)) {
    store().set({
      lists: { ...lists, characters: [...lists.characters, name] },
    });
  }
  return loadCharacter(name);
}

export async function deleteCurrentCharacter(): Promise<void> {
  const name = currentCharacter();
  if (!name) {
    return;
  }
  await deleteCharacter(studioHttp(), name);
  const lists = store().lists;
  const characters = (lists?.characters ?? []).filter((item) => item !== name);
  if (lists) {
    store().set({ lists: { ...lists, characters } });
  }
  clearCharacterSelection();
  if (characters[0]) {
    await loadCharacter(characters[0]);
  }
}

const STEP1_GENERATOR: GeneratorTarget = {
  kind: "base",
  nodeId: CREATOR_IDS.generator,
};

/**
 * Queue Step 1 (Control Center → Creator → Pose Studio → Character
 * Generator), with the checks the widgets ran before ComfyUI's queue.
 * Resolves true once the run finished.
 */
export async function queueCharacterSheets(
  sources: GeneratorSources
): Promise<boolean> {
  const model = currentCreatorModel();
  const problem = model?.previewProblem();
  if (!model || problem) {
    toast.error(problem?.title ?? "Creator not ready", {
      description: problem?.message ?? "Wait for the Creator to load.",
    });
    return false;
  }
  const host = usePoseStudioStore.getState().host;
  if (!(host?.nodeId === CREATOR_IDS.pose && host.ready)) {
    toast.error("Pose Studio is not ready", {
      description:
        host?.error ??
        "Wait for Pose Studio to finish loading, then try again.",
    });
    return false;
  }
  syncGenerator(STEP1_GENERATOR, sources);
  const seedvrProblem = nativeSeedvrProblem(
    generatorData(STEP1_GENERATOR),
    useGeneratorStore.getState().schemas
  );
  if (seedvrProblem) {
    toast.error("ComfyUI Update Required", { description: seedvrProblem });
    return false;
  }
  if (model.settings.seed_mode === "randomize") {
    store().update((next) => {
      next.randomizeSeedIfNeeded();
    });
  }
  const creator = store().state;
  if (!creator) {
    return false;
  }
  const { nodeState, repoId } = useControlCenterStore.getState();
  const prompt = buildCharacterCreatorPrompt({
    controlCenter: { nodeState, repoId },
    source: { widgetData: serializeCreatorState(creator) },
    poseStudio: { poseData: currentPoseData(CREATOR_IDS.pose) },
    generator: { widgetData: prepareGeneratorRun(STEP1_GENERATOR) },
  });
  try {
    await runPrompt(`Character sheets · ${creator.character}`, prompt);
    return true;
  } catch (error) {
    toast.error("Run failed", { description: errorText(error) });
    return false;
  }
}

/** CHARACTER WIZZARD: expand a description into the trait fields. Resolves false when stale. */
export async function runWizard(description: string): Promise<boolean> {
  const character = currentCharacter();
  const isCurrentRequest = beginWizardRequest();
  const data = await runCharacterWizard(
    studioHttp(),
    description,
    CREATOR_IDS.source
  );
  if (!isCurrentRequest() || currentCharacter() !== character) {
    return false;
  }
  store().update((model) => model.applyWizardData(data));
  return true;
}
