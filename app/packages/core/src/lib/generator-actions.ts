import { studioHttp } from "@workspace/core/lib/studio";
import {
  type GeneratorTarget,
  targetKey,
  useGeneratorStore,
} from "@workspace/core/stores/generator-store";
import {
  applyProgressSnapshot,
  beginRegenerate,
  fetchNodeSchemas,
  fetchProgress,
  fetchSeedvrAttention,
  fetchSeedvrDownloads,
  fetchSeedvrModels,
  type GeneratorData,
  GeneratorModel,
  initialGeneratorView,
  NATIVE_SEEDVR_NODE_NAMES,
  nativeSeedvrProblem,
  parseGeneratorData,
  progressScope,
  regenerateData,
  requestRegenerate,
  requestSeedvrDownload,
  type SeedvrEntry,
  selectPreview,
  serializeGeneratorData,
  syncViewStages,
  updateGeneratorData,
} from "@workspace/vnccs/character-generator";
import type { NodeState } from "@workspace/vnccs/control-center-state";
import { toast } from "sonner";

/**
 * The Character Generator widget's async flows (live schemas, SeedVR assets,
 * progress, Regenerate), ported from `web/vnccs_character_generator.js`. One
 * module serves every generator node; each call names its target.
 */

/** Nodes whose live schemas the generator settings read, as the widget's `loadNodeDefs`. */
const SCHEMA_NODES = [
  "VNCCS_QWEN_Encoder",
  "TextEncodeQwenImage21",
  "QwenImage21Cache",
  "KSampler",
  "VAEDecodeTiled",
  "UNETLoader",
  "VAELoader",
  ...NATIVE_SEEDVR_NODE_NAMES,
  "VNCCSChromaKey",
  "UltralyticsDetectorProvider",
  "SAMLoader",
  "FaceDetailer",
  "LoadSam3Model",
  "easy sam3ModelLoader",
  "Sam3ImageSegmentation",
  "easy sam3ImageSegmentation",
];

const SEEDVR_POLL_MS = 2000;
const DEFAULT_DATA = parseGeneratorData(null);

export interface GeneratorSources {
  character?: string;
  emotionMode?: string;
  nodeState?: NodeState;
  nsfw?: unknown;
}

