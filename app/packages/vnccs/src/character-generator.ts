import type { NodeState } from "./control-center-state";
import type { JsonState } from "./graphs";
import type { VnccsHttp } from "./http";
import {
  resolutionScaleMegapixels,
  resolutionScaleValue,
  snapTargetSize,
} from "./resolution";

/**
 * Character Generator widget state (`widget_data` of the four generator
 * nodes), ported from `web/vnccs_character_generator.js`.
 */

export type GeneratorKind = "base" | "clone" | "clothes" | "emotions";

export const GENERATOR_CLASS: Record<GeneratorKind, string> = {
  base: "VNCCS_CharacterGenerator",
  clone: "VNCCS_CharacterCloneGenerator",
  clothes: "VNCCS_ClothesGenerator",
  emotions: "VNCCS_EmotionsGenerator",
};

export const GENERATOR_TITLE: Record<GeneratorKind, string> = {
  base: "VNCCS Character Generator",
  clone: "VNCCS Character Clone Generator",
  clothes: "VNCCS Clothes Generator",
  emotions: "VNCCS Emotions Generator",
};

export const GENERATOR_QWEN_INSTRUCTION =
  "Describe the character and their key features (body shape, physical characteristics, clothing, items, accessories). Then explain how the user's text instruction should alter or modify the character. Generate a new image that meets the user's requirements while maintaining consistency with the original character where appropriate.";
const QI2_EMOTION_PROMPT_TEMPLATE =
  "Upscale face image.\nMake character's face emotion {emotion}\nChange only face. Keep original neck colour, clothes and hairs\nkeep character's clothes";
const QI2_EMOTION_BBOX_DEFAULTS = { bbox_threshold: 0.3, drop_size: 10 };

export const SEEDVR_DIT_MODELS = [
  "seedvr2_3b_fp16.safetensors",
  "seedvr2_3b_fp8_e4m3fn.safetensors",
  "seedvr2_7b_fp16.safetensors",
  "seedvr2_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors",
  "seedvr2_7b_sharp_fp16.safetensors",
  "seedvr2_7b_sharp_fp8_e4m3fn_mixed_block35_fp16.safetensors",
];
export const SEEDVR_VAE_MODELS = ["ema_vae_fp16.safetensors"];
export const SEEDVR_COLOR_CORRECTION_MODES = [
  "lab",
  "wavelet",
  "adain",
  "none",
];
export const NATIVE_SEEDVR_NODE_NAMES = [
  "SeedVR2Preprocess",
  "SeedVR2Conditioning",
  "SeedVR2PostProcessing",
];
export const BG_REMOVE_MODES = [
  "Native",
  "disabled",
  "ultra_light",
  "light",
  "balanced",
  "strong",
  "aggressive",
];
const DEFAULT_SEEDVR_MODEL = "seedvr2_3b_fp8_e4m3fn.safetensors";

type Section = Record<string, unknown>;

export interface GeneratorData {
  bg_remove: Section;
  character_name?: string;
  common: Section;
  emotion_generation: Section;
  emotion_pairs: { costume?: string; emotion?: string }[];
  nsfw_enabled: boolean;
  pose_generation: Section;
  pose_sampler: Section;
  regenerate_from?: string;
  regenerate_index?: number;
  remove_clothes: Section;
  remove_clothes_sampler: Section;
  ui: GeneratorUi;
  upscaler: Section;
  vae_decode: Section;
  [section: string]: unknown;
}

export interface GeneratorUi {
  bg_remove_model_kind?: string;
  bg_remove_previous_preset?: string;
  progress_request_id?: string;
  progress_request_kind?: string;
  progress_scope?: string;
  resolution_by_model?: Record<
    string,
    { target_size: number; updated_at: number } | number
  >;
  resolution_model_key?: string;
  resolution_model_kind?: string;
  selected_preview?: string;
  user_selected_preview?: boolean;
  [key: string]: unknown;
}

export const DEFAULT_GENERATOR_DATA: GeneratorData = {
  nsfw_enabled: true,
  emotion_pairs: [],
  common: { target_size: 1024 },
  pose_generation: {
    target_size: 1024,
    upscale_method: "lanczos",
    crop_method: "disabled",
    image1_name: "image 1",
    image2_name: "image 2",
    image3_name: "image 3",
    weight1: 1,
    weight2: 1,
    weight3: 1,
    vl_size: 384,
    background_color: "from_generator",
    latent_image_index: 1,
    instruction: GENERATOR_QWEN_INSTRUCTION,
  },
  pose_sampler: {
    inherit_pipe: true,
    seed: 0,
    steps: 20,
    cfg: 1,
    sampler_name: "euler",
    scheduler: "simple",
    denoise: 1,
  },
  vae_decode: {
    tile_size: 512,
    overlap: 64,
    temporal_size: 64,
    temporal_overlap: 8,
  },
  emotion_generation: {
    task_batch_size: 0,
    target_size: 2048,
    face_denoise: 0.55,
    use_sam: false,
    bbox_model: "bbox/face_yolov8m.pt",
    segm_model: "bbox/face_yolov8m.pt",
    sam_model: "sam_vit_b_01ec64.pth",
    sam_device_mode: "AUTO",
    guide_size: 1536,
    guide_size_for: true,
    max_size: 1536,
    inherit_pipe_sampler: true,
    sampler_name: "euler",
    scheduler: "simple",
    feather: 50,
    noise_mask: true,
    force_inpaint: true,
    bbox_threshold: 0.5,
    bbox_dilation: 50,
    qi2_prompt_template: QI2_EMOTION_PROMPT_TEMPLATE,
    bbox_crop_factor: 3,
    sam_detection_hint: "center-1",
    sam_dilation: 0,
    sam_threshold: 0.93,
    sam_bbox_expansion: 0,
    sam_mask_hint_threshold: 0.7,
    sam_mask_hint_use_negative: "False",
    drop_size: 10,
    cycle: 1,
    inpaint_model: false,
    noise_mask_feather: 20,
    tiled_encode: true,
    tiled_decode: true,
    matte_expand_radius: 8,
    matte_feather_radius: 4,
    chroma_context: 16,
  },
  remove_clothes: {
    prompt: "Dress character: White underwear",
    target_size: 1024,
    upscale_method: "lanczos",
    crop_method: "disabled",
    image1_name: "image 1",
    image2_name: "image 2",
    image3_name: "image 3",
    weight1: 1,
    weight2: 1,
    weight3: 1,
    vl_size: 384,
    background_color: "White",
    latent_image_index: 1,
    instruction: GENERATOR_QWEN_INSTRUCTION,
  },
  remove_clothes_sampler: {
    inherit_pipe: true,
    seed: 0,
    steps: 20,
    cfg: 1,
    sampler_name: "euler",
    scheduler: "simple",
    denoise: 1,
  },
  upscaler: {
    mode: "seedvr",
    model: DEFAULT_SEEDVR_MODEL,
    vae: "ema_vae_fp16.safetensors",
    device: "cuda:0",
    offload_device: "cpu",
    seed: 42,
    inherit_pipe_seed: true,
    resolution: 2048,
    max_resolution: 3840,
    batch_size: 1,
    uniform_batch_size: false,
    color_correction: "lab",
    temporal_overlap: 0,
    prepend_frames: 0,
    input_noise_scale: 0,
    latent_noise_scale: 0,
    blocks_to_swap: 0,
    swap_io_components: false,
    cache_dit: true,
    attention_mode: "sdpa",
    attention_mode_manual: false,
    encode_tiled: true,
    encode_tile_size: 1024,
    encode_tile_overlap: 128,
    decode_tiled: true,
    decode_tile_size: 1024,
    decode_tile_overlap: 128,
    tile_debug: "false",
    cache_vae: false,
    enable_debug: false,
  },
  bg_remove: {
    use_internal_rmbg: false,
    preset: "balanced",
    use_sam3_details_recovery: false,
    use_preset_values: true,
    tolerance: 0.15,
    softness: 0.12,
    despill_strength: 0.65,
    edge_width: 3,
    matte_cleanup: 0.1,
    foreground_recover: 0.35,
    edge_decontaminate: 0.75,
    edge_choke: 0.08,
    matte_method: "guided_edge",
    screen_mode: "from_background",
    output_mode: "straight_rgba",
    sam3_model: "",
    sam3_segmentor: "image",
    sam3_device: "auto",
    sam3_precision: "bf16",
    sam3_prompt: "face, clothes, accessories, hat, boots, eyes",
    sam3_threshold: 0.4,
    sam3_add_background: "none",
    sam3_detection_limit: -1,
    sam3_erode_radius: 4,
    sam3_min_foreground_overlap: 0.55,
  },
  ui: { selected_preview: "pose_generation", user_selected_preview: false },
};

