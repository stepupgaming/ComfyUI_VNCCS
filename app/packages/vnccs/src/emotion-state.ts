import type { CatalogEntry, DownloadStatusMap } from "./control-center";
import { type DownloadCategory, downloadKey } from "./control-center";
import type { ContextLists } from "./creator";
import {
  type CreatorCatalog,
  ccKind,
  ccRelPath,
  ccType,
  type GenerationMode,
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
 * `generation_settings` (the flat settings of the active family plus a
 * profile per family under `mode_settings`), and `generation_model` /
 * `prompt_style`, which follow the family.
 */

export const EMOTION_GENERATION_MODES: {
  label: string;
  mode: GenerationMode;
}[] = [
  { mode: "qi2", label: "Qwen Image 2.1" },
  { mode: "anima", label: "Anima" },
  { mode: "illustrious", label: "Illustrious" },
];

const ANIMA_TURBO_LORA_NAME = "anima\\anima-turbo-lora-v0.1.safetensors";
const ANIMA_CLIP_NAME = "qwen_3_06b_base.safetensors";
const ANIMA_VAE_NAME = "qwen_image_vae.safetensors";
const QI2_TURBO_LORA_NAME =
  "QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors";
const QI2_MODEL_NAME = "qwen_image_2.1_int8_convrot.safetensors";
const QI2_CLIP_NAME = "qwen3vl_8b_int8_convrot.safetensors";
const QI2_VAE_NAME = "qwen_image_2.1_vae_bf16.safetensors";
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

export const EMOTION_EMPTY_MODELS: Record<GenerationMode, string> = {
  anima: "No Anima diffusion models found.",
  illustrious: "No Illustrious checkpoints found.",
  qi2: "No Qwen Image 2.1 diffusion models found.",
};

export const EMOTION_LORA_HEADERS: Record<GenerationMode, string> = {
  anima: "Anima LoRA Stack",
  illustrious: "Illustrious LoRA Stack",
  qi2: "Qwen Image 2.1 LoRA Stack",
};

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
  lora_stack:
    "Additional LoRAs mixed into emotion generation for the selected model mode.",
  lora_strength: "Strength of the LoRA in this row.",
} as const;

/** One family's saved settings: a copy of the flat settings without `mode_settings`. */
export interface EmotionProfile {
  cfg?: number;
  ckpt_name?: string;
  clip_name?: string;
  clip_type?: string;
  diffusion_model_name?: string;
  dmd_lora_name?: string;
  dmd_lora_strength?: number;
  generation_mode?: string;
  lora_stack?: LoraSlot[];
  qi2_cache?: Qi2CacheSettings;
  sampler?: string;
  scheduler?: string;
  seed?: number;
  seed_mode?: string;
  steps?: number;
  turbo_enabled?: boolean;
  turbo_previous_settings?: TurboPrevious | null;
  vae_name?: string;
  [key: string]: unknown;
}

