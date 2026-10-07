import type { CatalogEntry, DownloadStatusMap } from "./control-center";
import { type DownloadCategory, downloadKey } from "./control-center";
import {
  type CreatorCatalog,
  ccKind,
  ccRelPath,
  ccType,
  type LocalAssets,
  type LoraSlot,
  type ModelEntry,
  mergeCcAndLocalEntries,
  type Qi2CacheSettings,
  type TurboPrevious,
} from "./creator-state";
import type { EmotionEntry } from "./emotions";
import type { EmotionStepInput, JsonState } from "./graphs";

/**
 * Emotion Studio (`EmotionGeneratorV2`) state, ported from
 * `web/vnccs_emotion_v2.js`. The widget kept its inputs in hidden widgets:
 * `character`, `costumes_data` and `emotions_data` (selection order),
 * `generation_settings`, and `generation_model` / `prompt_style`. Studio
 * generates emotions with Qwen Image 2.1 only; the node's Anima and
 * Illustrious families are not offered.
 */

const QI2_TURBO_LORA_NAME =
  "QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors";
const QI2_MODEL_NAME = "qwen_image_2.1_int8_convrot.safetensors";
const QI2_CLIP_NAME = "qwen3vl_8b_int8_convrot.safetensors";
const QI2_VAE_NAME = "qwen_image_2.1_vae_bf16.safetensors";
/** How Comfy-Org and most finetunes name Qwen Image 2.x diffusion models. */
const QI2_FILE_NAME = /qwen[-_ ]?image[-_ ]?2/i;
const LORA_SLOTS = 5;
const MAX_SEED = 9_007_199_254_740_991;

export const EMOTION_SAMPLER_FALLBACK = [
  "euler",
  "er_sde",
  "dpmpp_2m",
  "dpmpp_sde",
  "dpmpp_3m_sde",
];
export const EMOTION_SCHEDULER_FALLBACK = [
  "normal",
  "simple",
  "karras",
  "exponential",
  "sgm_uniform",
];

/** The widget's FIELD_HELP. */
export const EMOTION_FIELD_HELP = {
  steps:
    "Number of sampling steps for each emotion image. Higher values can add detail but take longer.",
  sampler: "Sampling algorithm used to denoise emotion generations.",
  cfg: "Prompt guidance strength. Higher values follow the emotion prompt more strongly.",
  scheduler: "Noise schedule used together with the sampler.",
  seed: "Numeric seed for reproducible emotion generations.",
  seed_mode:
    "Toggles fixed seed versus a fresh random seed for each generation.",
  lora_stack: "Additional LoRAs mixed into emotion generation.",
  lora_strength: "Strength of the LoRA in this row.",
} as const;

/** The `generation_settings` input. */
export interface EmotionGenSettings {
  cfg?: number;
  clip_name?: string;
  clip_type?: string;
  diffusion_model_name?: string;
  dmd_lora_name?: string;
  dmd_lora_strength?: number;
  generation_mode: "qi2";
  lora_stack?: LoraSlot[];
  qi2_cache?: Qi2CacheSettings;
  sampler?: string;
  scheduler?: string;
  seed?: number;
  seed_mode?: string;
  /** Absent means every pose. */
  selected_pose_indices?: number[];
  steps?: number;
  turbo_enabled?: boolean;
  turbo_previous_settings?: TurboPrevious | null;
  vae_name?: string;
  [key: string]: unknown;
}

export interface EmotionStudioState {
  character: string;
  /**
   * `costumes_data`. Null until a costume list was seen; the first list
   * then selects every costume.
   */
  costumes: string[] | null;
  /** `emotions_data`: safe names in the order they were picked. */
  emotions: string[];
  gen: EmotionGenSettings;
  /** The pose chips' selection; null selects every pose. */
  poses: number[] | null;
}

/** What the model reads besides its own state. */
export interface EmotionContext {
  catalog: CreatorCatalog | null;
  downloads: DownloadStatusMap;
  local: LocalAssets;
  /** Pose sprites the preview found for the character (without a costume). */
  poseCount: number;
}