function isSection(value: unknown): value is Section {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Section-wise shallow merge: unknown keys inside a section survive. */
export function mergeGeneratorData(
  base: GeneratorData,
  patch: Record<string, unknown> | null | undefined
): GeneratorData {
  const out = structuredClone(base) as Record<string, unknown>;
  for (const [section, values] of Object.entries(patch ?? {})) {
    out[section] = isSection(values)
      ? { ...(isSection(out[section]) ? out[section] : {}), ...values }
      : values;
  }
  return out as GeneratorData;
}

export function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

/** The GAN upscaler was removed; saved workflows fall back to no upscaling. */
function normalizeUpscalerSettings(data: GeneratorData): void {
  const upscaler = data.upscaler;
  if (!isSection(upscaler)) {
    return;
  }
  if (
    String(upscaler.mode || "")
      .trim()
      .toLowerCase() === "gan"
  ) {
    upscaler.mode = "off";
  }
  // biome-ignore lint/performance/noDelete: the key must not be serialized
  delete upscaler.gan_model;
}

/** `readData()`: defaults merged with the saved widget data and legacy values migrated. */
export function parseGeneratorData(
  raw: JsonState | null | undefined
): GeneratorData {
  let parsed: Record<string, unknown> | null = null;
  try {
    if (typeof raw === "string") {
      parsed = JSON.parse(raw || "{}");
    } else if (raw) {
      parsed = structuredClone(raw) as Record<string, unknown>;
    }
  } catch {
    return structuredClone(DEFAULT_GENERATOR_DATA);
  }
  if (!isSection(parsed)) {
    parsed = {};
  }
  const data = mergeGeneratorData(DEFAULT_GENERATOR_DATA, parsed);
  const emotion = parsed.emotion_generation;
  if (
    isSection(emotion) &&
    emotion.use_sam === undefined &&
    emotion.use_sam_model !== undefined
  ) {
    data.emotion_generation.use_sam = Boolean(emotion.use_sam_model);
  }
  const model = String(data.upscaler.model || "");
  if (model.startsWith("seedvr2_ema_") || model.endsWith(".gguf")) {
    data.upscaler.model = DEFAULT_SEEDVR_MODEL;
  }
  if (
    !SEEDVR_COLOR_CORRECTION_MODES.includes(
      String(data.upscaler.color_correction)
    )
  ) {
    data.upscaler.color_correction = "lab";
  }
  for (const section of [
    "common",
    "pose_generation",
    "remove_clothes",
  ] as const) {
    data[section].target_size = snapTargetSize(data[section].target_size);
  }
  normalizeUpscalerSettings(data);
  return data;
}

export function serializeGeneratorData(data: GeneratorData): string {
  const copy = structuredClone(data);
  normalizeUpscalerSettings(copy);
  return JSON.stringify(copy);
}

const MODEL_KINDS = new Set([
  "qi2",
  "klein9b",
  "minimaxh3",
  "anima",
  "illustrious",
]);

/** The `[kind, type, model]` key resolution choices are remembered under. */
export function modelResolutionKey(state: NodeState): {
  key: string;
  kind: string;
} {
  const family = state.active_kind || "QI2";
  const kind = String(family).trim().toLowerCase();
  const type =
    state.selected_types_by_kind?.[family] ||
    (kind === "qi2" && state.selected_type) ||
    "unet";
  const model =
    state.selected_models?.[`${family}:${type}`] || state.selected_model || "";
  return { kind, key: JSON.stringify([kind, type, model]) };
}

export interface StageDef {
  key: string;
  label: string;
}

export const BASE_STAGES: StageDef[] = [
  { key: "pose_generation", label: "Pose Generation" },
  { key: "upscaler", label: "Upscaler" },
  { key: "bg_remove", label: "BG Remove" },
];

const CLONE_SFW_STAGES: StageDef[] = [
  { key: "original_pose_generation", label: "Original Pose" },
  { key: "original_upscaler", label: "Original Upscaler" },
  { key: "original_bg_remove", label: "Original BG" },
];

const CLONE_STAGES: StageDef[] = [
  ...CLONE_SFW_STAGES,
  { key: "remove_clothes", label: "Remove Clothes" },
  { key: "naked_pose_generation", label: "Naked Pose" },
  { key: "naked_upscaler", label: "Naked Upscaler" },
  { key: "naked_bg_remove", label: "Naked BG" },
];

const CLOTHES_STAGES: StageDef[] = [
  { key: "source_upscaler", label: "Source Upscaler" },
  ...BASE_STAGES,
];

const DEFAULT_EMOTION_STAGES: StageDef[] = [
  { key: "emotion_0001_bg_remove", label: "Emotion" },
];

const POSE_STAGES = new Set([
  "pose_generation",
  "original_pose_generation",
  "naked_pose_generation",
]);

/** Stages whose start begins a fresh run, so the preview follows the run again. */
const FIRST_STAGES = new Set([
  "pose_generation",
  "original_pose_generation",
  "source_upscaler",
]);

export const CLOTHES_CORE_LORA_LABEL = "VNCCS Clothes Core";

export type SettingsField =
  | {
      key: string;
      label: string;
      section: string;
      type: "checkbox";
      wide?: boolean;
    }
  | {
      key: string;
      label: string;
      section: string;
      type: "text";
      wide?: boolean;
    }
  | {
      key: string;
      label: string;
      section: string;
      type: "textarea";
      wide?: boolean;
    }
  | {
      key: string;
      label: string;
      section: string;
      type: "resolution_scale";
      wide?: boolean;
    }
  | {
      key: string;
      label: string;
      max: number;
      min: number;
      section: string;
      step: number;
      type: "number";
      wide?: boolean;
    }
  | {
      inputName?: string;
      key: string;
      label: string;
      nodeName?: string;
      options: string[];
      section: string;
      type: "select";
      wide?: boolean;
    };

export interface SettingsGroup {
  fields: SettingsField[];
  note?: string;
  title: string;
}

const SAMPLER_NOTE =
  "Seed, steps, CFG, sampler and scheduler are used only when pipe inheritance is disabled. Denoise is always local.";

function number(
  section: string,
  key: string,
  label: string,
  min: number,
  max: number,
  step = 1
): SettingsField {
  return { section, key, label, type: "number", min, max, step };
}

function text(
  section: string,
  key: string,
  label: string,
  wide?: boolean
): SettingsField {
  return { section, key, label, type: "text", wide };
}

function check(section: string, key: string, label: string): SettingsField {
  return { section, key, label, type: "checkbox", wide: true };
}

function select(
  section: string,
  key: string,
  label: string,
  options: string[],
  extra: { inputName?: string; nodeName?: string; wide?: boolean } = {}
): SettingsField {
  return { section, key, label, type: "select", options, ...extra };
}

function resolutionScale(section: string, key = "target_size"): SettingsField {
  return {
    section,
    key,
    label: "resolution scale",
    type: "resolution_scale",
    wide: true,
  };
}

function textarea(section: string, key: string, label: string): SettingsField {
  return { section, key, label, type: "textarea", wide: true };
}

function encoderFields(
  section: string,
  qi2: boolean,
  backgrounds: string[]
): SettingsField[] {
  if (qi2) {
    return [
      select(section, "background_color", "background_color", backgrounds),
    ];
  }
  return [
    select(section, "upscale_method", "upscale_method", [
      "lanczos",
      "bicubic",
      "area",
    ]),
    select(section, "crop_method", "crop_method", [
      "disabled",
      "pad",
      "center",
    ]),
    number(section, "latent_image_index", "latent_image_index", 1, 3, 1),
    number(section, "vl_size", "vl_size", 256, 1024, 8),
    select(section, "background_color", "background_color", backgrounds),
    number(section, "weight1", "weight1", 0, 2, 0.01),
    number(section, "weight2", "weight2", 0, 2, 0.01),
    number(section, "weight3", "weight3", 0, 2, 0.01),
    text(section, "image1_name", "image1_name"),
    text(section, "image2_name", "image2_name"),
    text(section, "image3_name", "image3_name"),
    textarea(section, "instruction", "instruction"),
  ];
}

function samplerFields(section: string): SettingsField[] {
  return [
    check(section, "inherit_pipe", "Use sampler settings from connected pipe"),
    number(section, "seed", "seed", 0, Number.MAX_SAFE_INTEGER, 1),
    number(section, "steps", "steps", 1, 10_000, 1),
    number(section, "cfg", "cfg", 0, 100, 0.01),
    select(section, "sampler_name", "sampler_name", [], {
      nodeName: "KSampler",
      inputName: "sampler_name",
    }),
    select(section, "scheduler", "scheduler", [], {
      nodeName: "KSampler",
      inputName: "scheduler",
    }),
    number(section, "denoise", "denoise", 0, 1, 0.01),
  ];
}

export interface ProgressStage {
  current?: number;
  images: string[] | null;
  message: string;
  status: "waiting" | "running" | "done" | "error";
  total?: number;
}

export interface ProgressSnapshot {
  active_stage?: string | null;
  epoch: unknown;
  error?: { message?: string; stage?: string } | null;
  node_id: string;
  request_id?: string | null;
  revision: number;
  run_id?: string | null;
  scope: string;
  stages: Record<string, ProgressStage>;
}

/**
 * Model over one generator's widget data. Mutating methods are only called
 * through {@link updateGeneratorData}, which works on a copy.
 */
export class GeneratorModel {
  readonly data: GeneratorData;
  readonly kind: GeneratorKind;

  constructor(data: GeneratorData, kind: GeneratorKind) {
    this.data = data;
    this.kind = kind;
  }

  private get isClone() {
    return this.kind === "clone";
  }

  private get isEmotions() {
    return this.kind === "emotions";
  }

  /** The section that owns the pose resolution slider. */
  poseTargetSection(): "common" | "pose_generation" {
    return this.isClone ? "common" : "pose_generation";
  }

  isNativeBgRemove(): boolean {
    return (
      String(this.data.bg_remove.preset || "")
        .trim()
        .toLowerCase() === "native"
    );
  }

  previousBgRemovePreset(): string {
    const previous = this.data.ui.bg_remove_previous_preset;
    return previous &&
      BG_REMOVE_MODES.includes(previous) &&
      previous !== "Native"
      ? previous
      : "balanced";
  }

  /** Native background removal is a QI2 feature. */
  bgRemoveModes(): string[] {
    return this.data.ui.bg_remove_model_kind === "qi2"
      ? BG_REMOVE_MODES
      : BG_REMOVE_MODES.filter((mode) => mode !== "Native");
  }

  isQi2(): boolean {
    return this.data.ui.resolution_model_kind === "qi2";
  }

  rememberModelResolution(edited = false, now: number = Date.now()): void {
    const key = this.data.ui.resolution_model_key;
    if (this.isEmotions || !key) {
      return;
    }
    const previous = this.data.ui.resolution_by_model?.[key];
    const size = this.data[this.poseTargetSection()].target_size as number;
    const previousSize =
      typeof previous === "number" ? previous : previous?.target_size;
    const previousAt =
      typeof previous === "object" ? previous.updated_at || 0 : 0;
    const changed = previous !== undefined && previousSize !== size;
    const updatedAt =
      edited || changed ? Math.max(now, previousAt + 1) : previousAt;
    this.data.ui.resolution_by_model = {
      ...this.data.ui.resolution_by_model,
      [key]: { target_size: size, updated_at: updatedAt },
    };
  }

  /**
   * Follow the Control Center model: each model remembers its own pose
   * resolution, and QI2 switches background removal to Native.
   */
  syncModelResolution(source: {
    emotionMode?: string;
    nodeState?: NodeState;
  }): boolean {
    const resolved = this.resolveModelSource(source);
    if (!(resolved && MODEL_KINDS.has(resolved.kind))) {
      return false;
    }
    const { kind, key } = resolved;
    let changed = false;
    if (!this.isEmotions && this.data.ui.resolution_model_key !== key) {
      this.switchResolutionModel(kind, key);
      changed = true;
    }
    this.rememberModelResolution();
    if (this.syncBgRemoveKind(kind)) {
      changed = true;
    }
    this.data.ui = { ...this.data.ui, resolution_model_kind: kind };
    return changed;
  }

  private resolveModelSource(source: {
    emotionMode?: string;
    nodeState?: NodeState;
  }): { kind: string; key: string } | null {
    if (source.nodeState) {
      return modelResolutionKey(source.nodeState);
    }
    if (this.isEmotions && source.emotionMode) {
      return { kind: source.emotionMode, key: "" };
    }
    return null;
  }

  private switchResolutionModel(kind: string, modelKey: string): void {
    const ui = this.data.ui;
    const previousKind = ui.resolution_model_kind;
    const previousKey = ui.resolution_model_key;
    const settings = this.data[this.poseTargetSection()];
    this.rememberModelResolution();
    const saved = this.data.ui.resolution_by_model?.[modelKey];
    const savedSize = typeof saved === "number" ? saved : saved?.target_size;
    if (Number.isFinite(savedSize)) {
      settings.target_size = resolutionScaleValue(
        resolutionScaleMegapixels(savedSize)
      );
    } else if (
      previousKey ||
      (previousKind && previousKind !== kind) ||
      (!previousKind && Number(settings.target_size) === 1024)
    ) {
      // Use family defaults only for a model without a saved choice.
      settings.target_size = kind === "minimaxh3" ? 1536 : 1024;
    }
    this.data.ui = { ...this.data.ui, resolution_model_key: modelKey };
    if (this.isClone) {
      this.data.pose_generation.target_size = settings.target_size;
      this.data.remove_clothes.target_size = settings.target_size;
    }
  }

  /** QI2 switches background removal to Native; other families restore the previous preset. */
  private syncBgRemoveKind(kind: string): boolean {
    if (
      this.data.ui.bg_remove_model_kind === kind &&
      (kind === "qi2" || !this.isNativeBgRemove())
    ) {
      return false;
    }
    const preset = String(this.data.bg_remove.preset || "balanced");
    if (kind === "qi2") {
      if (preset.toLowerCase() !== "native") {
        this.data.ui.bg_remove_previous_preset = preset;
      }
      this.data.bg_remove.preset = "Native";
    } else if (preset.toLowerCase() === "native") {
      this.data.bg_remove.preset = this.previousBgRemovePreset();
    }
    this.data.ui.bg_remove_model_kind = kind;
    return true;
  }

  /** The emotions generator seeds QI2 face-crop defaults the first time it sees QI2. */
  applyQi2EmotionDefaults(): void {
    this.data.emotion_generation = {
      ...this.data.emotion_generation,
      ...QI2_EMOTION_BBOX_DEFAULTS,
    };
  }

  syncCharacterSource(source: { character?: string; nsfw?: unknown }): boolean {
    let changed = false;
    if (source.character && this.data.character_name !== source.character) {
      this.data.character_name = source.character;
      changed = true;
    }
    if (this.isClone && source.nsfw !== undefined) {
      const next = booleanValue(source.nsfw, false);
      if (this.data.nsfw_enabled !== next) {
        this.data.nsfw_enabled = next;
        changed = true;
      }
    }
    return changed;
  }

  /** One main-panel edit, like the widget's `set()`. */
  set(
    section: string,
    key: string,
    value: unknown,
    now: number = Date.now()
  ): void {
    if (!isSection(this.data[section])) {
      this.data[section] = {};
    }
    (this.data[section] as Section)[key] = value;
    if (section === "bg_remove" && key === "preset") {
      if (
        String(value).trim().toLowerCase() === "native" &&
        !this.bgRemoveModes().includes("Native")
      ) {
        this.data.bg_remove.preset = this.previousBgRemovePreset();
      }
      this.data.bg_remove.use_preset_values = true;
    }
    if (section === "upscaler" && key === "attention_mode") {
      this.data.upscaler.attention_mode_manual = true;
    }
    if (this.isClone && section === "common" && key === "target_size") {
      this.data.pose_generation.target_size = value;
      this.data.remove_clothes.target_size = value;
    }
    this.rememberModelResolution(
      key === "target_size" && section === this.poseTargetSection(),
      now
    );
  }

  /** Apply the settings dialog's draft. */
  applyDraft(draft: GeneratorData): void {
    const next = mergeGeneratorData(
      DEFAULT_GENERATOR_DATA,
      draft as Record<string, unknown>
    );
    for (const key of Object.keys(this.data)) {
      delete (this.data as Record<string, unknown>)[key];
    }
    Object.assign(this.data, next);
    this.data.bg_remove.use_internal_rmbg = false;
  }

  /** Server-detected attention backend, until the user picks one. */
  adoptDetectedAttention(current: string | null | undefined): boolean {
    const upscaler = this.data.upscaler;
    if (
      !upscaler.attention_mode_manual &&
      (!upscaler.attention_mode || upscaler.attention_mode === "sdpa") &&
      current &&
      upscaler.attention_mode !== current
    ) {
      upscaler.attention_mode = current;
      return true;
    }
    return false;
  }

  /**
   * Before a normal queue: progress is keyed by scope and server run ids. A
   * per-submission nonce in widget_data would defeat ComfyUI's cache.
   */
  prepareQueuedRun(scope: string): void {
    this.data.ui.progress_scope = scope;
    this.data.ui.progress_request_id = undefined;
    this.data.ui.progress_request_kind = undefined;
    this.data.regenerate_from = undefined;
    this.data.regenerate_index = undefined;
    stripUndefined(this.data.ui);
    stripUndefined(this.data);
  }

  isCloneNsfwEnabled(): boolean {
    return !this.isClone || this.data.nsfw_enabled !== false;
  }

  stages(): StageDef[] {
    if (this.isClone) {
      return this.isCloneNsfwEnabled() ? CLONE_STAGES : CLONE_SFW_STAGES;
    }
    if (this.isEmotions) {
      const pairs = Array.isArray(this.data.emotion_pairs)
        ? this.data.emotion_pairs
        : [];
      if (pairs.length === 0) {
        return DEFAULT_EMOTION_STAGES;
      }
      return pairs.map((pair, index) => ({
        key: `emotion_${String(index + 1).padStart(4, "0")}_bg_remove`,
        label: `${pair.costume || "Costume"} / ${pair.emotion || "Emotion"}`,
      }));
    }
    return this.kind === "clothes" ? CLOTHES_STAGES : BASE_STAGES;
  }

  defaultPreviewStage(): string {
    if (this.isClone) {
      return "original_pose_generation";
    }
    if (this.isEmotions) {
      return this.stages()[0]?.key ?? "emotion_0001_bg_remove";
    }
    return this.kind === "clothes" ? "source_upscaler" : "pose_generation";
  }

  /** The pose LoRA the generator applies, shown under pose stages. */
  stageLoraLabel(stage: string): string | null {
    if (POSE_STAGES.has(stage)) {
      return this.data.ui.resolution_model_kind === "klein9b"
        ? "VNCCS Pose Studio Klein9b"
        : "VNCCS Pose Studio QI2";
    }
    return stage === "remove_clothes" ? CLOTHES_CORE_LORA_LABEL : null;
  }

  /** The settings dialog, grouped by the internal node that receives each value. */
  settingsGroups(): SettingsGroup[] {
    const qi2 = this.isQi2();
    const groups: SettingsGroup[] = [];
    if (this.isEmotions) {
      groups.push(...this.emotionGroups(qi2));
    } else {
      groups.push(
        {
          title: qi2
            ? "Text Encode Qwen Image 2.1 · Pose Generation"
            : "Encoder · Pose Generation",
          fields: [
            resolutionScale(this.poseTargetSection()),
            ...encoderFields("pose_generation", qi2, [
              "from_generator",
              "White",
              "Green",
              "Blue",
            ]),
          ],
        },
        {
          title: "KSampler · Pose Generation",
          fields: samplerFields("pose_sampler"),
          note: SAMPLER_NOTE,
        },
        {
          title: "VAEDecodeTiled",
          fields: [
            number("vae_decode", "tile_size", "tile_size", 64, 4096, 8),
            number("vae_decode", "overlap", "overlap", 0, 4096, 8),
            number("vae_decode", "temporal_size", "temporal_size", 1, 4096, 1),
            number(
              "vae_decode",
              "temporal_overlap",
              "temporal_overlap",
              0,
              4096,
              1
            ),
          ],
        }
      );
      if (this.isClone) {
        groups.push(
          {
            title: qi2
              ? "Text Encode Qwen Image 2.1 · Remove Clothes"
              : "Encoder · Remove Clothes",
            fields: [
              textarea("remove_clothes", "prompt", "prompt"),
              ...encoderFields("remove_clothes", qi2, [
                "White",
                "Green",
                "Blue",
              ]),
            ],
            note: "target_size is shared with the clone pose-generation encoder.",
          },
          {
            title: "KSampler · Remove Clothes",
            fields: samplerFields("remove_clothes_sampler"),
            note: SAMPLER_NOTE,
          }
        );
      }
      groups.push(
        {
          title: "Generator Upscaler",
          fields: [
            select("upscaler", "mode", "mode", ["seedvr", "off"]),
            check(
              "upscaler",
              "inherit_pipe_seed",
              "Use seed from connected pipe"
            ),
            number("upscaler", "seed", "seed", 0, Number.MAX_SAFE_INTEGER, 1),
          ],
        },
        {
          title: "Native SeedVR2",
          fields: [
            select("upscaler", "model", "diffusion model", SEEDVR_DIT_MODELS, {
              nodeName: "UNETLoader",
              inputName: "unet_name",
            }),
            select("upscaler", "vae", "VAE", SEEDVR_VAE_MODELS, {
              nodeName: "VAELoader",
              inputName: "vae_name",
            }),
            number(
              "upscaler",
              "resolution",
              "target short edge",
              16,
              16_384,
              2
            ),
            number(
              "upscaler",
              "max_resolution",
              "maximum edge (0 = unlimited)",
              0,
              16_384,
              2
            ),
            select(
              "upscaler",
              "color_correction",
              "color correction",
              SEEDVR_COLOR_CORRECTION_MODES,
              {
                nodeName: "SeedVR2PostProcessing",
                inputName: "color_correction_method",
              }
            ),
          ],
        }
      );
    }
    groups.push(...this.bgRemoveGroups());
    return groups;
  }

  private emotionGroups(qi2: boolean): SettingsGroup[] {
    const groups: SettingsGroup[] = [];
    const detector = (key: string, label: string) =>
      select("emotion_generation", key, label, [], {
        nodeName: "UltralyticsDetectorProvider",
        inputName: "model_name",
        wide: true,
      });
    groups.push({
      title: "UltralyticsDetectorProvider",
      fields: qi2
        ? [detector("bbox_model", "bbox detector model")]
        : [
            detector("bbox_model", "bbox detector model"),
            detector("segm_model", "segmentation detector model"),
          ],
    });
    if (qi2) {
      groups.push(
        {
          title: "VNCCS BBox Extractor · QI2 Face Generation",
          fields: [
            resolutionScale("emotion_generation", "target_size"),
            number(
              "emotion_generation",
              "bbox_threshold",
              "threshold",
              0,
              1,
              0.01
            ),
            number(
              "emotion_generation",
              "bbox_dilation",
              "dilation",
              0,
              1024,
              1
            ),
            number("emotion_generation", "feather", "feather", 0, 1024, 1),
            number("emotion_generation", "drop_size", "drop_size", 1, 4096, 1),
          ],
          note: "The crop is encoded by Text Encode Qwen Image 2.1, generated at the selected megapixel scale, resized to the original crop bounds, and pasted back at the same coordinates. Feather controls the blend at the paste boundary.",
        },
        {
          title: "Text Encode Qwen Image 2.1 · Emotion Prompt",
          fields: [
            textarea(
              "emotion_generation",
              "qi2_prompt_template",
              "prompt template"
            ),
          ],
          note: "Use {emotion} where the selected card's natural prompt and description tags should be inserted.",
        }
      );
    } else {
      const face = (key: string, options: string[]) =>
        select("emotion_generation", key, key, options, {
          nodeName: "FaceDetailer",
          inputName: key,
        });
      groups.push(
        {
          title: "SAMLoader",
          fields: [
            check(
              "emotion_generation",
              "use_sam",
              "Connect SAM and segmentation detector to FaceDetailer"
            ),
            select("emotion_generation", "sam_model", "model_name", [], {
              nodeName: "SAMLoader",
              inputName: "model_name",
              wide: true,
            }),
            select(
              "emotion_generation",
              "sam_device_mode",
              "device_mode",
              ["AUTO", "Prefer GPU", "CPU"],
              {
                nodeName: "SAMLoader",
                inputName: "device_mode",
              }
            ),
          ],
        },
        {
          title: "FaceDetailer",
          fields: [
            number(
              "emotion_generation",
              "guide_size",
              "guide_size",
              64,
              16_384,
              8
            ),
            check("emotion_generation", "guide_size_for", "guide_size_for"),
            number("emotion_generation", "max_size", "max_size", 64, 16_384, 8),
            check(
              "emotion_generation",
              "inherit_pipe_sampler",
              "Use sampler and scheduler from connected pipe"
            ),
            face("sampler_name", []),
            face("scheduler", []),
            number("emotion_generation", "feather", "feather", 0, 1024, 1),
            check("emotion_generation", "noise_mask", "noise_mask"),
            check("emotion_generation", "force_inpaint", "force_inpaint"),
            number(
              "emotion_generation",
              "bbox_threshold",
              "bbox_threshold",
              0,
              1,
              0.01
            ),
            number(
              "emotion_generation",
              "bbox_dilation",
              "bbox_dilation",
              0,
              1024,
              1
            ),
            number(
              "emotion_generation",
              "bbox_crop_factor",
              "bbox_crop_factor",
              1,
              100,
              0.01
            ),
            face("sam_detection_hint", [
              "center-1",
              "horizontal-2",
              "vertical-2",
              "rect-4",
              "diamond-4",
              "mask-area",
              "mask-points",
              "mask-point-bbox",
              "none",
            ]),
            number(
              "emotion_generation",
              "sam_dilation",
              "sam_dilation",
              0,
              1024,
              1
            ),
            number(
              "emotion_generation",
              "sam_threshold",
              "sam_threshold",
              0,
              1,
              0.01
            ),
            number(
              "emotion_generation",
              "sam_bbox_expansion",
              "sam_bbox_expansion",
              0,
              1024,
              1
            ),
            number(
              "emotion_generation",
              "sam_mask_hint_threshold",
              "sam_mask_hint_threshold",
              0,
              1,
              0.01
            ),
            face("sam_mask_hint_use_negative", ["False", "True"]),
            number("emotion_generation", "drop_size", "drop_size", 0, 4096, 1),
            number("emotion_generation", "cycle", "cycle", 1, 100, 1),
            check("emotion_generation", "inpaint_model", "inpaint_model"),
            number(
              "emotion_generation",
              "noise_mask_feather",
              "noise_mask_feather",
              0,
              1024,
              1
            ),
            check("emotion_generation", "tiled_encode", "tiled_encode"),
            check("emotion_generation", "tiled_decode", "tiled_decode"),
          ],
          note: "Steps and CFG come from the connected pipe. Face Detailer denoise is controlled in the main panel. Sampler and scheduler can optionally be overridden here. Seed remains per emotion item.",
        }
      );
    }
    groups.push({
      title: qi2 ? "VNCCS Emotion Crop Merge" : "VNCCS Emotion Matte Merge",
      fields: [
        number(
          "emotion_generation",
          "matte_expand_radius",
          "matte_expand_radius",
          0,
          256,
          1
        ),
        number(
          "emotion_generation",
          "matte_feather_radius",
          "matte_feather_radius",
          0,
          256,
          1
        ),
        number(
          "emotion_generation",
          "chroma_context",
          "chroma_context",
          0,
          1024,
          1
        ),
      ],
      note: qi2
        ? "The generated QI2 face crop is returned to its original coordinates before background processing."
        : "These parameters affect only the FaceDetailer region. The original sprite alpha remains untouched elsewhere.",
    });
    return groups;
  }

  private bgRemoveGroups(): SettingsGroup[] {
    const native = this.isNativeBgRemove();
    const groups: SettingsGroup[] = [
      {
        title: "VNCCS Chroma Key",
        fields: [
          select("bg_remove", "preset", "preset", this.bgRemoveModes()),
          check(
            "bg_remove",
            "use_preset_values",
            "Use values from selected preset"
          ),
          number("bg_remove", "tolerance", "tolerance", 0, 1, 0.01),
          number("bg_remove", "softness", "softness", 0.001, 1, 0.01),
          number(
            "bg_remove",
            "despill_strength",
            "despill_strength",
            0,
            1,
            0.01
          ),
          number("bg_remove", "edge_width", "edge_width", 0, 32, 1),
          number("bg_remove", "matte_cleanup", "matte_cleanup", 0, 1, 0.01),
          number(
            "bg_remove",
            "foreground_recover",
            "foreground_recover",
            0,
            1,
            0.01
          ),
          number(
            "bg_remove",
            "edge_decontaminate",
            "edge_decontaminate",
            0,
            1,
            0.01
          ),
          number("bg_remove", "edge_choke", "edge_choke", 0, 1, 0.01),
          select("bg_remove", "matte_method", "matte_method", [
            "chroma_soft",
            "guided_edge",
            "pymatting_if_available",
            "screen_matte",
          ]),
          select("bg_remove", "screen_mode", "screen_mode", [
            "from_background",
            "auto",
            "green",
            "blue",
            "red",
          ]),
          select("bg_remove", "output_mode", "output_mode", [
            "straight_rgba",
            "premultiplied_rgba",
          ]),
          ...(native
            ? []
            : [
                check(
                  "bg_remove",
                  "use_sam3_details_recovery",
                  "Use SAM3 recovery mask"
                ),
              ]),
        ],
        note: "When preset values are enabled, the individual chroma parameters are retained but the preset controls processing.",
      },
    ];
    if (!native) {
      groups.push(
        {
          title: "Easy SAM3 · Model Loader",
          fields: [
            text(
              "bg_remove",
              "sam3_model",
              "model (blank = managed VNCCS model)",
              true
            ),
            select("bg_remove", "sam3_segmentor", "segmentor", ["image"], {
              nodeName: "LoadSam3Model",
              inputName: "segmentor",
            }),
            select(
              "bg_remove",
              "sam3_device",
              "device",
              ["auto", "cuda", "cpu", "mps"],
              {
                nodeName: "LoadSam3Model",
                inputName: "device",
              }
            ),
            select(
              "bg_remove",
              "sam3_precision",
              "precision",
              ["bf16", "fp16", "fp32"],
              {
                nodeName: "LoadSam3Model",
                inputName: "precision",
              }
            ),
          ],
        },
        {
          title: "Easy SAM3 · Image Segmentation / Recovery",
          fields: [
            textarea("bg_remove", "sam3_prompt", "prompt"),
            number("bg_remove", "sam3_threshold", "threshold", 0, 1, 0.01),
            select(
              "bg_remove",
              "sam3_add_background",
              "add_background",
              ["none", "black", "white", "green", "blue"],
              { nodeName: "Sam3ImageSegmentation", inputName: "add_background" }
            ),
            number(
              "bg_remove",
              "sam3_detection_limit",
              "detection_limit",
              -1,
              10_000,
              1
            ),
            number(
              "bg_remove",
              "sam3_erode_radius",
              "recovery erode radius",
              0,
              256,
              1
            ),
            number(
              "bg_remove",
              "sam3_min_foreground_overlap",
              "minimum foreground overlap",
              0,
              1,
              0.01
            ),
          ],
        }
      );
    }
    return groups;
  }
}

function stripUndefined(value: Record<string, unknown>): void {
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) {
      delete value[key];
    }
  }
}

