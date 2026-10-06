import type { CatalogEntry, ControlCenterCatalog } from "./control-center";
import type { NodeState } from "./control-center-state";
import type { JsonState } from "./graphs";
import { resolutionScaleText, snapTargetSize } from "./resolution";
import { type ImageRef, imageRef } from "./uploads";

/**
 * Clothes Designer widget state (`widget_data` of `ClothesDesigner`, Step 2),
 * ported from `web/vnccs_clothes_designer.js`. The node hashes the whole
 * widget_data into its preview cache key, so keys the app does not use
 * (older workflows, the full character_info) are kept as they are.
 */

export type ClothesTab = "generate" | "clone";
export type CostumeField = "top" | "bottom" | "head" | "shoes" | "face";
export type SeedMode = "fixed" | "randomize";

/** Field order of the Generate tab and the wizard. */
export const COSTUME_FIELDS: readonly CostumeField[] = [
  "top",
  "bottom",
  "shoes",
  "head",
  "face",
];

export const COSTUME_FIELD_PLACEHOLDERS: Record<CostumeField, string> = {
  top: "e.g. White t-shirt",
  bottom: "e.g. Blue jeans",
  shoes: "e.g. Sneakers",
  head: "e.g. Hat",
  face: "Face features (e.g. glasses)",
};

export const TRANSPARENT_BACKGROUND = "Transparent";

export const CLOTHES_BACKGROUNDS = [
  { label: "Green", value: "Green" },
  { label: "Blue", value: "Blue" },
  { label: "Alpha", value: TRANSPARENT_BACKGROUND },
] as const;

/** Base sprite sets: previews fall back to them, but they cannot be edited or deleted. */
export const BASE_COSTUMES = ["Naked", "Original"] as const;

export const DEFAULT_CLOTHES_CORE_NAME = "VNCCS Clothes Core";
export const MISSING_CLOTHES_CORE_HINT =
  "Connect VNCCS Control Center with VNCCS Clothes Core.";

export type CostumeInfo = Record<CostumeField, string>;

/** The pose sprite a preview was taken from; the node dresses that sprite. */
export interface SelectedPreviewSprite {
  character: string;
  costume: string;
  count: number;
  index: number;
}

export interface ClothesGenSettings {
  background_color: string;
  /** The model family the background was last synced for. */
  background_model_kind: string;
  lora_name: string;
  lora_strength: number;
  /** Restored when leaving Qwen Image 2.1, which forces Transparent. */
  previous_background_color: string;
  seed: number;
  seed_mode: SeedMode | string;
  /** Null follows the model (Auto). */
  target_size: number | null;
  [key: string]: unknown;
}

export interface ClothesCharacterInfo {
  age: number;
  sex: string;
  [key: string]: unknown;
}

export interface ClothesState {
  activeTab: ClothesTab;
  character: string;
  character_info: ClothesCharacterInfo;
  clone_image: ImageRef | null;
  costume: string;
  costume_info: CostumeInfo & Record<string, unknown>;
  gen_settings: ClothesGenSettings;
  selected_preview_sprite: SelectedPreviewSprite | null;
  [key: string]: unknown;
}

export interface ClothesProblem {
  message: string;
  title: string;
}

/** What the model reads from the Control Center: the active family and its LoRA rows. */
export interface ClothesContext {
  kind: string;
  loras: readonly CatalogEntry[];
}

export interface ClothesCoreCard {
  description: string;
  entry: CatalogEntry | null;
  installed: boolean;
  name: string;
}

export interface ClothesResolution {
  auto: boolean;
  label: string;
  size: number;
}

function emptyCostumeInfo(): CostumeInfo {
  return { top: "", bottom: "", head: "", face: "", shoes: "" };
}

export function defaultClothesState(): ClothesState {
  return {
    character: "",
    costume: "Naked",
    activeTab: "generate",
    clone_image: null,
    selected_preview_sprite: null,
    costume_info: emptyCostumeInfo(),
    character_info: { sex: "female", age: 18 },
    gen_settings: {
      background_color: "Green",
      background_model_kind: "",
      previous_background_color: "Green",
      target_size: null,
      seed: 0,
      seed_mode: "fixed",
      lora_name: "none",
      lora_strength: 1.0,
    },
  };
}

export function isEditableCostume(value: unknown): boolean {
  const costume = String(value ?? "").trim();
  return (
    Boolean(costume) && !(BASE_COSTUMES as readonly string[]).includes(costume)
  );
}

