import type { CatalogEntry, DownloadStatusMap } from "./control-center";
import { type DownloadCategory, downloadKey } from "./control-center";
import type { ContextLists, PreviewPayload, WizardFields } from "./creator";
import type { JsonState } from "./graphs";
import { resolutionScaleMegapixels, resolutionScaleValue } from "./resolution";

/**
 * Character Creator V2 widget state (`widget_data` of `CharacterCreatorV2`).
 * Ported from `web/vnccs_character_creator_v2.js`: each generation family
 * keeps its own profile under `gen_settings.mode_settings`, and the flat
 * `gen_settings` keys mirror the active family. The node merges the active
 * profile over the flat keys, so both must stay in step.
 */

export type GenerationMode = "qi2" | "anima" | "illustrious";

export const GENERATION_MODES: { label: string; mode: GenerationMode }[] = [
  { mode: "qi2", label: "Qwen Image 2.1" },
  { mode: "anima", label: "ANIMA" },
  { mode: "illustrious", label: "Illustrious" },
];

export const QI2_OVERHAUL_LORA_NAME =
  "QI2.1/VNCCS/VNCCS_QI2_AnimeOverhaulV1.safetensors";
export const QI2_OVERHAUL_TITLE = "Qwen Image2.1 Character Overhaul";
export const QI2_OVERHAUL_ENTRY: CatalogEntry = {
  name: "VNCCS Overhaul QI2",
  type: "Helper",
  kind: "QI2",
  local_path: `models/loras/${QI2_OVERHAUL_LORA_NAME}`,
  description: "Overhaul for Character Creator",
};

const ANIMA_TURBO_LORA_NAME = "anima\\anima-turbo-lora-v0.1.safetensors";
const ANIMA_CLIP_NAME = "qwen_3_06b_base.safetensors";
const ANIMA_VAE_NAME = "qwen_image_vae.safetensors";
const QI2_TURBO_LORA_NAME =
  "QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors";
const QI2_MODEL_NAME = "qwen_image_2.1_int8_convrot.safetensors";
const QI2_CLIP_NAME = "qwen3vl_8b_int8_convrot.safetensors";
const QI2_VAE_NAME = "qwen_image_2.1_vae_bf16.safetensors";

export const GENERATION_DEFAULTS_VERSION = 6;
export const PROMPT_DEFAULTS_VERSION = 3;
const LORA_SLOTS = 5;

const LEGACY_ANIMA_RESOLUTION_SCALES: Record<string, number> = {
  normal: 1024,
  high: 1741,
  maximum: 2458,
};

export type SeedMode = "fixed" | "randomize";

export interface LoraSlot {
  name: string;
  strength: number;
}

export interface TurboPrevious {
  cfg?: number;
  steps?: number;
}

export interface Qi2CacheSettings {
  device: string;
  dtype: string;
}

/** One family's saved generation settings. */
export interface ModeProfile {
  age_lora_name?: string;
  cfg: number;
  ckpt_name?: string;
  clip_name?: string;
  clip_type?: string;
  diffusion_model_name?: string;
  dmd_lora_name: string;
  dmd_lora_strength: number;
  lora_stack: LoraSlot[];
  qi2_cache?: Qi2CacheSettings;
  qi2_overhaul_strength?: number;
  sampler: string;
  scheduler: string;
  seed: number;
  seed_mode: SeedMode | string;
  steps: number;
  target_size: number;
  turbo_enabled?: boolean;
  turbo_previous_settings: TurboPrevious | null;
  vae_name?: string;
  [key: string]: unknown;
}

export interface GenSettings extends Partial<ModeProfile> {
  anima_defaults_applied?: boolean;
  background_model_kind: string;
  generation_defaults_version: number;
  generation_mode: string;
  mode_settings: Record<string, ModeProfile>;
  previous_background_color: string;
  [key: string]: unknown;
}

export interface CharacterInfo {
  additional_details: string;
  aesthetics: string;
  age: number;
  background_color: string;
  body: string;
  custom_style: string;
  eyes: string;
  face: string;
  framing: string;
  hair: string;
  lora_prompt: string;
  name?: string;
  negative_prompt: string;
  nsfw: boolean;
  race: string;
  sex: string;
  skin_color: string;
  style: string;
  [key: string]: unknown;
}

export interface PromptMode {
  aesthetics: string;
  negative_prompt: string;
}

export interface CreatorState {
  character: string;
  character_info: CharacterInfo;
  gen_settings: GenSettings;
  preview_source: "gen" | "pose";
  /** True while the shown preview matches the settings; the node then reuses it instead of rendering. */
  preview_valid: boolean;
  prompt_defaults_version: number;
  prompt_modes: Record<string, PromptMode>;
  sprite_preview_cache_bust: string;
  sprite_preview_count: number;
  sprite_preview_index: number;
  sprite_preview_request_id: number;
  [key: string]: unknown;
}

export type TraitKey =
  | "race"
  | "skin_color"
  | "body"
  | "face"
  | "hair"
  | "eyes"
  | "additional_details";

export const TRAIT_FIELDS: { key: TraitKey; label: string }[] = [
  { key: "race", label: "Race" },
  { key: "skin_color", label: "Skin" },
  { key: "body", label: "Body" },
  { key: "face", label: "Face" },
  { key: "hair", label: "Hair" },
  { key: "eyes", label: "Eyes" },
  { key: "additional_details", label: "Details" },
];

export const BACKGROUND_OPTIONS = [
  { label: "Green", value: "Green" },
  { label: "Blue", value: "Blue" },
  { label: "Alpha", value: "Transparent" },
] as const;