/** "Load Defaults" in the settings dialog: reset only the fields it shows. */
export function resetDraftToDefaults(
  draft: GeneratorData,
  groups: SettingsGroup[]
): GeneratorData {
  const next = structuredClone(draft);
  for (const group of groups) {
    for (const field of group.fields) {
      const defaults = DEFAULT_GENERATOR_DATA[field.section];
      if (!(isSection(defaults) && field.key in defaults)) {
        continue;
      }
      const section = isSection(next[field.section])
        ? (next[field.section] as Section)
        : {};
      section[field.key] = structuredClone(defaults[field.key]);
      next[field.section] = section;
    }
  }
  return next;
}

/** Select options: the current value, the static list, then the live schema's list. */
export function settingsFieldOptions(
  field: Extract<SettingsField, { type: "select" }>,
  current: unknown,
  schemaOptions: string[] = []
): string[] {
  return [
    ...new Set(
      [current, ...field.options, ...schemaOptions].filter(Boolean).map(String)
    ),
  ];
}

/** A typed number field value: clamped, or ignored while it does not parse. */
export function parseNumberField(
  field: Extract<SettingsField, { type: "number" }>,
  input: string
): number | null {
  const trimmed = String(input).trim().replace(",", ".");
  const value = Number(trimmed);
  if (!(trimmed && Number.isFinite(value))) {
    return null;
  }
  return Math.max(field.min, Math.min(field.max, value));
}