export function deleteCostumePrompt(character: string, costume: string) {
  return `Delete "${costume}" for ${character}? This removes its settings, generated images, and preview.`;
}

/** Costumes the select lists; base sprite sets are hidden. */
export function displayCostumes(list: readonly unknown[]): string[] {
  return list
    .map(String)
    .filter((name) => !(BASE_COSTUMES as readonly string[]).includes(name));
}

const NON_ALPHANUMERIC_RUN = /[^a-z0-9]+/g;
const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const BACKSLASHES = /\\/g;
const PATH_SEPARATORS = /[\\/]/;
const SAFETENSORS = /\.safetensors$/i;
const ABSOLUTE_LORAS = "/models/loras/";

export function isClothesCoreLora(value: unknown): boolean {
  const compact = String(value ?? "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_RUN, "");
  return (
    compact.includes("vnccs") &&
    compact.includes("clothes") &&
    compact.includes("core")
  );
}

/**
 * The widget's `normalizeLoraPath`: a catalog row or path relative to
 * `models/loras`, also for absolute paths (unlike the Creator's `ccRelPath`).
 */
export function normalizeLoraPath(
  value: CatalogEntry | string | null | undefined
): string {
  const source = typeof value === "object" ? value?.local_path : value;
  const raw = String(source || "").replace(BACKSLASHES, "/");
  if (!raw) {
    return "";
  }
  const lower = raw.toLowerCase();
  const absolute = lower.lastIndexOf(ABSOLUTE_LORAS);
  if (absolute >= 0) {
    return raw.slice(absolute + ABSOLUTE_LORAS.length);
  }
  if (lower.startsWith("models/loras/")) {
    return raw.slice("models/loras/".length);
  }
  if (lower.startsWith("loras/")) {
    return raw.slice("loras/".length);
  }
  return raw;
}

/** The Control Center's active family, as the widget read `_selectedKind()`. */
export function clothesModelKind(nodeState: NodeState | null | undefined) {
  return String(nodeState?.active_kind ?? "").trim();
}

export function clothesContext(
  nodeState: NodeState | null | undefined,
  catalog: Pick<ControlCenterCatalog, "lora"> | null | undefined
): ClothesContext {
  return { kind: clothesModelKind(nodeState), loras: catalog?.lora ?? [] };
}

/** Auto resolution: 1.5 MP for MiniMax H3, 1 MP for the other families. */
export function autoTargetSize(kind: string): number {
  const compact = kind.toLowerCase().replace(NON_ALPHANUMERIC, "");
  return compact === "h3" || compact === "minimaxh3" ? 1536 : 1024;
}

export function normalizeCharacterAge(value: unknown): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 18;
}

function costumeText(value: unknown): string {
  return value ? String(value) : "";
}

export class ClothesModel {
  readonly state: ClothesState;
  readonly context: ClothesContext;

  constructor(state: ClothesState, context: ClothesContext) {
    this.state = state;
    this.context = context;
  }

  get settings(): ClothesGenSettings {
    return this.state.gen_settings;
  }

  private kind(): string {
    return this.context.kind.trim().toLowerCase();
  }

  editable(): boolean {
    return isEditableCostume(this.state.costume);
  }

  /** The sprite set the preview shows: the costume, or the base body before one exists. */
  previewCostume(): string {
    return this.editable() ? this.state.costume : "Naked";
  }

  // --- Costume ------------------------------------------------------------------

  setCostumeField(key: CostumeField, value: string): void {
    this.state.costume_info[key] = value;
  }

  /** `/vnccs/get_costume` replaces the fields wholesale. */
  applyCostumeInfo(info: Record<string, unknown>): void {
    this.state.costume_info = {
      top: costumeText(info.top),
      bottom: costumeText(info.bottom),
      head: costumeText(info.head),
      face: costumeText(info.face),
      shoes: costumeText(info.shoes),
    };
  }

  applyWizardData(data: Record<string, unknown>): void {
    for (const key of COSTUME_FIELDS) {
      this.state.costume_info[key] = costumeText(data[key]);
    }
  }

  resetCostumeSelection(): void {
    this.state.costume = "";
    this.state.costume_info = emptyCostumeInfo();
    this.state.selected_preview_sprite = null;
  }

  /** After the costume list loaded: keep a listed selection, else take the first. */
  chooseCostume(costumes: readonly string[]): void {
    if (costumes.length === 0) {
      this.state.costume = "";
    } else if (
      this.state.costume === "Naked" ||
      !costumes.includes(this.state.costume)
    ) {
      this.state.costume = costumes[0] as string;
    }
  }