export const FRAMING_OPTIONS = [
  { label: "Cowboy shot", value: "cowboy_shot" },
  { label: "Full body", value: "Full_body" },
] as const;

export const MODE_PROMPT_DEFAULTS: Record<GenerationMode, PromptMode> = {
  illustrious: {
    aesthetics: "masterpiece, best quality",
    negative_prompt: "bad quality, worst quality",
  },
  anima: {
    aesthetics: "masterpiece, best quality, score_7",
    negative_prompt:
      "bad quality, worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia",
  },
  qi2: {
    aesthetics: "",
    negative_prompt:
      "bad quality, worst quality, low quality, blurry, jpeg artifacts",
  },
};

const MODE_SETTING_KEYS: Record<GenerationMode, string[]> = {
  illustrious: [
    "target_size",
    "ckpt_name",
    "sampler",
    "scheduler",
    "steps",
    "cfg",
    "seed",
    "seed_mode",
    "dmd_lora_name",
    "dmd_lora_strength",
    "turbo_previous_settings",
    "age_lora_name",
    "lora_stack",
  ],
  anima: [
    "target_size",
    "diffusion_model_name",
    "clip_name",
    "vae_name",
    "sampler",
    "scheduler",
    "steps",
    "cfg",
    "seed",
    "seed_mode",
    "turbo_enabled",
    "dmd_lora_name",
    "dmd_lora_strength",
    "turbo_previous_settings",
    "lora_stack",
  ],
  qi2: [
    "target_size",
    "diffusion_model_name",
    "clip_name",
    "vae_name",
    "clip_type",
    "sampler",
    "scheduler",
    "steps",
    "cfg",
    "seed",
    "seed_mode",
    "turbo_enabled",
    "dmd_lora_name",
    "dmd_lora_strength",
    "turbo_previous_settings",
    "qi2_cache",
    "qi2_overhaul_strength",
    "lora_stack",
  ],
};

function emptyLoraStack(): LoraSlot[] {
  return Array.from({ length: LORA_SLOTS }, () => ({ name: "", strength: 1 }));
}

const ILLUSTRIOUS_DEFAULTS: ModeProfile = {
  target_size: 1024,
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
  age_lora_name: "",
  lora_stack: emptyLoraStack(),
};

const ANIMA_DEFAULTS: ModeProfile = {
  diffusion_model_name: "",
  clip_name: ANIMA_CLIP_NAME,
  vae_name: ANIMA_VAE_NAME,
  target_size: 1024,
  sampler: "er_sde",
  scheduler: "simple",
  steps: 30,
  cfg: 4,
  seed: 0,
  seed_mode: "fixed",
  turbo_enabled: false,
  dmd_lora_name: ANIMA_TURBO_LORA_NAME,
  dmd_lora_strength: 1,
  turbo_previous_settings: null,
  lora_stack: emptyLoraStack(),
};

const QI2_DEFAULTS: ModeProfile = {
  diffusion_model_name: QI2_MODEL_NAME,
  clip_name: QI2_CLIP_NAME,
  vae_name: QI2_VAE_NAME,
  target_size: 1024,
  clip_type: "qwen_image",
  sampler: "euler",
  scheduler: "simple",
  steps: 25,
  cfg: 3,
  seed: 0,
  seed_mode: "fixed",
  turbo_enabled: false,
  dmd_lora_name: QI2_TURBO_LORA_NAME,
  dmd_lora_strength: 1,
  turbo_previous_settings: null,
  qi2_overhaul_strength: 0.5,
  qi2_cache: { device: "gpu", dtype: "int8" },
  lora_stack: emptyLoraStack(),
};

export function normalizeMode(mode: unknown): string {
  return String(mode || "illustrious").toLowerCase();
}

function isKnownMode(mode: string): mode is GenerationMode {
  return mode === "illustrious" || mode === "anima" || mode === "qi2";
}

export function generationDefaults(mode: string): ModeProfile {
  let defaults = ILLUSTRIOUS_DEFAULTS;
  if (mode === "qi2") {
    defaults = QI2_DEFAULTS;
  } else if (mode === "anima") {
    defaults = ANIMA_DEFAULTS;
  }
  return { ...structuredClone(defaults), seed: 0 };
}

function cloneSettingsValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => ({ ...item })) as T;
  }
  if (value && typeof value === "object") {
    return { ...value };
  }
  return value;
}

export function normalizeOverhaulStrength(value: unknown): number {
  if (value == null || value === "") {
    return 0.5;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(Math.max(0, Math.min(1, numeric)) * 4) / 4
    : 0.5;
}

function basename(name: unknown): string {
  return (
    String(name || "")
      .replace(/\\/g, "/")
      .split("/")
      .pop() ?? ""
  ).toLowerCase();
}

// The catalogue publishes the adapter under versioned names (V1, V1.2, ...).
const OVERHAUL_FILE = /^vnccs_qi2_animeoverhaulv\d+(?:\.\d+)*\.safetensors$/;

/** The overhaul LoRA has its own control and never belongs in the manual stack. */
export function isCreatorOverhaulLora(name: unknown): boolean {
  return OVERHAUL_FILE.test(basename(name));
}

function ensureLoraStack(profile: { lora_stack?: unknown }): void {
  const stack = (Array.isArray(profile.lora_stack) ? profile.lora_stack : [])
    .filter(
      (item: Partial<LoraSlot> | null) => !isCreatorOverhaulLora(item?.name)
    )
    .slice(0, LORA_SLOTS) as Partial<LoraSlot>[];
  while (stack.length < LORA_SLOTS) {
    stack.push({ name: "", strength: 1 });
  }
  profile.lora_stack = stack.map((item) => ({
    name: item?.name || "",
    strength: item?.strength ?? 1,
  }));
}

const SLASHES = /\\/g;

function slashes(value: unknown): string {
  return String(value || "").replace(SLASHES, "/");
}

/** A catalog entry's path relative to its models/<folder>, as ComfyUI lists it. */
export function ccRelPath(entry: CatalogEntry | null | undefined): string {
  const parts = slashes(entry?.local_path).split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "models") {
    return parts.slice(2).join("/");
  }
  return parts.at(-1) || "";
}