/** The `generation_settings` input. */
export interface EmotionGenSettings extends EmotionProfile {
  generation_mode: string;
  mode_settings: Record<string, EmotionProfile>;
  /** Absent means every pose. */
  selected_pose_indices?: number[];
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

/** The widget's GENERATION_DEFAULTS: the flat keys are the Anima profile. */
export function emotionGenerationDefaults(): EmotionGenSettings {
  return {
    generation_mode: "anima",
    ckpt_name: "",
    diffusion_model_name: "",
    clip_name: ANIMA_CLIP_NAME,
    vae_name: ANIMA_VAE_NAME,
    clip_type: "stable_diffusion",
    sampler: "er_sde",
    scheduler: "simple",
    steps: 30,
    cfg: 4,
    seed: 0,
    seed_mode: "fixed",
    turbo_enabled: false,
    turbo_previous_settings: null,
    dmd_lora_name: ANIMA_TURBO_LORA_NAME,
    dmd_lora_strength: 1,
    lora_stack: emptyLoraStack(),
    mode_settings: {
      illustrious: {
        ckpt_name: "",
        sampler: "euler",
        scheduler: "normal",
        steps: 20,
        cfg: 8,
        seed: 0,
        seed_mode: "fixed",
        turbo_previous_settings: null,
        dmd_lora_name: "",
        dmd_lora_strength: 1,
        lora_stack: emptyLoraStack(),
      },
      anima: {
        diffusion_model_name: "",
        clip_name: ANIMA_CLIP_NAME,
        vae_name: ANIMA_VAE_NAME,
        clip_type: "stable_diffusion",
        sampler: "er_sde",
        scheduler: "simple",
        steps: 30,
        cfg: 4,
        seed: 0,
        seed_mode: "fixed",
        turbo_enabled: false,
        turbo_previous_settings: null,
        dmd_lora_name: ANIMA_TURBO_LORA_NAME,
        dmd_lora_strength: 1,
        lora_stack: emptyLoraStack(),
      },
      qi2: {
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
      },
    },
  };
}

function isKnownMode(mode: string): mode is GenerationMode {
  return mode === "illustrious" || mode === "anima" || mode === "qi2";
}

function normalizeEmotionMode(mode: unknown): string {
  return String(mode || "anima").toLowerCase();
}

/** `prompt_style` follows the family: only Anima uses the Anima style. */
export function promptStyleForMode(mode: unknown): string {
  return normalizeEmotionMode(mode) === "anima" ? "Anima" : "SDXL Style";
}

/** `generation_model` for a family. */
export function generationModelForMode(mode: unknown): string {
  const normalized = normalizeEmotionMode(mode);
  if (normalized === "qi2") {
    return "QI2";
  }
  return normalized === "anima" ? "Anima" : "Illustrious";
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

/** `parseGenerationSettings`: the saved settings shallowly over the defaults. */
export function parseGenerationSettings(
  raw: JsonState | null | undefined
): EmotionGenSettings {
  return {
    ...emotionGenerationDefaults(),
    ...parseJsonRecord(raw),
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

  mode(): string {
    return normalizeEmotionMode(this.gen.generation_mode);
  }

  generationModel(): string {
    return generationModelForMode(this.mode());
  }

  promptStyle(): string {
    return promptStyleForMode(this.mode());
  }

  /** The family the Emotions Generator follows, or "" for an unknown one. */
  emotionMode(): string {
    const mode = this.mode();
    return isKnownMode(mode) ? mode : "";
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

  /**
   * `saveGenerationSettings`: the flat settings become the active family's
   * profile, and the shared seed is written into every profile.
   */
  saveGenerationSettings(): void {
    const g = this.gen;
    // Undefined drops the key from the JSON the node receives, which reads as "every pose".
    g.selected_pose_indices = this.selectedPoseIndexList() ?? undefined;
    const mode = this.mode();
    const seed = g.seed ?? 0;
    const seedMode = g.seed_mode || "fixed";
    g.mode_settings ??= {};
    g.seed = seed;
    g.seed_mode = seedMode;
    const { mode_settings: _profiles, ...flat } = g;
    g.mode_settings[mode] = structuredClone(flat);
    const defaults = emotionGenerationDefaults().mode_settings;
    for (const profileMode of ["illustrious", "anima", "qi2"]) {
      const profile = g.mode_settings[profileMode] ?? defaults[profileMode];
      g.mode_settings[profileMode] = {
        ...profile,
        seed,
        seed_mode: seedMode,
      };
    }
  }

  /** A family tab: store the current family, then load the other one's profile. */
  setGenerationMode(mode: string): void {
    const next = isKnownMode(mode) ? mode : "anima";
    const g = this.gen;
    const current = this.mode();
    const seed = g.seed ?? 0;
    const seedMode = g.seed_mode || "fixed";
    const profiles = g.mode_settings ?? {};
    const { mode_settings: _profiles, ...flat } = g;
    profiles[current] = structuredClone(flat);
    const defaults = emotionGenerationDefaults();
    const profile = profiles[next] ?? defaults.mode_settings[next] ?? {};
    const { mode_settings: _defaultProfiles, ...flatDefaults } = defaults;
    this.state.gen = {
      ...flatDefaults,
      ...structuredClone(profile),
      mode_settings: profiles,
      generation_mode: next,
      seed,
      seed_mode: seedMode,
    };
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

  /** `setAnimaTurboMode`: 12 steps at CFG 1; switching off restores the saved values. */
  setAnimaTurboMode(enabled: boolean, loraName = ANIMA_TURBO_LORA_NAME): void {
    const g = this.gen;
    if (this.mode() !== "anima") {
      return;
    }
    if (enabled) {
      if (!g.turbo_enabled) {
        g.turbo_previous_settings = { steps: g.steps, cfg: g.cfg };
      }
      g.turbo_enabled = true;
      g.dmd_lora_name = loraName || ANIMA_TURBO_LORA_NAME;
      g.dmd_lora_strength = 1;
      g.steps = 12;
      g.cfg = 1;
    } else {
      g.turbo_enabled = false;
      const previous = g.turbo_previous_settings ?? {};
      if (previous.steps !== undefined) {
        g.steps = previous.steps;
      }
      if (previous.cfg !== undefined) {
        g.cfg = previous.cfg;
      }
      g.turbo_previous_settings = null;
    }
  }

  /** A turbo card toggle. QI2 runs 6 euler/simple steps; Illustrious uses its DMD2 LoRA at 4. */
  setCcTurboMode(enabled: boolean, rel: string): void {
    const g = this.gen;
    const mode = this.mode();
    if (mode === "anima") {
      g.dmd_lora_name = rel || g.dmd_lora_name || "";
      this.setAnimaTurboMode(
        enabled,
        rel || g.dmd_lora_name || ANIMA_TURBO_LORA_NAME
      );
    } else if (mode === "qi2") {
      this.setQi2TurboMode(enabled, rel);
    } else {
      this.setIllustriousTurboMode(enabled, rel);
    }
  }

  private setQi2TurboMode(enabled: boolean, rel: string): void {
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

  /** Illustrious has no turbo flag: a DMD LoRA strength above 0 is "on". */
  private setIllustriousTurboMode(enabled: boolean, rel: string): void {
    const g = this.gen;
    if (enabled) {
      if ((g.dmd_lora_strength || 0) <= 0) {
        g.turbo_previous_settings = { steps: g.steps, cfg: g.cfg };
      }
      g.dmd_lora_name = rel || g.dmd_lora_name || "";
      g.dmd_lora_strength = 1;
      g.steps = 4;
      g.cfg = 1;
    } else {
      g.dmd_lora_name = "";
      g.dmd_lora_strength = 0;
      const previous = g.turbo_previous_settings ?? {};
      if (previous.steps !== undefined) {
        g.steps = previous.steps;
      }
      if (previous.cfg !== undefined) {
        g.cfg = previous.cfg;
      }
      g.turbo_previous_settings = null;
    }
  }

  // --- Models --------------------------------------------------------------------

  private ccEntries(
    section: keyof CreatorCatalog,
    kind: string | null,
    predicate?: (entry: CatalogEntry) => boolean
  ): CatalogEntry[] {
    return (this.context.catalog?.[section] ?? []).filter((entry) => {
      const kindOk = !kind || ccKind(entry) === kind.toLowerCase();
      return kindOk && (!predicate || predicate(entry));
    });
  }

  ensureAnimaDefaultAux(): void {
    const g = this.gen;
    const clip = this.ccEntries("clip", "Anima")[0];
    const vae = this.ccEntries("vae", "Anima")[0];
    if (clip) {
      g.clip_name = ccRelPath(clip);
    } else if (!g.clip_name) {
      g.clip_name = ANIMA_CLIP_NAME;
    }
    if (vae) {
      g.vae_name = ccRelPath(vae);
    } else if (!g.vae_name) {
      g.vae_name = ANIMA_VAE_NAME;
    }
  }

  ensureQi2DefaultAux(): void {
    const g = this.gen;
    const clip = this.ccEntries("clip", "QI2")[0];
    const vae = this.ccEntries("vae", "QI2")[0];
    g.clip_name = clip ? ccRelPath(clip) : g.clip_name || QI2_CLIP_NAME;
    g.vae_name = vae ? ccRelPath(vae) : g.vae_name || QI2_VAE_NAME;
    g.clip_type = "qwen_image";
    g.qi2_cache = {
      device: g.qi2_cache?.device || "gpu",
      dtype: g.qi2_cache?.dtype || "int8",
    };
  }

  modelEntries(mode: string): ModelEntry[] {
    const local = this.context.local;
    if (mode === "anima" || mode === "qi2") {
      const kind = mode === "qi2" ? "QI2" : "Anima";
      return mergeCcAndLocalEntries(
        this.ccEntries("models", kind, (entry) => ccType(entry) === "unet"),
        local.diffusion_models,
        "diffusion_models",
        "unet",
        kind
      );
    }
    return mergeCcAndLocalEntries(
      this.ccEntries("models", null, (entry) => {
        const kind = ccKind(entry);
        return (
          (kind === "illustrious" || kind === "sdxl") &&
          ccType(entry) === "checkpoint"
        );
      }),
      local.checkpoints,
      "checkpoints",
      "checkpoint",
      "Illustrious"
    );
  }

  selectedModelKey(
    mode: string = this.mode()
  ): "ckpt_name" | "diffusion_model_name" {
    return mode === "anima" || mode === "qi2"
      ? "diffusion_model_name"
      : "ckpt_name";
  }

  selectedModelRel(mode: string = this.mode()): string {
    return slashes(this.gen[this.selectedModelKey(mode)]);
  }

  /** The picker head: the selected entry, or the first one when the selection is unknown. */
  selectedModelEntry(mode: string = this.mode()): ModelEntry | null {
    const entries = this.modelEntries(mode);
    const current = this.selectedModelRel(mode);
    return (
      entries.find((entry) => ccRelPath(entry) === current) ??
      entries[0] ??
      null
    );
  }

  /** Pick a model card; Anima and QI2 also pin their family's CLIP and VAE. */
  selectModel(mode: string, rel: string): void {
    if (!rel) {
      return;
    }
    if (mode === "anima") {
      this.ensureAnimaDefaultAux();
    } else if (mode === "qi2") {
      this.ensureQi2DefaultAux();
    }
    this.gen[this.selectedModelKey(mode)] = rel;
  }

  /**
   * What rendering the model cards wrote back: an empty model slot of the
   * active family takes the first card, and Anima/QI2 pin their CLIP/VAE.
   */
  syncCatalogDefaults(): void {
    const mode = this.mode();
    const first = this.modelEntries(mode)[0];
    if (!this.selectedModelRel(mode) && first) {
      this.selectModel(mode, ccRelPath(first));
    }
    if (mode === "anima") {
      this.ensureAnimaDefaultAux();
    } else if (mode === "qi2") {
      this.ensureQi2DefaultAux();
    }
  }

  /** `loadGenerationAssets`: empty model slots take the first local files. */
  applyContextLists(lists: ContextLists): void {
    const g = this.gen;
    if (!g.ckpt_name && lists.checkpoints.length > 0) {
      g.ckpt_name = lists.checkpoints[0];
    }
    if (!g.diffusion_model_name && lists.diffusion_models.length > 0) {
      g.diffusion_model_name = lists.diffusion_models[0];
    }
    if (!g.clip_name) {
      g.clip_name = lists.text_encoders.includes(ANIMA_CLIP_NAME)
        ? ANIMA_CLIP_NAME
        : lists.text_encoders[0] || ANIMA_CLIP_NAME;
    }
    if (!g.vae_name) {
      g.vae_name = lists.vae_models.includes(ANIMA_VAE_NAME)
        ? ANIMA_VAE_NAME
        : lists.vae_models[0] || ANIMA_VAE_NAME;
    }
  }

  /** Turbo LoRA cards of a family, with a local stand-in when the catalog has none. */
  turboCards(mode: string = this.mode()): EmotionTurboCard[] {
    const g = this.gen;
    const kindOk = (entry: CatalogEntry) => {
      const kind = ccKind(entry);
      if (mode === "anima") {
        return kind === "anima";
      }
      if (mode === "qi2") {
        return kind === "qi2";
      }
      return kind === "sdxl" || kind === "illustrious";
    };
    const entries: { entry: CatalogEntry; fallback: boolean }[] = (
      this.context.catalog?.lora ?? []
    )
      .filter((entry) => kindOk(entry) && ccType(entry) === "turbolora")
      .map((entry) => ({ entry, fallback: false }));
    if (entries.length === 0 && (mode === "anima" || mode === "qi2")) {
      const fileName =
        mode === "qi2" ? QI2_TURBO_LORA_NAME : ANIMA_TURBO_LORA_NAME;
      const installed = this.context.local.loras
        .map(slashes)
        .includes(slashes(fileName));
      entries.push({
        fallback: true,
        entry: {
          name:
            mode === "qi2" ? "Qwen Image 2.1 Viggle Turbo" : "Anima Turbo LoRA",
          type: "turbolora",
          kind: mode === "qi2" ? "QI2" : "Anima",
          local_path: `models/loras/${fileName}`,
          status: installed ? "installed" : "missing",
          description:
            mode === "qi2"
              ? "Six-step Viggle Turbo LoRA for Qwen Image 2.1."
              : "Anima turbo LoRA.",
        },
      });
    }
    const dmd = slashes(g.dmd_lora_name);
    const on =
      mode === "anima" || mode === "qi2"
        ? Boolean(g.turbo_enabled)
        : (g.dmd_lora_strength || 0) > 0;
    return entries.map(({ entry, fallback }) => {
      const rel = ccRelPath(entry);
      return { entry, fallback, rel, enabled: on && dmd === rel };
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
      emotionMode: this.emotionMode(),
      emotionPairs: this.emotionPairs(),
    };
  }

  /** The EmotionGeneratorV2 inputs. */
  sourceInputs(): EmotionStepInput["source"] {
    return {
      character: this.state.character,
      costumes: [...(this.state.costumes ?? [])],
      emotions: [...this.state.emotions],
      generationModel: this.generationModel(),
      generationSettings: JSON.stringify(this.gen),
      promptStyle: this.promptStyle(),
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

/** Init after `/vnccs/context_lists` loads. */
export function initializeEmotionStudioState(
  state: EmotionStudioState,
  context: EmotionContext,
  lists: ContextLists
): EmotionStudioState {
  return updateEmotionStudioState(state, context, (model) =>
    model.applyContextLists(lists)
  );
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