  applyCharacterInfo(info: Record<string, unknown>): void {
    const previous = this.state.character_info;
    this.state.character_info = {
      ...previous,
      ...info,
      age: normalizeCharacterAge(info.age ?? previous.age),
      sex: String(
        info.sex || info.gender || previous.sex || "female"
      ).toLowerCase(),
    };
  }

  setActiveTab(tab: ClothesTab): void {
    this.state.activeTab = tab;
  }

  setCloneImage(ref: ImageRef | null): void {
    this.state.clone_image = ref
      ? { name: ref.name, type: "input", subfolder: ref.subfolder || "" }
      : null;
  }

  setSelectedPreviewSprite(sprite: SelectedPreviewSprite | null): void {
    this.state.selected_preview_sprite = sprite;
  }

  // --- Background ---------------------------------------------------------------

  /**
   * A background button. Choosing Green or Blue under Qwen Image 2.1 also
   * becomes the color restored after leaving it.
   */
  setBackground(value: unknown, persist = true): void {
    const raw = String(value || CLOTHES_BACKGROUNDS[0].value);
    const matched = CLOTHES_BACKGROUNDS.find(
      (option) => option.value.toLowerCase() === raw.toLowerCase()
    );
    const normalized: string = matched?.value ?? raw;
    this.settings.background_color = normalized;
    if (
      persist &&
      this.kind() === "qi2" &&
      normalized !== TRANSPARENT_BACKGROUND
    ) {
      this.settings.previous_background_color = normalized;
    }
  }

  /**
   * Once per family change: Qwen Image 2.1 renders native alpha, the other
   * families need a chroma key. Later clicks are not overridden.
   */
  syncBackgroundForModel(): boolean {
    const kind = this.kind();
    if (!kind || this.settings.background_model_kind === kind) {
      return false;
    }
    const current = String(this.settings.background_color || "Green");
    if (kind === "qi2") {
      if (current !== TRANSPARENT_BACKGROUND) {
        this.settings.previous_background_color = current;
      }
      this.settings.background_color = TRANSPARENT_BACKGROUND;
    } else if (current === TRANSPARENT_BACKGROUND) {
      const previous = String(
        this.settings.previous_background_color || "Green"
      );
      this.settings.background_color =
        previous === "Green" || previous === "Blue" ? previous : "Green";
    }
    this.settings.background_model_kind = kind;
    return true;
  }

  // --- Clothes Core LoRA --------------------------------------------------------

  private loraMatchesKind(entry: CatalogEntry): boolean {
    const kind = this.kind();
    if (!kind) {
      return true;
    }
    return (
      String(entry.kind ?? entry.Kind ?? "")
        .trim()
        .toLowerCase() === kind
    );
  }

  /** The Clothes Core row for the active family, preferring `preferred`. */
  findClothesCoreLora(preferred: string): CatalogEntry | null {
    const wanted = normalizeLoraPath(preferred).toLowerCase();
    const compatible = this.context.loras.filter(
      (entry) =>
        this.loraMatchesKind(entry) &&
        (isClothesCoreLora(entry.name) || isClothesCoreLora(entry.local_path))
    );
    if (wanted) {
      const exact = compatible.find(
        (entry) => normalizeLoraPath(entry).toLowerCase() === wanted
      );
      if (exact) {
        return exact;
      }
    }
    return compatible[0] ?? null;
  }

  /** `setClothesCoreLora()`: record the family's Clothes Core (the node takes it from the pipe). */
  syncClothesCoreLora(): void {
    const entry = this.findClothesCoreLora(this.settings.lora_name);
    const rel = normalizeLoraPath(entry);
    if (rel) {
      this.settings.lora_name = rel;
      const strength = Number(this.settings.lora_strength ?? 1.0) || 1.0;
      this.settings.lora_strength = Math.max(0, Math.min(1, strength));
    } else {
      this.settings.lora_name = "none";
    }
  }

  clothesCoreCard(): ClothesCoreCard {
    const saved =
      this.settings.lora_name === "none" ? "" : this.settings.lora_name;
    let rel = String(saved || "");
    const entry = this.findClothesCoreLora(rel);
    if (entry) {
      rel = normalizeLoraPath(entry);
    }
    const base = rel.split(PATH_SEPARATORS).pop()?.replace(SAFETENSORS, "");
    const installed = Boolean(rel);
    return {
      entry,
      installed,
      name: entry?.name || base || DEFAULT_CLOTHES_CORE_NAME,
      description: installed ? rel : MISSING_CLOTHES_CORE_HINT,
    };
  }