function ccNormalize(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function ccKind(entry: CatalogEntry | null | undefined): string {
  return ccNormalize(entry?.kind ?? entry?.Kind);
}

export function ccType(entry: CatalogEntry | null | undefined): string {
  return ccNormalize(entry?.type ?? entry?.Type);
}

export type ModelEntry = CatalogEntry & { source?: string };

/** Catalog entries first (marked installed when the file exists), then local-only files. */
export function mergeCcAndLocalEntries(
  ccList: CatalogEntry[],
  localNames: string[],
  folder: string,
  type: string,
  kind: string
): ModelEntry[] {
  const localSet = new Set(localNames.map(slashes));
  const seen = new Set<string>();
  const merged: ModelEntry[] = [];
  for (const entry of ccList) {
    const rel = ccRelPath(entry);
    if (!rel) {
      continue;
    }
    seen.add(rel);
    merged.push({
      ...entry,
      status: localSet.has(rel) ? "installed" : entry.status,
    });
  }
  for (const name of localNames) {
    const rel = slashes(name);
    if (!rel || seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    merged.push({
      name: rel,
      type,
      kind,
      local_path: `models/${folder}/${rel}`,
      status: "installed",
      description: "Local ComfyUI model.",
      source: "local",
    });
  }
  return merged;
}

export interface LocalAssets {
  checkpoints: string[];
  diffusion_models: string[];
  loras: string[];
  text_encoders: string[];
  vae_models: string[];
}

export const NO_LOCAL_ASSETS: LocalAssets = {
  checkpoints: [],
  diffusion_models: [],
  loras: [],
  text_encoders: [],
  vae_models: [],
};

export function localAssetsFrom(lists: ContextLists): LocalAssets {
  return {
    checkpoints: lists.checkpoints,
    diffusion_models: lists.diffusion_models,
    loras: lists.loras,
    text_encoders: lists.text_encoders,
    vae_models: lists.vae_models,
  };
}

/** The Control Center catalog sections the Creator reads model cards from. */
export interface CreatorCatalog {
  clip: CatalogEntry[];
  lora: CatalogEntry[];
  models: CatalogEntry[];
  vae: CatalogEntry[];
}

export interface CreatorContext {
  catalog: CreatorCatalog | null;
  defaultStyle: string;
  downloads: DownloadStatusMap;
  local: LocalAssets;
}

const TRANSIENT = new Set(["queued", "downloading", "error", "auth_required"]);

export function defaultCharacterInfo(defaultStyle: string): CharacterInfo {
  return {
    sex: "female",
    age: 18,
    framing: "cowboy_shot",
    style: defaultStyle,
    custom_style: "",
    race: "human",
    skin_color: "",
    hair: "black hair, waist-length hair",
    eyes: "",
    face: "",
    body: "",
    additional_details: "",
    nsfw: false,
    aesthetics: "masterpiece, best quality",
    negative_prompt: "bad quality, worst quality",
    lora_prompt: "",
    background_color: "Green",
  };
}

/** The widget's state for a freshly created node. */
export function defaultCreatorState(defaultStyle: string): CreatorState {
  return {
    preview_valid: false,
    preview_source: "gen",
    sprite_preview_index: 0,
    sprite_preview_count: 0,
    sprite_preview_cache_bust: "",
    sprite_preview_request_id: 0,
    character: "",
    prompt_modes: structuredClone(MODE_PROMPT_DEFAULTS),
    prompt_defaults_version: 1,
    character_info: defaultCharacterInfo(defaultStyle),
    gen_settings: {
      generation_mode: "illustrious",
      target_size: 1024,
      background_model_kind: "",
      previous_background_color: "Green",
      ckpt_name: "",
      sampler: "euler",
      scheduler: "normal",
      steps: 20,
      cfg: 8,
      seed: 0,
      seed_mode: "fixed",
      diffusion_model_name: "",
      clip_name: "",
      vae_name: "",
      mode_settings: {
        illustrious: generationDefaults("illustrious"),
        anima: generationDefaults("anima"),
        qi2: generationDefaults("qi2"),
      },
      anima_defaults_applied: false,
      generation_defaults_version: 2,
      dmd_lora_name: "",
      dmd_lora_strength: 1,
      age_lora_name: "",
      lora_stack: emptyLoraStack(),
    },
  };
}

function splitPromptTokens(value: string | null | undefined): string[] {
  return (value || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function joinPromptTokens(tokens: string[]): string {
  return [...new Set(tokens)].join(", ");
}

/** Default tokens first, then the user's extra tokens. */
export function mergePromptDefaultWithCustom(
  baseText: string,
  defaultText: string
): string {
  const defaultTokens = splitPromptTokens(defaultText);
  const defaultSet = new Set(defaultTokens);
  const extraTokens = splitPromptTokens(baseText).filter(
    (token) => !defaultSet.has(token)
  );
  return joinPromptTokens([...defaultTokens, ...extraTokens]);
}

export function removePromptToken(
  value: string,
  tokenToRemove: string
): string {
  return joinPromptTokens(
    splitPromptTokens(value).filter(
      (token) => token.toLowerCase() !== tokenToRemove.toLowerCase()
    )
  );
}

function isAlpha(value: unknown): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "alpha" || normalized === "transparent";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export interface CreatorProblem {
  message: string;
  title: string;
}

export interface TurboCard {
  enabled: boolean;
  entry: CatalogEntry;
  rel: string;
}

export interface ModeLoraCards {
  age: { entry: CatalogEntry; rel: string; selected: boolean }[];
  overhaul: { entry: CatalogEntry; strength: number } | null;
  turbo: TurboCard[];
}

/**
 * Model over one Creator state. Mutating methods are ported from the widget
 * closures and are only called through {@link updateCreatorState}, which works
 * on a copy.
 */
export class CreatorModel {
  readonly context: CreatorContext;
  readonly state: CreatorState;

  constructor(state: CreatorState, context: CreatorContext) {
    this.state = state;
    this.context = context;
  }

  get settings(): GenSettings {
    return this.state.gen_settings;
  }

  mode(): string {
    return normalizeMode(this.settings.generation_mode);
  }

  // --- Generation profiles -------------------------------------------------

  getModeProfile(mode: string): ModeProfile {
    const normalized = normalizeMode(mode);
    this.settings.mode_settings ??= {};
    const defaults = generationDefaults(normalized);
    const { resolution_preset: legacyPreset, ...existing } = (this.settings
      .mode_settings[normalized] ?? {}) as Partial<ModeProfile>;
    const profile: ModeProfile = { ...defaults, ...existing };
    const legacyTargetSize =
      normalized === "anima" && existing.target_size == null
        ? LEGACY_ANIMA_RESOLUTION_SCALES[
            String(legacyPreset || "").toLowerCase()
          ]
        : undefined;
    profile.target_size = resolutionScaleValue(
      resolutionScaleMegapixels(
        legacyTargetSize ?? profile.target_size ?? defaults.target_size
      )
    );
    if (normalized === "qi2") {
      profile.clip_type = "qwen_image";
      profile.qi2_overhaul_strength = normalizeOverhaulStrength(
        profile.qi2_overhaul_strength
      );
      profile.qi2_cache = {
        device: profile.qi2_cache?.device || "gpu",
        dtype: profile.qi2_cache?.dtype || "int8",
      };
      if (profile.turbo_enabled) {
        profile.steps = 6;
        profile.cfg = 1;
      }
    }
    if (isKnownMode(normalized)) {
      ensureLoraStack(profile);
    }
    this.settings.mode_settings[normalized] = profile;
    return profile;
  }

  saveCurrentGenerationModeValues(mode: string = this.mode()): void {
    const normalized = normalizeMode(mode);
    const profile = this.getModeProfile(normalized);
    const keys = isKnownMode(normalized) ? MODE_SETTING_KEYS[normalized] : [];
    for (const key of keys) {
      if (this.settings[key] !== undefined) {
        profile[key] = cloneSettingsValue(this.settings[key]);
      }
    }
    if (isKnownMode(normalized)) {
      ensureLoraStack(profile);
    }
  }

  applyGenerationProfile(mode: string): void {
    const normalized = normalizeMode(mode);
    const profile = this.getModeProfile(normalized);
    const keys = isKnownMode(normalized) ? MODE_SETTING_KEYS[normalized] : [];
    for (const key of keys) {
      this.settings[key] = cloneSettingsValue(profile[key]);
    }
    if (isKnownMode(normalized)) {
      ensureLoraStack(this.settings);
    }
  }

  migrateGenerationModeSettings(): void {
    const g = this.settings;
    g.generation_mode = normalizeMode(g.generation_mode);
    const currentMode = g.generation_mode;
    const existingModes = g.mode_settings ?? {};
    g.mode_settings = {
      illustrious: {
        ...generationDefaults("illustrious"),
        ...existingModes.illustrious,
      },
      anima: { ...generationDefaults("anima"), ...existingModes.anima },
      qi2: { ...generationDefaults("qi2"), ...existingModes.qi2 },
    };
    for (const profile of Object.values(g.mode_settings)) {
      ensureLoraStack(profile);
    }
    if (
      (g.generation_defaults_version || 0) < GENERATION_DEFAULTS_VERSION ||
      !existingModes[currentMode]
    ) {
      const target = g.mode_settings[currentMode];
      if (target && isKnownMode(currentMode)) {
        for (const key of MODE_SETTING_KEYS[currentMode]) {
          if (g[key] !== undefined && g[key] !== "") {
            target[key] = cloneSettingsValue(g[key]);
          }
        }
        ensureLoraStack(target);
      }
    }
    g.generation_defaults_version = GENERATION_DEFAULTS_VERSION;
    this.applyGenerationProfile(currentMode);
  }

  // --- Background ----------------------------------------------------------

  /** The background control's setValue: alpha is QI2-only and falls back to the last solid colour. */
  setBackground(value: unknown, persist = false): void {
    const info = this.state.character_info;
    const supportsAlpha = this.mode() === "qi2";
    let normalized = String(value || "Green");
    if (isAlpha(normalized)) {
      const previous = this.settings.previous_background_color;
      if (supportsAlpha) {
        normalized = "Transparent";
      } else {
        normalized =
          previous === "Green" || previous === "Blue" ? previous : "Green";
      }
    }
    info.background_color = normalized;
    if (persist && supportsAlpha && normalized !== "Transparent") {
      this.settings.previous_background_color = normalized;
    }
  }

  /** QI2 renders native transparency; switching to it selects Alpha and remembers the colour. */
  syncBackgroundForGenerationMode(force = false): boolean {
    const info = this.state.character_info;
    const mode = this.mode();
    const modelChanged = force || this.settings.background_model_kind !== mode;
    const current = String(info.background_color || "Green");
    if (mode === "qi2" && modelChanged) {
      if (!isAlpha(current)) {
        this.settings.previous_background_color = current;
      }
      info.background_color = "Transparent";
    } else if (mode !== "qi2" && isAlpha(current)) {
      const previous = String(
        this.settings.previous_background_color || "Green"
      );
      info.background_color =
        previous === "Green" || previous === "Blue" ? previous : "Green";
    }
    this.settings.background_model_kind = mode;
    this.setBackground(info.background_color || "Green");
    return modelChanged || current !== info.background_color;
  }

  // --- Prompt modes ----------------------------------------------------------

  applyPromptModeToFields(mode: string): void {
    const prompt =
      this.state.prompt_modes[mode] ??
      (isKnownMode(mode) ? MODE_PROMPT_DEFAULTS[mode] : undefined);
    if (prompt) {
      this.state.character_info.aesthetics = prompt.aesthetics;
      this.state.character_info.negative_prompt = prompt.negative_prompt;
    }
  }

  saveCurrentPromptModeValues(): void {
    const mode = this.mode();
    if (!this.state.prompt_modes[mode]) {
      this.state.prompt_modes[mode] = isKnownMode(mode)
        ? { ...MODE_PROMPT_DEFAULTS[mode] }
        : { aesthetics: "", negative_prompt: "" };
    }
    const prompt = this.state.prompt_modes[mode];
    prompt.aesthetics = this.state.character_info.aesthetics || "";
    prompt.negative_prompt = this.state.character_info.negative_prompt || "";
  }

  migratePromptModes(): void {
    const info = this.state.character_info;
    const existing = this.state.prompt_modes ?? {};
    const merged: Record<GenerationMode, PromptMode> = {
      illustrious: {
        ...MODE_PROMPT_DEFAULTS.illustrious,
        ...existing.illustrious,
      },
      anima: { ...MODE_PROMPT_DEFAULTS.anima, ...existing.anima },
      qi2: { ...MODE_PROMPT_DEFAULTS.qi2, ...existing.qi2 },
    };
    if ((this.state.prompt_defaults_version || 0) < PROMPT_DEFAULTS_VERSION) {
      merged.illustrious.aesthetics =
        info.aesthetics || merged.illustrious.aesthetics;
      merged.illustrious.negative_prompt =
        info.negative_prompt || merged.illustrious.negative_prompt;
      for (const mode of ["anima", "qi2"] as const) {
        merged[mode].aesthetics = removePromptToken(
          mergePromptDefaultWithCustom(
            merged[mode].aesthetics,
            MODE_PROMPT_DEFAULTS[mode].aesthetics
          ),
          "anime"
        );
        merged[mode].negative_prompt = mergePromptDefaultWithCustom(
          merged[mode].negative_prompt,
          MODE_PROMPT_DEFAULTS[mode].negative_prompt
        );
      }
    }
    this.state.prompt_modes = merged;
    this.state.prompt_defaults_version = PROMPT_DEFAULTS_VERSION;
    this.applyPromptModeToFields(this.mode());
  }

  /** The prompt textareas; aesthetics and negative prompt are kept per family. */
  setPromptText(
    key: "aesthetics" | "negative_prompt" | "lora_prompt",
    value: string
  ): void {
    this.state.character_info[key] = value;
    if (key !== "lora_prompt") {
      const mode = this.mode();
      if (!this.state.prompt_modes[mode]) {
        this.state.prompt_modes[mode] = isKnownMode(mode)
          ? { ...MODE_PROMPT_DEFAULTS[mode] }
          : { aesthetics: "", negative_prompt: "" };
      }
      this.state.prompt_modes[mode][key] = value;
      this.state.prompt_defaults_version = PROMPT_DEFAULTS_VERSION;
    }
  }

  // --- Mode, turbo and LoRAs -------------------------------------------------

  setGenerationMode(mode: string): void {
    const next = normalizeMode(mode);
    this.saveCurrentPromptModeValues();
    this.saveCurrentGenerationModeValues(this.mode());
    this.settings.generation_mode = next;
    this.applyGenerationProfile(next);
    this.applyPromptModeToFields(next);
  }

  /** ANIMA/QI2 turbo: fixed steps at CFG 1, restoring the previous values when switched off. */
  setTurboMode(enabled: boolean): void {
    const g = this.settings;
    const mode = this.mode();
    if (mode !== "anima" && mode !== "qi2") {
      return;
    }
    if (enabled) {
      if (!g.turbo_enabled) {
        g.turbo_previous_settings = { steps: g.steps, cfg: g.cfg };
      }
      g.turbo_enabled = true;
      g.dmd_lora_strength = 1;
      g.steps = mode === "qi2" ? 6 : 12;
      g.cfg = 1;
    } else {
      g.turbo_enabled = false;
      const previous = g.turbo_previous_settings ?? {};
      g.steps = previous.steps ?? (mode === "qi2" ? 25 : 30);
      g.cfg = previous.cfg ?? (mode === "qi2" ? 3 : 4);
      g.turbo_previous_settings = null;
    }
  }

  /** A turbo card toggle; Illustrious uses the DMD2 LoRA at 4 steps instead. */
  setCcTurboMode(enabled: boolean, rel: string): void {
    const g = this.settings;
    const mode = this.mode();
    if (mode === "anima" || mode === "qi2") {
      g.dmd_lora_name = rel || g.dmd_lora_name || "";
      this.setTurboMode(enabled);
      return;
    }
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

  setAgeLora(enabled: boolean, rel: string): void {
    this.settings.age_lora_name = enabled ? rel : "";
  }

  setOverhaulStrength(value: unknown): void {
    this.settings.qi2_overhaul_strength = normalizeOverhaulStrength(value);
  }

  setLoraSlot(index: number, patch: Partial<LoraSlot>): void {
    ensureLoraStack(this.settings);
    const stack = this.settings.lora_stack as LoraSlot[];
    const slot = stack[index];
    if (slot) {
      stack[index] = { ...slot, ...patch };
    }
  }

  setQi2Cache(patch: Partial<Qi2CacheSettings>): void {
    this.settings.qi2_cache = {
      ...(this.settings.qi2_cache ?? { device: "gpu", dtype: "int8" }),
      ...patch,
    };
  }

  toggleSeedMode(): void {
    this.settings.seed_mode =
      (this.settings.seed_mode || "fixed") === "randomize"
        ? "fixed"
        : "randomize";
  }

  /** Before a preview or a queued run, like `_randomizeSeedIfNeeded`. */
  randomizeSeedIfNeeded(random: () => number = Math.random): boolean {
    if (this.settings.seed_mode !== "randomize") {
      return false;
    }
    this.settings.seed = Math.floor(random() * 10_000_000_000_000);
    return true;
  }

  // --- Model selection ---------------------------------------------------------

  private ccEntries(
    section: keyof CreatorCatalog,
    kind: string | null,
    predicate?: (entry: CatalogEntry) => boolean
  ): CatalogEntry[] {
    return (this.context.catalog?.[section] ?? []).filter((entry) => {
      const kindOk = !kind || ccKind(entry) === ccNormalize(kind);
      return kindOk && (!predicate || predicate(entry));
    });
  }

  ensureAnimaDefaultAux(): void {
    const g = this.settings;
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
    const g = this.settings;
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

  /** Pick a model card; ANIMA and QI2 also pin their family's CLIP and VAE. */
  selectModel(mode: string, rel: string): void {
    if (!rel) {
      return;
    }
    if (mode === "anima") {
      this.ensureAnimaDefaultAux();
      this.settings.diffusion_model_name = rel;
    } else if (mode === "qi2") {
      this.ensureQi2DefaultAux();
      this.settings.diffusion_model_name = rel;
    } else {
      this.settings.ckpt_name = rel;
    }
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

  /** The picker head: the selected entry, or the first one when the selection is unknown. */
  selectedModelEntry(mode: string = this.mode()): ModelEntry | null {
    const entries = this.modelEntries(mode);
    const current = slashes(this.settings[this.selectedModelKey(mode)]);
    return (
      entries.find((entry) => ccRelPath(entry) === current) ??
      entries[0] ??
      null
    );
  }

  /**
   * Defaults the card renderer applied whenever the catalog was present: an
   * empty model slot takes the first card, and ANIMA/QI2 pin their CLIP/VAE.
   */
  syncCatalogDefaults(): void {
    if (!this.context.catalog) {
      return;
    }
    const g = this.settings;
    const mode = this.mode();
    const animaFirst = this.modelEntries("anima")[0];
    if (!slashes(g.diffusion_model_name) && animaFirst) {
      this.selectModel("anima", ccRelPath(animaFirst));
    }
    this.ensureAnimaDefaultAux();
    if (mode === "qi2") {
      const qi2First = this.modelEntries("qi2")[0];
      if (!slashes(g.diffusion_model_name) && qi2First) {
        this.selectModel("qi2", ccRelPath(qi2First));
      }
      this.ensureQi2DefaultAux();
    }
    const illustriousFirst = this.modelEntries("illustrious")[0];
    if (!g.ckpt_name && illustriousFirst) {
      g.ckpt_name = ccRelPath(illustriousFirst);
    }
  }

  modeLoraCards(mode: string = this.mode()): ModeLoraCards {
    const g = this.settings;
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
    const loras = this.context.catalog?.lora ?? [];
    const dmd = slashes(g.dmd_lora_name);
    const turbo = loras
      .filter((entry) => kindOk(entry) && ccType(entry) === "turbolora")
      .map((entry) => {
        const rel = ccRelPath(entry);
        const on =
          mode === "anima" || mode === "qi2"
            ? Boolean(g.turbo_enabled)
            : (g.dmd_lora_strength || 0) > 0;
        return { entry, rel, enabled: on && dmd === rel };
      });
    let overhaul: ModeLoraCards["overhaul"] = null;
    if (mode === "qi2") {
      const entry =
        loras.find(
          (item) =>
            ccKind(item) === "qi2" &&
            ccType(item) === "helper" &&
            (item.name === QI2_OVERHAUL_ENTRY.name ||
              isCreatorOverhaulLora(ccRelPath(item)))
        ) ?? QI2_OVERHAUL_ENTRY;
      const installed = new Set(this.context.local.loras.map(slashes)).has(
        ccRelPath(entry)
      );
      overhaul = {
        entry: installed ? { ...entry, status: "installed" } : entry,
        strength: normalizeOverhaulStrength(g.qi2_overhaul_strength),
      };
    }
    const age = slashes(g.age_lora_name);
    return {
      turbo,
      overhaul,
      age: loras
        .filter((entry) => kindOk(entry) && ccType(entry) === "ageslider")
        .map((entry) => {
          const rel = ccRelPath(entry);
          return { entry, rel, selected: Boolean(rel) && age === rel };
        }),
    };
  }

  /** LoRAs for the manual stack, without the overhaul adapter. */
  stackLoraOptions(): string[] {
    return this.context.local.loras.filter(
      (name) => !isCreatorOverhaulLora(name)
    );
  }

  resolveStatus(category: DownloadCategory, entry: CatalogEntry): string {
    const download = this.context.downloads[downloadKey(category, entry.name)];
    return download && TRANSIENT.has(download.status)
      ? download.status
      : entry.status || "missing";
  }

  private localAssetHas(key: string, rel: string): boolean {
    const map: Record<string, string[]> = {
      ckpt_name: this.context.local.checkpoints,
      diffusion_model_name: this.context.local.diffusion_models,
      clip_name: this.context.local.text_encoders,
      vae_name: this.context.local.vae_models,
    };
    return new Set((map[key] ?? []).map(slashes)).has(slashes(rel));
  }

  isSelectedCcAssetInstalled(
    section: "models" | "clip" | "vae",
    kind: string | null,
    key: string,
    predicate?: (entry: CatalogEntry) => boolean
  ): boolean {
    const selected = slashes(this.settings[key]);
    if (!selected) {
      return false;
    }
    if (!this.context.catalog) {
      return true;
    }
    const entries = this.ccEntries(section, kind, predicate);
    if (entries.length === 0) {
      return true;
    }
    const match = entries.find((entry) => ccRelPath(entry) === selected);
    if (!match) {
      return this.localAssetHas(key, selected);
    }
    return this.resolveStatus(section, match) === "installed";
  }

  /** The checks GENERATE PREVIEW ran before rendering. */
  previewProblem(): CreatorProblem | null {
    const g = this.settings;
    if (!this.state.character) {
      return {
        title: "No Character",
        message: "Create a character before generating a preview.",
      };
    }
    const mode = this.mode();
    if (mode === "anima" || mode === "qi2") {
      return this.diffusionPreviewProblem(mode);
    }
    if (!g.ckpt_name) {
      return { title: "Missing Checkpoint", message: "Select Checkpoint" };
    }
    const illustrious = (entry: CatalogEntry) => {
      const kind = ccKind(entry);
      return (
        (kind === "illustrious" || kind === "sdxl") &&
        ccType(entry) === "checkpoint"
      );
    };
    if (
      !this.isSelectedCcAssetInstalled("models", null, "ckpt_name", illustrious)
    ) {
      return {
        title: "Model Missing",
        message: "Download and select an installed Illustrious checkpoint",
      };
    }
    return null;
  }

  private diffusionPreviewProblem(
    mode: "anima" | "qi2"
  ): CreatorProblem | null {
    const g = this.settings;
    if (!g.diffusion_model_name) {
      return { title: "Missing Model", message: "Select Diffusion Model" };
    }
    if (!g.clip_name) {
      return { title: "Missing Model", message: "Select CLIP" };
    }
    if (!g.vae_name) {
      return { title: "Missing Model", message: "Select VAE" };
    }
    const family = mode === "qi2" ? "QI2" : "Anima";
    const label = mode === "qi2" ? "Qwen Image 2.1" : "Anima";
    if (
      !this.isSelectedCcAssetInstalled(
        "models",
        family,
        "diffusion_model_name",
        (entry) => ccType(entry) === "unet"
      )
    ) {
      return {
        title: "Model Missing",
        message: `Download and select an installed ${label} Diffusion Model`,
      };
    }
    if (!this.isSelectedCcAssetInstalled("clip", family, "clip_name")) {
      return {
        title: "Model Missing",
        message: `Download and select an installed ${label} CLIP`,
      };
    }
    if (!this.isSelectedCcAssetInstalled("vae", family, "vae_name")) {
      return {
        title: "Model Missing",
        message: `Download and select an installed ${label} VAE`,
      };
    }
    return null;
  }

  previewPayload(): PreviewPayload {
    const g = this.settings;
    return {
      character: this.state.character,
      character_info: this.state.character_info,
      gen_settings: {
        ...g,
        lora_stack: (g.lora_stack ?? []).filter(
          (item) => item.name && item.name !== "None"
        ),
      },
    };
  }

  // --- Character fields --------------------------------------------------------

  setInfo<K extends keyof CharacterInfo>(
    key: K,
    value: CharacterInfo[K]
  ): void {
    this.state.character_info[key] = value;
  }

  setAge(value: unknown): void {
    const age = Number.parseFloat(String(value));
    if (Number.isFinite(age)) {
      this.state.character_info.age = Math.max(1, Math.min(100, age));
    }
  }

  applyWizardData(data: WizardFields): void {
    const info = this.state.character_info;
    if (data.sex) {
      info.sex = String(data.sex).toLowerCase().startsWith("m")
        ? "male"
        : "female";
    }
    if (data.age !== undefined) {
      info.age = Math.max(
        1,
        Math.min(100, Number.parseInt(String(data.age), 10) || 18)
      );
    }
    for (const { key } of TRAIT_FIELDS) {
      info[key] = data[key] || "";
    }
  }

  /** Adopt freshly loaded metadata; prompt families reset to their defaults. */
  loadCharacterInfo(name: string, saved: Record<string, unknown>): void {
    this.state.character = name;
    this.state.character_info = {
      ...defaultCharacterInfo(this.context.defaultStyle),
      name,
      ...saved,
    } as CharacterInfo;
    this.normalizeInfoFields();
    this.syncBackgroundForGenerationMode(true);
    const info = this.state.character_info;
    this.state.prompt_modes = {
      illustrious: {
        aesthetics:
          info.aesthetics || MODE_PROMPT_DEFAULTS.illustrious.aesthetics,
        negative_prompt:
          info.negative_prompt ||
          MODE_PROMPT_DEFAULTS.illustrious.negative_prompt,
      },
      anima: { ...MODE_PROMPT_DEFAULTS.anima },
      qi2: { ...MODE_PROMPT_DEFAULTS.qi2 },
    };
    this.state.prompt_defaults_version = PROMPT_DEFAULTS_VERSION;
    this.applyPromptModeToFields(this.mode());
  }

  clearCharacterSelection(): void {
    this.state.character = "";
    this.state.character_info = {
      ...defaultCharacterInfo(this.context.defaultStyle),
      name: "",
    };
    this.state.preview_valid = false;
    this.state.preview_source = "gen";
    this.state.sprite_preview_cache_bust = "";
    this.state.sprite_preview_count = 0;
    this.state.sprite_preview_index = 0;
    this.normalizeInfoFields();
  }

  /** What re-syncing the field controls wrote back into the state. */
  normalizeInfoFields(): void {
    const info = this.state.character_info;
    if (typeof info.background_color === "string" && info.background_color) {
      info.background_color = capitalize(info.background_color);
    }
    this.setBackground(info.background_color || "Green");
    info.sex = String(info.sex || "male");
  }

  /** `saveState()`: sync the background, store the active profile and stamp the owner. */
  finalize(previewValid = false): void {
    this.syncBackgroundForGenerationMode();
    this.saveCurrentGenerationModeValues();
    this.state.character_info.name =
      this.state.character || this.state.character_info.name || "";
    this.state.preview_valid = previewValid;
  }
}

export function serializeCreatorState(state: CreatorState): string {
  return JSON.stringify(state);
}

export interface LoadedCreatorState {
  /** Set when the saved character_info was verified to belong to `character`. */
  restoredInfoCharacter: string | null;
  state: CreatorState;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSavedRecord(
  raw: JsonState | null | undefined
): Record<string, unknown> | null {
  if (typeof raw !== "string") {
    return raw ? asRecord(structuredClone(raw)) : null;
  }
  if (!raw || raw === "{}") {
    return null;
  }
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

const PREVIEW_STATE_KEYS = [
  "preview_source",
  "sprite_preview_index",
  "sprite_preview_count",
  "sprite_preview_cache_bust",
] as const;

/** Saved character_info is only trusted when it names the saved character. */
function restoreCharacterInfo(
  state: CreatorState,
  parsed: Record<string, unknown>
): string | null {
  const info = asRecord(parsed.character_info);
  if (!info) {
    return null;
  }
  const owner = String(info.name || "").trim();
  const character = String(parsed.character || state.character || "").trim();
  if (!owner || owner !== character) {
    return null;
  }
  Object.assign(state.character_info, info);
  return character;
}

/** `loadState()`: restore saved widget data onto the defaults. */
export function parseCreatorState(
  raw: JsonState | null | undefined,
  defaultStyle: string
): LoadedCreatorState {
  const state = defaultCreatorState(defaultStyle);
  const parsed = parseSavedRecord(raw);
  if (!parsed) {
    return { state, restoredInfoCharacter: null };
  }
  if (parsed.character) {
    state.character = String(parsed.character);
  }
  const promptModes = asRecord(parsed.prompt_modes);
  if (promptModes) {
    state.prompt_modes = promptModes as Record<string, PromptMode>;
  }
  if (parsed.prompt_defaults_version !== undefined) {
    state.prompt_defaults_version = Number(parsed.prompt_defaults_version);
  }
  const restoredInfoCharacter = restoreCharacterInfo(state, parsed);
  const settings = asRecord(parsed.gen_settings);
  if (settings) {
    Object.assign(state.gen_settings, settings);
    ensureLoraStack(state.gen_settings);
  }
  if (parsed.preview_valid !== undefined) {
    state.preview_valid = Boolean(parsed.preview_valid);
  }
  for (const key of PREVIEW_STATE_KEYS) {
    if (parsed[key] !== undefined) {
      (state as Record<string, unknown>)[key] = parsed[key];
    }
  }
  return { state, restoredInfoCharacter };
}

/**
 * The init sequence after `/vnccs/context_lists` loads: migrate the profiles,
 * fill per-family defaults from the local model lists and migrate prompts.
 */
export function initializeCreatorState(
  state: CreatorState,
  context: CreatorContext
): CreatorState {
  const model = new CreatorModel(structuredClone(state), context);
  model.migrateGenerationModeSettings();
  const illustrious = model.getModeProfile("illustrious");
  if (!illustrious.ckpt_name && context.local.checkpoints.length > 0) {
    illustrious.ckpt_name = context.local.checkpoints[0];
  }
  const anima = model.getModeProfile("anima");
  anima.clip_name ||= ANIMA_CLIP_NAME;
  anima.vae_name ||= ANIMA_VAE_NAME;
  const qi2 = model.getModeProfile("qi2");
  qi2.diffusion_model_name ||= QI2_MODEL_NAME;
  qi2.clip_name ||= QI2_CLIP_NAME;
  qi2.vae_name ||= QI2_VAE_NAME;
  model.applyGenerationProfile(model.mode());
  model.migratePromptModes();
  model.saveCurrentGenerationModeValues();
  model.syncCatalogDefaults();
  model.normalizeInfoFields();
  // The preview is reloaded next and marks itself valid once it shows.
  model.finalize(false);
  return model.state;
}

/** A model over a private copy of the state, for reads. */
export function viewCreatorState(
  state: CreatorState,
  context: CreatorContext
): CreatorModel {
  return new CreatorModel(structuredClone(state), context);
}

/**
 * Apply one user action and return the state the widget would have saved.
 * Every save invalidated the preview unless the action itself showed one.
 */
export function updateCreatorState(
  state: CreatorState,
  context: CreatorContext,
  mutate: (model: CreatorModel) => void,
  options: { previewValid?: boolean } = {}
): CreatorState {
  const model = new CreatorModel(structuredClone(state), context);
  mutate(model);
  model.syncCatalogDefaults();
  model.finalize(options.previewValid ?? false);
  return model.state;
}