function store() {
  return useGeneratorStore.getState();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function generatorData(target: GeneratorTarget): GeneratorData {
  return store().data[targetKey(target)] ?? DEFAULT_DATA;
}

export function generatorScope(target: GeneratorTarget): string {
  return progressScope(store().workflowId, target.kind, target.nodeId);
}

function stageInfo(target: GeneratorTarget, data: GeneratorData) {
  const model = new GeneratorModel(data, target.kind);
  const stages = model.stages();
  return {
    fallback: model.defaultPreviewStage(),
    keys: stages.map((stage) => stage.key),
    stages,
  };
}

/** Create the generator's data and view the first time a page shows it. */
export function ensureGenerator(target: GeneratorTarget): void {
  const key = targetKey(target);
  if (!store().data[key]) {
    store().setData(key, structuredClone(DEFAULT_DATA));
  }
  if (!store().views[key]) {
    const data = generatorData(target);
    const { fallback, stages } = stageInfo(target, data);
    store().setView(key, initialGeneratorView(stages, data, fallback));
  }
}

function commit(target: GeneratorTarget, data: GeneratorData): void {
  const key = targetKey(target);
  store().setData(key, data);
  const view = store().views[key];
  if (view) {
    const { fallback, stages } = stageInfo(target, data);
    const next = syncViewStages(view, stages, fallback);
    if (next !== view) {
      store().setView(key, next);
    }
  }
}

export function updateGenerator(
  target: GeneratorTarget,
  mutate: (model: GeneratorModel) => void
): void {
  commit(
    target,
    updateGeneratorData(generatorData(target), target.kind, mutate)
  );
}

/** Follow the source node and the Control Center model; saves only on a real change. */
export function syncGenerator(
  target: GeneratorTarget,
  sources: GeneratorSources
): GeneratorData {
  const current = generatorData(target);
  const next = updateGeneratorData(current, target.kind, (model) => {
    model.syncCharacterSource(sources);
    model.syncModelResolution(sources);
  });
  if (JSON.stringify(next) !== JSON.stringify(current)) {
    commit(target, next);
  }
  return generatorData(target);
}

/** Before a normal queue: the widget data to send, filed under this workflow's scope. */
export function prepareGeneratorRun(target: GeneratorTarget): string {
  const scope = generatorScope(target);
  updateGenerator(target, (model) => model.prepareQueuedRun(scope));
  return serializeGeneratorData(generatorData(target));
}

export function selectGeneratorPreview(
  target: GeneratorTarget,
  stage: string
): void {
  const key = targetKey(target);
  const view = store().views[key];
  if (view && (view.selectedPreview !== stage || !view.userSelectedPreview)) {
    store().setView(key, selectPreview(view, stage));
  }
}

// --- Live schemas and SeedVR assets --------------------------------------------

let support: { base: string; request: Promise<string | null> } | null = null;
let seedvrWarned = false;

function loadSupport(): Promise<string | null> {
  const http = studioHttp();
  if (support?.base !== http.baseUrl) {
    const request = (async () => {
      const [schemas, attention, seedvr] = await Promise.all([
        fetchNodeSchemas(http, SCHEMA_NODES),
        fetchSeedvrAttention(http)
          .then((info) => info.current ?? null)
          .catch(() => null),
        fetchSeedvrModels(http).catch(() => null),
      ]);
      store().set({ schemas, seedvr: seedvr ?? store().seedvr });
      return attention;
    })();
    support = { base: http.baseUrl, request };
    request.catch(() => {
      support = null;
    });
  }
  return support.request;
}

/**
 * Live option lists, the SeedVR catalog and the detected attention backend,
 * loaded once per server. Warns once when native SeedVR2 is missing.
 */
export async function loadGeneratorSupport(
  target: GeneratorTarget,
  options: { force?: boolean } = {}
): Promise<void> {
  if (options.force) {
    support = null;
  }
  let attention: string | null;
  try {
    attention = await loadSupport();
  } catch {
    return;
  }
  const data = generatorData(target);
  const next = updateGeneratorData(data, target.kind, (model) =>
    model.adoptDetectedAttention(attention)
  );
  if (next.upscaler.attention_mode !== data.upscaler.attention_mode) {
    commit(target, next);
  }
  const problem = nativeSeedvrProblem(next, store().schemas);
  if (problem && !seedvrWarned) {
    seedvrWarned = true;
    toast.warning("ComfyUI Update Required", { description: problem });
  }
}

export async function loadSeedvrCatalog(refresh = false): Promise<void> {
  try {
    store().set({ seedvr: await fetchSeedvrModels(studioHttp(), refresh) });
  } catch {
    // The cards keep their last state; a later refresh retries.
  }
}

let seedvrPoll: ReturnType<typeof setInterval> | null = null;

async function pollSeedvrDownloads(): Promise<void> {
  let downloads: Awaited<ReturnType<typeof fetchSeedvrDownloads>>;
  try {
    downloads = await fetchSeedvrDownloads(studioHttp());
  } catch {
    return;
  }
  store().set({ seedvrDownloads: downloads });
  const active = Object.values(downloads).some(
    (item) => item?.status === "queued" || item?.status === "downloading"
  );
  if (!active && seedvrPoll) {
    clearInterval(seedvrPoll);
    seedvrPoll = null;
    await loadSeedvrCatalog(true);
  }
}

export async function downloadSeedvrAsset(entry: SeedvrEntry): Promise<void> {
  const key = `${entry.category}:${entry.name}`;
  const setDownload = (state: { message?: string; status: string }) =>
    store().set({
      seedvrDownloads: { ...store().seedvrDownloads, [key]: state },
    });
  setDownload({ status: "queued", message: "Queued" });
  try {
    await requestSeedvrDownload(studioHttp(), entry.category, entry.name);
  } catch (error) {
    setDownload({ status: "error", message: errorText(error) });
    return;
  }
  seedvrPoll ??= setInterval(pollSeedvrDownloads, SEEDVR_POLL_MS);
}

// --- Progress ------------------------------------------------------------------

/** Per target: whether another refresh was asked for while one was in flight. */
const refreshing = new Map<string, boolean>();

async function refreshOnce(target: GeneratorTarget): Promise<void> {
  const key = targetKey(target);
  const scope = generatorScope(target);
  let snapshot: Awaited<ReturnType<typeof fetchProgress>>;
  try {
    snapshot = await fetchProgress(studioHttp(), scope);
  } catch {
    // Offline: keep showing the last known state.
    return;
  }
  const view = store().views[key];
  if (!view) {
    return;
  }
  const cursor = view.cursor;
  if (
    snapshot &&
    cursor?.scope === scope &&
    cursor.epoch === snapshot.epoch &&
    cursor.revision === snapshot.revision &&
    view.runId === (snapshot.run_id ?? null)
  ) {
    return;
  }
  const { keys } = stageInfo(target, generatorData(target));
  const next = applyProgressSnapshot(view, snapshot, {
    nodeId: target.nodeId,
    scope,
    stageKeys: keys,
  });
  if (next !== view) {
    store().setView(key, next);
  }
}

/** Fold the server's progress snapshot into the view; calls during a refresh coalesce. */
export async function refreshGeneratorProgress(
  target: GeneratorTarget
): Promise<void> {
  const key = targetKey(target);
  if (refreshing.has(key)) {
    refreshing.set(key, true);
    return;
  }
  try {
    do {
      refreshing.set(key, false);
      await refreshOnce(target);
    } while (refreshing.get(key));
  } finally {
    refreshing.delete(key);
  }
}

/**
 * Regenerate from one stage (or one image of it) with the cached inputs of
 * the last normal run. The request blocks until the server finishes; progress
 * polling shows the stages meanwhile. When the server never started, the
 * previous results come back.
 */
export async function regenerateStage(
  target: GeneratorTarget,
  sources: GeneratorSources,
  stage: string,
  imageIndex: number | null = null
): Promise<void> {
  const key = targetKey(target);
  const data = syncGenerator(target, sources);
  const { keys } = stageInfo(target, data);
  const before = store().views[key];
  if (!(before && keys.includes(stage))) {
    return;
  }
  const requestId = crypto.randomUUID();
  const scope = generatorScope(target);
  store().setView(
    key,
    beginRegenerate(before, keys, stage, imageIndex, requestId)
  );
  const isPending = () =>
    store().views[key]?.regenerate?.requestId === requestId;
  try {
    await requestRegenerate(studioHttp(), {
      data: regenerateData(data, { imageIndex, requestId, scope, stage }),
      imageIndex,
      kind: target.kind,
      nodeId: target.nodeId,
      stage,
    });
    const view = store().views[key];
    if (view && isPending()) {
      store().setView(key, { ...view, regenerate: null });
    }
    await refreshGeneratorProgress(target);
  } catch (error) {
    const view = store().views[key];
    if (!(view && isPending())) {
      return;
    }
    store().setView(
      key,
      view.regenerate?.sawStageEvent
        ? { ...view, regenerate: null }
        : { ...before, regenerate: null }
    );
    toast.error("Regenerate Failed", { description: errorText(error) });
  }
}