export function updateGeneratorData(
  data: GeneratorData,
  kind: GeneratorKind,
  mutate: (model: GeneratorModel) => void
): GeneratorData {
  const model = new GeneratorModel(structuredClone(data), kind);
  mutate(model);
  return model.data;
}

// --- Progress ------------------------------------------------------------------

export interface RegenerateState {
  activeStage: string;
  from: string;
  imageIndex: number | null;
  requestId: string;
  sawStageEvent: boolean;
  startedAt: number;
  targetStages: string[];
}

/** What the preview panel shows: per-stage results and which tab follows the run. */
export interface GeneratorView {
  cursor: { epoch: unknown; revision: number; scope: string } | null;
  regenerate: RegenerateState | null;
  runId: string | null;
  selectedPreview: string;
  stages: Record<string, ProgressStage>;
  userSelectedPreview: boolean;
}

function waitingStage(): ProgressStage {
  return { status: "waiting", images: null, message: "" };
}

export function initialGeneratorView(
  stages: StageDef[],
  data: GeneratorData,
  fallback: string
): GeneratorView {
  const keys = stages.map((stage) => stage.key);
  const saved = data.ui.selected_preview;
  const valid = Boolean(saved && keys.includes(saved));
  return {
    cursor: null,
    regenerate: null,
    runId: null,
    selectedPreview: valid && saved ? saved : fallback,
    stages: Object.fromEntries(keys.map((key) => [key, waitingStage()])),
    userSelectedPreview: valid ? Boolean(data.ui.user_selected_preview) : false,
  };
}