  /** Model-dependent defaults after the Control Center changed. */
  syncControlCenter(): void {
    this.syncClothesCoreLora();
    this.syncBackgroundForModel();
    this.setBackground(this.settings.background_color, false);
  }

  // --- Seed and resolution ------------------------------------------------------

  setSeed(seed: number): void {
    this.settings.seed = Number(seed) || 0;
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

  setTargetSize(size: number | null): void {
    this.settings.target_size = size;
  }

  resolution(): ClothesResolution {
    const auto = this.settings.target_size == null;
    const size = auto
      ? autoTargetSize(this.context.kind)
      : Number(this.settings.target_size);
    return {
      auto,
      size,
      label: `${resolutionScaleText(size)}${auto ? " · Auto" : ""}`,
    };
  }

  // --- Checks -------------------------------------------------------------------

  /** Why GENERATE PREVIEW or a queued run cannot start; checked before any request. */
  runProblem(): ClothesProblem | null {
    if (!this.state.character) {
      return {
        title: "Select Character",
        message: "Select a character before generating clothes.",
      };
    }
    if (!this.editable()) {
      return {
        title: "Costume Required",
        message:
          "Create a new costume first, then select it before generating a preview.",
      };
    }
    if (this.state.activeTab === "clone" && !this.state.clone_image) {
      return {
        title: "Reference Required",
        message:
          "Upload a clothing reference image before using Clone Clothes.",
      };
    }
    return null;
  }

  deleteProblem(previewRunning: boolean): string | null {
    if (!(this.state.character && this.editable())) {
      return "Select an editable costume first. Base sprite sets cannot be deleted.";
    }
    if (previewRunning) {
      return "Wait for preview generation to finish before deleting a costume.";
    }
    return null;
  }
}

export function serializeClothesState(state: ClothesState): string {
  return JSON.stringify(state);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSaved(
  raw: JsonState | null | undefined
): Record<string, unknown> {
  if (typeof raw !== "string") {
    return asRecord(raw ? structuredClone(raw) : null) ?? {};
  }
  try {
    return asRecord(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

/** Kept as saved: the node reads it leniently and it is part of the cache key. */
function selectedSprite(value: unknown): SelectedPreviewSprite | null {
  return asRecord(value) as SelectedPreviewSprite | null;
}

/**
 * The widget's restore: saved keys over the defaults, with costume_info,
 * character_info and gen_settings merged one level deep. Off-grid sizes
 * snap to the resolution slider.
 */
export function parseClothesState(
  raw: JsonState | null | undefined
): ClothesState {
  const defaults = defaultClothesState();
  const saved = parseSaved(raw);
  const state: ClothesState = {
    ...defaults,
    ...saved,
    character: String(saved.character ?? defaults.character),
    costume: String(saved.costume ?? defaults.costume),
    activeTab: saved.activeTab === "clone" ? "clone" : "generate",
    clone_image: imageRef(saved.clone_image),
    selected_preview_sprite: selectedSprite(saved.selected_preview_sprite),
    costume_info: {
      ...defaults.costume_info,
      ...asRecord(saved.costume_info),
    },
    character_info: {
      ...defaults.character_info,
      ...asRecord(saved.character_info),
    },
    gen_settings: {
      ...defaults.gen_settings,
      ...asRecord(saved.gen_settings),
    },
  };
  if (state.gen_settings.target_size != null) {
    state.gen_settings.target_size = snapTargetSize(
      state.gen_settings.target_size
    );
  }
  return state;
}

/** After the context lists loaded: Clothes Core and background follow the Control Center. */
export function initializeClothesState(
  state: ClothesState,
  context: ClothesContext
): ClothesState {
  const model = new ClothesModel(structuredClone(state), context);
  model.syncControlCenter();
  return model.state;
}

/** A model over a private copy of the state, for reads. */
export function viewClothesState(
  state: ClothesState,
  context: ClothesContext
): ClothesModel {
  return new ClothesModel(structuredClone(state), context);
}

/** Apply one action and return the state the widget would have saved. */
export function updateClothesState(
  state: ClothesState,
  context: ClothesContext,
  mutate: (model: ClothesModel) => void
): ClothesState {
  const model = new ClothesModel(structuredClone(state), context);
  mutate(model);
  return model.state;
}