export interface EmotionPair {
  costume: string;
  emotion: string;
}

/** What the Emotions Generator read from its connected Emotion Studio. */
export interface EmotionGeneratorSources {
  character: string;
  emotionMode: string;
  emotionPairs: EmotionPair[];
}

export interface EmotionProblem {
  message: string;
  title: string;
}

export interface EmotionTurboCard {
  enabled: boolean;
  entry: CatalogEntry;
  /** A stand-in when the catalog lists no turbo LoRA; it cannot be downloaded. */
  fallback: boolean;
  rel: string;
}

function emptyLoraStack(): LoraSlot[] {
  return Array.from({ length: LORA_SLOTS }, () => ({ name: "", strength: 1 }));
}

/** The widget's QI2 profile in GENERATION_DEFAULTS. */
export function emotionGenerationDefaults(): EmotionGenSettings {
  return {
    generation_mode: "qi2",
    diffusion_model_name: QI2_MODEL_NAME,
    clip_name: QI2_CLIP_NAME,
    vae_name: QI2_VAE_NAME,
    clip_type: "qwen_image",
    sampler: "euler",
    scheduler: "simple",
    steps: 25,
    cfg: 3,
    seed: 0,
    seed_mode: "fixed",
    turbo_enabled: false,
    turbo_previous_settings: null,
    dmd_lora_name: QI2_TURBO_LORA_NAME,
    dmd_lora_strength: 1,
    qi2_cache: { device: "gpu", dtype: "int8" },
    lora_stack: emptyLoraStack(),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonRecord(
  raw: JsonState | null | undefined
): Record<string, unknown> | null {
  if (typeof raw !== "string") {
    return raw ? asRecord(structuredClone(raw)) : null;
  }
  if (!raw) {
    return null;
  }
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * The saved settings shallowly over the defaults. The widget kept one profile
 * per family under `mode_settings`; settings saved while Anima or Illustrious
 * was active restore their QI2 profile, or the defaults when there is none.
 */
export function parseGenerationSettings(
  raw: JsonState | null | undefined
): EmotionGenSettings {
  const { mode_settings: profiles, ...saved } = parseJsonRecord(raw) ?? {};
  const qi2 =
    saved.generation_mode === "qi2" ? saved : asRecord(asRecord(profiles)?.qi2);
  const defaults = emotionGenerationDefaults();
  return {
    ...defaults,
    ...qi2,
    generation_mode: "qi2",
    seed: saved.seed ?? defaults.seed,
    seed_mode: saved.seed_mode ?? defaults.seed_mode,
    selected_pose_indices: saved.selected_pose_indices,
  } as EmotionGenSettings;
}

function poseIndices(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const indices = new Set<number>();
  for (const item of value) {
    const index = Number.parseInt(String(item), 10);
    if (Number.isInteger(index) && index > 0) {
      indices.add(index);
    }
  }
  return [...indices];
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((item) => typeof item === "string"))];
}

export function defaultEmotionStudioState(): EmotionStudioState {
  return {
    character: "",
    costumes: null,
    emotions: [],
    gen: emotionGenerationDefaults(),
    poses: null,
  };
}

/** Restore saved state; the pose selection is read back from the settings. */
export function parseEmotionStudioState(
  raw: JsonState | null | undefined
): EmotionStudioState {
  const state = defaultEmotionStudioState();
  const parsed = parseJsonRecord(raw);
  if (!parsed) {
    return state;
  }
  state.character =
    typeof parsed.character === "string" ? parsed.character : "";
  state.costumes = Array.isArray(parsed.costumes)
    ? uniqueStrings(parsed.costumes)
    : null;
  state.emotions = uniqueStrings(parsed.emotions);
  state.gen = parseGenerationSettings(parsed.gen as JsonState | undefined);
  state.poses = poseIndices(state.gen.selected_pose_indices);
  return state;
}

export function serializeEmotionStudioState(state: EmotionStudioState): string {
  return JSON.stringify(state);
}

const SLASHES = /\\/g;

function slashes(value: unknown): string {
  return String(value || "").replace(SLASHES, "/");
}

const TRANSIENT = new Set(["queued", "downloading", "error", "auth_required"]);

/**
 * Model over one Emotion Studio state. Mutating methods are ported from the
 * widget closures and are only called through
 * {@link updateEmotionStudioState}, which works on a copy.
 */
export class EmotionStudioModel {
  readonly context: EmotionContext;
  readonly state: EmotionStudioState;

  constructor(state: EmotionStudioState, context: EmotionContext) {
    this.state = state;
    this.context = context;
  }

  get gen(): EmotionGenSettings {
    return this.state.gen;
  }

  // --- Pose selection ----------------------------------------------------------

  selectedPoseIndexList(): number[] | null {
    if (this.state.poses === null) {
      return null;
    }
    const count = this.context.poseCount;
    return this.state.poses
      .filter((index) => Number.isInteger(index) && index > 0)
      .filter((index) => !count || index <= count)
      .sort((a, b) => a - b);
  }

  isPoseSelected(index: number): boolean {
    return this.state.poses === null || this.state.poses.includes(index);
  }

  selectedPoseCount(): number {
    const count = this.context.poseCount;
    if (count <= 0) {
      return 0;
    }
    return this.state.poses === null
      ? count
      : (this.selectedPoseIndexList() ?? []).length;
  }

  poseSummary(): string {
    const count = this.context.poseCount;
    return count > 0
      ? `${this.selectedPoseCount()}/${count} selected`
      : "No poses";
  }

  /** A pose chip: the first click on "all" makes the selection explicit. */
  togglePose(index: number): void {
    const poses =
      this.state.poses ??
      Array.from({ length: this.context.poseCount }, (_, item) => item + 1);
    this.state.poses = poses.includes(index)
      ? poses.filter((item) => item !== index)
      : [...poses, index];
  }

  selectAllPoses(): void {
    this.state.poses = null;
  }

  clearAllPoses(): void {
    this.state.poses = [];
  }

  /** After the preview counted the sprites, drop chips beyond the count. */
  trimPoseSelection(): void {
    if (this.state.poses !== null) {
      this.state.poses = this.selectedPoseIndexList() ?? [];
    }
  }

  // --- Generation settings -----------------------------------------------------

  /** `saveGenerationSettings`: the pose selection travels in the settings the node receives. */
  saveGenerationSettings(): void {
    // Undefined drops the key from the JSON the node receives, which reads as "every pose".
    this.gen.selected_pose_indices = this.selectedPoseIndexList() ?? undefined;
  }

  setValue(key: string, value: unknown): void {
    this.gen[key] = value;
  }

  setLoraSlot(index: number, patch: Partial<LoraSlot>): void {
    const stack = this.loraRows();
    const slot = stack[index];
    if (slot) {
      stack[index] = { ...slot, ...patch };
      this.gen.lora_stack = stack;
    }
  }

  /** The stack rows; missing rows read as an empty slot. */
  loraRows(): LoraSlot[] {
    const stack = Array.isArray(this.gen.lora_stack) ? this.gen.lora_stack : [];
    return Array.from({ length: LORA_SLOTS }, (_, index) => ({
      name: stack[index]?.name || "",
      strength: stack[index]?.strength ?? 1,
    }));
  }

  setQi2Cache(patch: Partial<Qi2CacheSettings>): void {
    this.gen.qi2_cache = {
      ...(this.gen.qi2_cache ?? {}),
      ...patch,
    } as Qi2CacheSettings;
  }

  toggleSeedMode(): void {
    this.gen.seed_mode =
      (this.gen.seed_mode || "fixed") === "randomize" ? "fixed" : "randomize";
  }

  /** Before a queued run, like `_randomizeSeedIfNeeded`. */
  randomizeSeedIfNeeded(random: () => number = Math.random): boolean {
    if ((this.gen.seed_mode || "fixed") !== "randomize") {
      return false;
    }
    this.gen.seed = Math.floor(random() * MAX_SEED);
    return true;
  }

  /** A turbo card toggle: Viggle runs 6 euler/simple steps at CFG 1; off restores steps and CFG. */
  setCcTurboMode(enabled: boolean, rel: string): void {
    const g = this.gen;
    if (enabled && !g.turbo_enabled) {
      g.turbo_previous_settings = { steps: g.steps, cfg: g.cfg };
    }
    g.turbo_enabled = enabled;
    g.dmd_lora_name = rel || g.dmd_lora_name || QI2_TURBO_LORA_NAME;
    g.dmd_lora_strength = enabled ? 1 : 0;
    if (enabled) {
      g.steps = 6;
      g.cfg = 1;
      g.sampler = "euler";
      g.scheduler = "simple";
    } else {
      const previous = g.turbo_previous_settings ?? {};
      g.steps = previous.steps ?? 25;
      g.cfg = previous.cfg ?? 3;
      g.turbo_previous_settings = null;
    }
  }

  // --- Models --------------------------------------------------------------------

  private qi2Entries(section: keyof CreatorCatalog): CatalogEntry[] {
    return (this.context.catalog?.[section] ?? []).filter(
      (entry) => ccKind(entry) === "qi2"
    );
  }

  ensureQi2DefaultAux(): void {
    const g = this.gen;
    const clip = this.qi2Entries("clip")[0];
    const vae = this.qi2Entries("vae")[0];
    g.clip_name = clip ? ccRelPath(clip) : g.clip_name || QI2_CLIP_NAME;
    g.vae_name = vae ? ccRelPath(vae) : g.vae_name || QI2_VAE_NAME;
    g.clip_type = "qwen_image";
    g.qi2_cache = {
      device: g.qi2_cache?.device || "gpu",
      dtype: g.qi2_cache?.dtype || "int8",
    };
  }

  /** A catalog QI2 model or a file named like one; another family's file cannot run here. */
  isQi2Model(rel: string): boolean {
    return (
      QI2_FILE_NAME.test(rel) ||
      this.qi2Entries("models").some((entry) => ccRelPath(entry) === rel)
    );
  }

  /** The catalog QI2 models, then local files named like Qwen Image 2. */
  modelEntries(): ModelEntry[] {
    return mergeCcAndLocalEntries(
      this.qi2Entries("models").filter((entry) => ccType(entry) === "unet"),
      this.context.local.diffusion_models.filter((name) =>
        this.isQi2Model(slashes(name))
      ),
      "diffusion_models",
      "unet",
      "QI2"
    );
  }

  selectedModelRel(): string {
    return slashes(this.gen.diffusion_model_name);
  }

  /** The picker head: the selected entry, or the first one when the selection is unknown. */
  selectedModelEntry(): ModelEntry | null {
    const entries = this.modelEntries();
    const current = this.selectedModelRel();
    return (
      entries.find((entry) => ccRelPath(entry) === current) ??
      entries[0] ??
      null
    );
  }

  /** Pick a model card; this also pins the QI2 CLIP and VAE. */
  selectModel(rel: string): void {
    if (!rel) {
      return;
    }
    this.ensureQi2DefaultAux();
    this.gen.diffusion_model_name = rel;
  }

  /**
   * What rendering the model cards wrote back. An empty or non-QI2 model slot
   * (the old Anima and Illustrious profiles filled it with any local file)
   * takes the first VNCCS card.
   */
  syncCatalogDefaults(): void {
    if (!this.isQi2Model(this.selectedModelRel())) {
      const first = this.modelEntries().find(
        (entry) => entry.source !== "local"
      );
      this.selectModel(first ? ccRelPath(first) : QI2_MODEL_NAME);
    }
    this.ensureQi2DefaultAux();
  }

  /** The Viggle turbo LoRA cards, with a local stand-in when the catalog has none. */
  turboCards(): EmotionTurboCard[] {
    const g = this.gen;
    const entries: { entry: CatalogEntry; fallback: boolean }[] =
      this.qi2Entries("lora")
        .filter((entry) => ccType(entry) === "turbolora")
        .map((entry) => ({ entry, fallback: false }));
    if (entries.length === 0) {
      const installed = this.context.local.loras
        .map(slashes)
        .includes(slashes(QI2_TURBO_LORA_NAME));
      entries.push({
        fallback: true,
        entry: {
          name: "Qwen Image 2.1 Viggle Turbo",
          type: "turbolora",
          kind: "QI2",
          local_path: `models/loras/${QI2_TURBO_LORA_NAME}`,
          status: installed ? "installed" : "missing",
          description: "Six-step Viggle Turbo LoRA for Qwen Image 2.1.",
        },
      });
    }
    const dmd = slashes(g.dmd_lora_name);
    return entries.map(({ entry, fallback }) => {
      const rel = ccRelPath(entry);
      return {
        entry,
        fallback,
        rel,
        enabled: Boolean(g.turbo_enabled) && dmd === rel,
      };
    });
  }

  stackLoraOptions(): string[] {
    return this.context.local.loras;
  }

  resolveStatus(category: DownloadCategory, entry: CatalogEntry): string {
    const download = this.context.downloads[downloadKey(category, entry.name)];
    return download && TRANSIENT.has(download.status)
      ? download.status
      : entry.status || "missing";
  }

  // --- Character, costumes and emotions ------------------------------------------

  /** Choosing another character clears the emotions and the pose selection. */
  selectCharacter(name: string): void {
    if (name !== this.state.character) {
      this.state.emotions = [];
      this.state.poses = null;
    }
    this.state.character = name;
  }

  /** The costume list arrived: keep saved choices that still exist, or take all of them. */
  applyCostumeList(costumes: string[]): void {
    if (this.state.costumes === null) {
      if (costumes.length > 0) {
        this.state.costumes = [...costumes];
      }
      return;
    }
    this.state.costumes = this.state.costumes.filter((name) =>
      costumes.includes(name)
    );
  }

  isCostumeSelected(name: string): boolean {
    return (this.state.costumes ?? []).includes(name);
  }

  setCostume(name: string, selected: boolean): void {
    const current = this.state.costumes ?? [];
    if (selected) {
      this.state.costumes = current.includes(name)
        ? current
        : [...current, name];
    } else {
      this.state.costumes = current.filter((item) => item !== name);
    }
  }

  isEmotionSelected(safeName: string): boolean {
    return this.state.emotions.includes(safeName);
  }

  toggleEmotion(safeName: string): void {
    this.state.emotions = this.isEmotionSelected(safeName)
      ? this.state.emotions.filter((name) => name !== safeName)
      : [...this.state.emotions, safeName];
  }

  selectEmotions(safeNames: string[]): void {
    this.state.emotions = [...new Set([...this.state.emotions, ...safeNames])];
  }

  deselectEmotions(safeNames: string[]): void {
    const drop = new Set(safeNames);
    this.state.emotions = this.state.emotions.filter((name) => !drop.has(name));
  }

  // --- Queue -----------------------------------------------------------------------

  /** `_validateBeforeQueue`. */
  queueProblem(): EmotionProblem | null {
    const costumes = this.state.costumes ?? [];
    const emotions = this.state.emotions;
    if (costumes.length === 0 && emotions.length === 0) {
      return {
        title: "Nothing selected",
        message:
          "Please select at least one costume and one emotion before running.",
      };
    }
    if (costumes.length === 0) {
      return {
        title: "No costumes selected",
        message: "Please enable at least one costume.",
      };
    }
    if (emotions.length === 0) {
      return {
        title: "No emotions selected",
        message: "Please select at least one emotion.",
      };
    }
    if (
      this.state.poses !== null &&
      (this.selectedPoseIndexList() ?? []).length === 0
    ) {
      return {
        title: "No poses selected",
        message: "Select at least one pose in Generate poses.",
      };
    }
    return null;
  }

  /** The generator's stages: one per costume and emotion, costume-major like the node's loop. */
  emotionPairs(): EmotionPair[] {
    const pairs: EmotionPair[] = [];
    for (const costume of this.state.costumes ?? []) {
      for (const emotion of this.state.emotions) {
        pairs.push({ costume, emotion });
      }
    }
    return pairs;
  }

  generatorSources(): EmotionGeneratorSources {
    return {
      character: this.state.character,
      emotionMode: "qi2",
      emotionPairs: this.emotionPairs(),
    };
  }

  /** The EmotionGeneratorV2 inputs. */
  sourceInputs(): EmotionStepInput["source"] {
    return {
      character: this.state.character,
      costumes: [...(this.state.costumes ?? [])],
      emotions: [...this.state.emotions],
      generationModel: "QI2",
      generationSettings: JSON.stringify(this.gen),
      // The node derives the style from the family; this is the value the widget sent for QI2.
      promptStyle: "SDXL Style",
    };
  }
}

/** A model over a private copy of the state, for reads. */
export function viewEmotionStudioState(
  state: EmotionStudioState,
  context: EmotionContext
): EmotionStudioModel {
  return new EmotionStudioModel(structuredClone(state), context);
}

/** Apply one user action and return the state the widget would have saved. */
export function updateEmotionStudioState(
  state: EmotionStudioState,
  context: EmotionContext,
  mutate: (model: EmotionStudioModel) => void
): EmotionStudioState {
  const model = new EmotionStudioModel(structuredClone(state), context);
  mutate(model);
  model.syncCatalogDefaults();
  model.saveGenerationSettings();
  return model.state;
}

/** Init: the saved state with the QI2 text encoder and VAE pinned and the pose selection saved. */
export function initializeEmotionStudioState(
  state: EmotionStudioState,
  context: EmotionContext
): EmotionStudioState {
  return updateEmotionStudioState(state, context, () => undefined);
}

// --- Emotion list ---------------------------------------------------------------------

/** The search box: case-insensitive on the safe name or the description. */
export function filterEmotions(
  emotions: EmotionEntry[],
  term: string
): EmotionEntry[] {
  if (!term) {
    return emotions;
  }
  const needle = term.toLowerCase();
  return emotions.filter(
    (emotion) =>
      emotion.safe_name.toLowerCase().includes(needle) ||
      (emotion.description || "").toLowerCase().includes(needle)
  );
}

export interface SelectAllButton {
  action: "select" | "cancel" | "none";
  disabled: boolean;
  label: string;
}

/** The footer button: select the visible emotions, or cancel them once all are selected. */
export function selectAllButton(
  filtered: EmotionEntry[],
  selected: readonly string[]
): SelectAllButton {
  if (filtered.length === 0) {
    return { action: "none", disabled: true, label: "No Emotions Found" };
  }
  const chosen = new Set(selected);
  return filtered.every((emotion) => chosen.has(emotion.safe_name))
    ? { action: "cancel", disabled: false, label: "Cancel Selection" }
    : { action: "select", disabled: false, label: "Select ALL" };
}

/** The confirmation before selecting every visible emotion. */
export function selectVisibleSummary(
  emotions: number,
  costumes: number,
  poses: number
): string {
  return `Emotions: ${emotions}\nCostumes: ${costumes}\nPoses: ${poses}\nTotal: ${emotions * costumes * poses} images.`;
}

/** The selected emotions as cards; names the list does not know show without a description. */
export function selectedEmotionEntries(
  emotions: EmotionEntry[],
  selected: readonly string[]
): EmotionEntry[] {
  const byName = new Map(
    emotions.map((emotion) => [emotion.safe_name, emotion])
  );
  return selected.map(
    (name) =>
      byName.get(name) ?? {
        category: "",
        description: "",
        key: name,
        natural_prompt: "",
        safe_name: name,
      }
  );
}

/** A saved custom emotion replaces any entry with the same safe name. */
export function addEmotionEntry(
  emotions: EmotionEntry[],
  emotion: EmotionEntry
): EmotionEntry[] {
  return [
    ...emotions.filter((item) => item.safe_name !== emotion.safe_name),
    emotion,
  ];
}