/** Keep the view's stage map in step with the stage list (clone NSFW, emotion pairs). */
export function syncViewStages(
  view: GeneratorView,
  stages: StageDef[],
  fallback: string
): GeneratorView {
  const keys = stages.map((stage) => stage.key);
  const missing = keys.filter((key) => !view.stages[key]);
  const selectionValid = keys.includes(view.selectedPreview);
  if (missing.length === 0 && selectionValid) {
    return view;
  }
  return {
    ...view,
    stages: {
      ...view.stages,
      ...Object.fromEntries(missing.map((key) => [key, waitingStage()])),
    },
    selectedPreview: selectionValid ? view.selectedPreview : fallback,
    userSelectedPreview: selectionValid ? view.userSelectedPreview : false,
  };
}

export function selectPreview(
  view: GeneratorView,
  stage: string
): GeneratorView {
  return { ...view, selectedPreview: stage, userSelectedPreview: true };
}

function finishRegenerate(view: GeneratorView): GeneratorView {
  return view.regenerate ? { ...view, regenerate: null } : view;
}

function trackRegenerate(
  view: GeneratorView,
  stage: string,
  status: string
): GeneratorView {
  const regen = view.regenerate;
  if (!regen) {
    return view;
  }
  const next = {
    ...regen,
    sawStageEvent: true,
    activeStage:
      regen.targetStages.includes(stage) && status === "running"
        ? stage
        : regen.activeStage,
  };
  if (stage === regen.targetStages.at(-1) && status === "done") {
    return { ...view, regenerate: null };
  }
  return { ...view, regenerate: next };
}

export function applyProgressError(
  view: GeneratorView,
  stageKeys: string[],
  message: string | undefined,
  failedStage: string | null = null
): GeneratorView {
  let targets = stageKeys.filter(
    (key) => view.stages[key]?.status === "running"
  );
  if (targets.length === 0) {
    const lastDone = [...stageKeys]
      .reverse()
      .find((key) => view.stages[key]?.status === "done");
    const fallback =
      failedStage && stageKeys.includes(failedStage)
        ? failedStage
        : lastDone || stageKeys[0];
    if (fallback) {
      targets = [fallback];
    }
  }
  const stages = { ...view.stages };
  for (const key of targets) {
    stages[key] = {
      ...(stages[key] ?? waitingStage()),
      status: "error",
      message: message || "Generation failed. Check the server log.",
    };
  }
  const last = targets.at(-1);
  return {
    ...view,
    stages,
    regenerate: null,
    selectedPreview:
      !view.userSelectedPreview && last ? last : view.selectedPreview,
  };
}

/** Only an outstanding Regenerate filters progress by request id. */
function acceptsRequest(
  view: GeneratorView,
  requestId: string | null | undefined
): boolean {
  const pending = view.regenerate?.requestId;
  return !pending || requestId === pending;
}

/** Running stages fail when the server no longer reports progress for them. */
function failRunningStages(view: GeneratorView): GeneratorView {
  if (view.regenerate) {
    return view;
  }
  let changed = false;
  const stages = { ...view.stages };
  for (const [key, stage] of Object.entries(stages)) {
    if (stage.status === "running") {
      stages[key] = {
        ...stage,
        status: "error",
        message:
          "Server progress is unavailable. Check the queue before retrying.",
      };
      changed = true;
    }
  }
  return changed ? { ...view, stages } : view;
}

function isStaleSnapshot(
  view: GeneratorView,
  snapshot: ProgressSnapshot,
  context: { nodeId: string; scope: string }
): boolean {
  if (
    snapshot.scope !== context.scope ||
    String(snapshot.node_id) !== context.nodeId ||
    !acceptsRequest(view, snapshot.request_id)
  ) {
    return true;
  }
  const cursor = view.cursor;
  return Boolean(
    cursor &&
      cursor.scope === context.scope &&
      cursor.epoch === snapshot.epoch &&
      snapshot.revision < cursor.revision
  );
}

/** Fold one `/vnccs/character_generator/progress` reply into the view, like `refreshProgress()`. */
export function applyProgressSnapshot(
  view: GeneratorView,
  snapshot: ProgressSnapshot | null,
  context: { nodeId: string; scope: string; stageKeys: string[] }
): GeneratorView {
  if (!snapshot) {
    return failRunningStages(view);
  }
  if (isStaleSnapshot(view, snapshot, context)) {
    return view;
  }
  const runId = snapshot.run_id ?? null;
  // A run the view has not seen before starts from its first stage, so the
  // preview follows it again (the widget did this on the first stage event).
  const newRun = Boolean(view.runId && runId && runId !== view.runId);
  let next: GeneratorView = {
    ...view,
    cursor: {
      scope: context.scope,
      revision: snapshot.revision,
      epoch: snapshot.epoch,
    },
    runId,
    stages: { ...view.stages },
    userSelectedPreview: newRun ? false : view.userSelectedPreview,
  };
  let followed: string | null = null;
  for (const key of context.stageKeys) {
    const stage = snapshot.stages?.[key] ?? waitingStage();
    next.stages[key] = stage;
    if (stage.status === "running" || stage.status === "done") {
      followed = key;
    }
    next = trackRegenerate(next, key, stage.status);
  }
  if (!(snapshot.error || next.userSelectedPreview) && followed) {
    next.selectedPreview = followed;
  }
  if (snapshot.error) {
    return applyProgressError(
      next,
      context.stageKeys,
      snapshot.error.message,
      snapshot.error.stage ?? null
    );
  }
  if (Object.values(next.stages).some((stage) => stage.status === "error")) {
    return finishRegenerate(next);
  }
  return next;
}

/** A fresh run resets every stage and the preview follows the run again. */
export function beginRun(
  view: GeneratorView,
  stageKeys: string[],
  fallback: string
): GeneratorView {
  return {
    ...view,
    regenerate: null,
    stages: Object.fromEntries(stageKeys.map((key) => [key, waitingStage()])),
    selectedPreview: fallback,
    userSelectedPreview: false,
  };
}

export function beginRegenerate(
  view: GeneratorView,
  stageKeys: string[],
  stage: string,
  imageIndex: number | null,
  requestId: string,
  now: number = Date.now()
): GeneratorView {
  const start = Math.max(0, stageKeys.indexOf(stage));
  const targetStages = stageKeys.slice(start);
  const stages = { ...view.stages };
  for (const key of targetStages) {
    stages[key] = {
      status: "waiting",
      images: Number.isInteger(imageIndex)
        ? (stages[key]?.images ?? null)
        : null,
      message: "",
    };
  }
  return {
    ...view,
    stages,
    selectedPreview: stage,
    userSelectedPreview: false,
    regenerate: {
      from: stage,
      imageIndex,
      activeStage: stage,
      targetStages,
      startedAt: now,
      requestId,
      sawStageEvent: false,
    },
  };
}

export { FIRST_STAGES };

export function formatElapsed(seconds = 0): string {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  return minutes ? `${minutes}:${String(secs).padStart(2, "0")}` : `${secs}s`;
}

export function regenerateElapsed(
  view: GeneratorView,
  now: number = Date.now()
): number {
  return view.regenerate
    ? Math.floor((now - view.regenerate.startedAt) / 1000)
    : 0;
}

/** Stage progress for the chain: real counts when known, else a time-based estimate during regenerate. */
export function stageProgressPercent(
  stage: ProgressStage | undefined,
  elapsed: number
): number {
  const current = Number(stage?.current);
  const total = Number(stage?.total);
  if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
    return Math.max(4, Math.min(100, (current / total) * 100));
  }
  return Math.min(92, 8 + Math.max(0, elapsed) * 3);
}

export function formatStageStatus(
  view: GeneratorView,
  key: string,
  elapsed: number
): string {
  const state = view.stages[key] ?? waitingStage();
  const status = state.status || "waiting";
  let count = "";
  if (Number.isFinite(state.current) && Number.isFinite(state.total)) {
    count = ` (${state.current}/${state.total})`;
  } else if (state.images?.length) {
    count = ` (${state.images.length})`;
  }
  if (view.regenerate?.activeStage === key && status === "waiting") {
    return `Starting regenerate · ${formatElapsed(elapsed)}`;
  }
  if (view.regenerate?.targetStages.includes(key) && status === "waiting") {
    return "Queued for regenerate";
  }
  if (state.message) {
    return `${state.message}${count}`;
  }
  if (status === "running") {
    return `Running${count}`;
  }
  if (status === "done") {
    return `Done${count}`;
  }
  return status === "error" ? "Error" : "Waiting";
}

export function isRunActive(view: GeneratorView): boolean {
  return (
    Boolean(view.regenerate) ||
    Object.values(view.stages).some((stage) => stage.status === "running")
  );
}

// --- Routes --------------------------------------------------------------------

export const PROGRESS_SCOPE_PATTERN = /^[A-Za-z0-9:_-]{1,200}$/;

/** `<workflow id>:<node type>:<node id>`, the key the server files progress under. */
export function progressScope(
  workflowId: string,
  kind: GeneratorKind,
  nodeId: string
): string {
  return `${workflowId}:${GENERATOR_CLASS[kind]}:${nodeId}`;
}

export async function fetchProgress(
  http: VnccsHttp,
  scope: string
): Promise<ProgressSnapshot | null> {
  const data = await http.get<{ snapshot?: ProgressSnapshot | null }>(
    "/vnccs/character_generator/progress",
    { scope }
  );
  return data.snapshot ?? null;
}

export interface SeedvrEntry {
  category: "models" | "vae";
  description?: string;
  local_path: string;
  name: string;
  status: string;
}

export interface SeedvrCatalog {
  models: SeedvrEntry[];
  vae: SeedvrEntry[];
}

export async function fetchSeedvrModels(
  http: VnccsHttp,
  refresh = false
): Promise<SeedvrCatalog> {
  const data = await http.get<Partial<SeedvrCatalog>>(
    "/vnccs/character_generator/seedvr_models",
    {
      refresh: refresh ? 1 : undefined,
    }
  );
  return { models: data.models ?? [], vae: data.vae ?? [] };
}

/** `models/<folder>/<file>` → the name the loader lists. */
export function seedvrRelativePath(entry: { local_path?: string }): string {
  return String(entry.local_path || "")
    .replace(/\\/g, "/")
    .split("/")
    .slice(2)
    .join("/");
}

export type SeedvrDownloads = Record<
  string,
  { message?: string; status: string }
>;

export function fetchSeedvrDownloads(
  http: VnccsHttp
): Promise<SeedvrDownloads> {
  return http.get<SeedvrDownloads>(
    "/vnccs/character_generator/seedvr_download_status"
  );
}

export function requestSeedvrDownload(
  http: VnccsHttp,
  category: "models" | "vae",
  name: string
) {
  return http.post<{ status: string }>(
    "/vnccs/character_generator/seedvr_download",
    {
      category,
      name,
    }
  );
}

// --- Live node schemas -----------------------------------------------------------

type InputSpec = readonly unknown[];

export type NodeSchemas = Record<
  string,
  {
    input?: {
      optional?: Record<string, InputSpec>;
      required?: Record<string, InputSpec>;
    };
  }
>;

/** Nodes whose live option lists the settings dialog reads. */
export function schemaNodeNames(groups: SettingsGroup[]): string[] {
  const names = new Set<string>();
  for (const group of groups) {
    for (const field of group.fields) {
      if (field.type === "select" && field.nodeName) {
        names.add(field.nodeName);
      }
    }
  }
  return [...names];
}

/** `/object_info/<node>` for each name; a missing node is simply absent. */
export async function fetchNodeSchemas(
  http: VnccsHttp,
  names: readonly string[]
): Promise<NodeSchemas> {
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        const data = await http.get<NodeSchemas>(
          `/object_info/${encodeURIComponent(name)}`
        );
        return data[name] ? ([name, data[name]] as const) : null;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(
    entries.filter((entry): entry is NonNullable<typeof entry> =>
      Boolean(entry)
    )
  );
}

/** Combo options of one input: `[[...options]]` or `["COMBO", { options }]`. */
export function schemaInputOptions(
  schemas: NodeSchemas,
  nodeName: string | undefined,
  inputName: string | undefined
): string[] {
  if (!(nodeName && inputName)) {
    return [];
  }
  const input = schemas[nodeName]?.input;
  const spec = input?.required?.[inputName] ?? input?.optional?.[inputName];
  const [head, options] = spec ?? [];
  if (Array.isArray(head)) {
    return head.map(String);
  }
  const list = (options as { options?: unknown } | undefined)?.options;
  return head === "COMBO" && Array.isArray(list) ? list.map(String) : [];
}

/** Native SeedVR2 needs these core nodes; an older ComfyUI lacks them. */
export function missingNativeSeedvrNodes(schemas: NodeSchemas): string[] {
  const missing = NATIVE_SEEDVR_NODE_NAMES.filter((name) => !schemas[name]);
  const post = schemas.SeedVR2PostProcessing?.input;
  if (
    post &&
    !(
      post.required?.color_correction_method ??
      post.optional?.color_correction_method
    )
  ) {
    missing.push("SeedVR2PostProcessing.color_correction_method");
  }
  return missing;
}

export function nativeSeedvrProblem(
  data: GeneratorData,
  schemas: NodeSchemas | null
): string | null {
  if ((data.upscaler.mode || "seedvr") !== "seedvr" || !schemas) {
    return null;
  }
  const missing = missingNativeSeedvrNodes(schemas);
  return missing.length > 0
    ? `Native SeedVR2 is not available in this ComfyUI installation. Update ComfyUI to the latest release and restart it before using SeedVR upscaling.\n\nMissing nodes: ${missing.join(", ")}`
    : null;
}

export function fetchSeedvrAttention(http: VnccsHttp) {
  return http.get<{ available?: string[]; current?: string | null }>(
    "/vnccs/character_generator/seedvr_attention"
  );
}

/** Re-run from one stage using the cached inputs of the last normal run. */
export function requestRegenerate(
  http: VnccsHttp,
  input: {
    data: GeneratorData;
    imageIndex: number | null;
    kind: GeneratorKind;
    nodeId: string;
    stage: string;
  }
) {
  return http.post<{ ok?: boolean }>("/vnccs/character_generator/regenerate", {
    unique_id: input.nodeId,
    generator_type: GENERATOR_CLASS[input.kind],
    stage: input.stage,
    image_index: input.imageIndex,
    widget_data: input.data,
  });
}

/** Regenerate payload: the request id filters progress until the reply arrives. */
export function regenerateData(
  data: GeneratorData,
  input: {
    imageIndex: number | null;
    requestId: string;
    scope: string;
    stage: string;
  }
): GeneratorData {
  const next = structuredClone(data);
  next.regenerate_from = input.stage;
  if (input.imageIndex !== null) {
    next.regenerate_index = input.imageIndex;
  }
  next.ui = {
    ...next.ui,
    progress_scope: input.scope,
    progress_request_id: input.requestId,
    selected_preview: input.stage,
    user_selected_preview: false,
  };
  return next;
}
