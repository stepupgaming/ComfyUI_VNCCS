import { TRAIT_FIELDS, type TraitKey } from "./creator-state";
import type { JsonState } from "./graphs";
import type { SpritePreviewState } from "./sprite-preview";
import { type ImageRef, imageRef } from "./uploads";

/**
 * Character Cloner widget state (`widget_data` of `CharacterCloner`), ported
 * from `web/vnccs_character_cloner.js`. The node reads `character`,
 * `character_info` (whose `name` must match `character`), `source_images`
 * (at most one) and `character_info.background_color`.
 */

export interface ClonerCharacterInfo {
  additional_details: string;
  aesthetics: string;
  age: number;
  background_color: string;
  body: string;
  eyes: string;
  face: string;
  hair: string;
  lora_prompt: string;
  name?: string;
  negative_prompt: string;
  nsfw: boolean;
  race: string;
  sex: string;
  skin_color: string;
  [key: string]: unknown;
}

/** The sprite the source preview shows, so a reload can name it. */
export interface SelectedPreviewSprite {
  character: string;
  costume: string;
  count: number;
  index: number;
}

export interface ClonerState {
  char_preview_url: string | null;
  character: string;
  character_info: ClonerCharacterInfo;
  /** The last solid background, restored when Alpha is not available. */
  previous_background_color: string;
  selected_idx: number;
  selected_preview_sprite: SelectedPreviewSprite | null;
  /** Saved references: `{name, type, subfolder}` or plain names from older workflows. */
  source_images: (ImageRef | string)[];
  /** The character the reference was uploaded for. */
  source_images_character: string;
  [key: string]: unknown;
}

/** What the Cloner reads besides its own state. */
export interface ClonerContext {
  /**
   * The Control Center's `active_kind`, lowercased; empty while it is unknown
   * (the Control Center state has not loaded yet).
   */
  modelKind: string;
}

export const MAX_SOURCE_IMAGES = 1;

export const CLONER_TRAIT_FIELDS = TRAIT_FIELDS;

export const ALPHA_DISABLED_TITLE =
  "Native transparency requires Qwen Image 2.1 in Control Center";

export const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
] as const;

export function defaultClonerCharacterInfo(): ClonerCharacterInfo {
  return {
    sex: "female",
    age: 18,
    race: "human",
    skin_color: "",
    hair: "",
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

/** The widget's state for a freshly created node, after its first save. */
export function defaultClonerState(): ClonerState {
  return {
    character: "",
    source_images: [],
    source_images_character: "",
    selected_preview_sprite: null,
    selected_idx: 0,
    char_preview_url: null,
    previous_background_color: "Green",
    character_info: defaultClonerCharacterInfo(),
  };
}

/** The Control Center kind the background rule reads, from its node_state. */
export function clonerModelKind(nodeState: unknown): string {
  if (!nodeState || typeof nodeState !== "object") {
    return "";
  }
  const kind = (nodeState as { active_kind?: unknown }).active_kind;
  return String(kind || "")
    .trim()
    .toLowerCase();
}

export function alphaAllowed(modelKind: string): boolean {
  return modelKind === "qi2";
}

/** `alpha`/`transparent` → Transparent, `blue` → Blue, anything else → Green. */
export function normalizeBackground(value: unknown): string {
  const lower = String(value || "")
    .trim()
    .toLowerCase();
  if (lower === "alpha" || lower === "transparent") {
    return "Transparent";
  }
  return lower === "blue" ? "Blue" : "Green";
}

/** The age slider's normalization: a number in 1..100, 18 when unreadable. */
export function normalizeAge(value: unknown): number {
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) {
    return 18;
  }
  return Math.max(1, Math.min(100, parsed));
}

function traitText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).join(", ");
  }
  return value === null || value === undefined ? "" : String(value);
}

function analysisSex(value: unknown): "male" | "female" | null {
  const sex = String(value || "").toLowerCase();
  if (sex.startsWith("m")) {
    return "male";
  }
  return sex.startsWith("f") ? "female" : null;
}

function analysisFlag(value: unknown): boolean {
  return (
    value === true ||
    String(value ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

const TRAIT_KEYS = new Set<string>(TRAIT_FIELDS.map(({ key }) => key));
const TEXT_KEYS = new Set([
  ...TRAIT_KEYS,
  "aesthetics",
  "negative_prompt",
  "lora_prompt",
]);

/** A comparable identity of the reference and its selection, for stale-reply checks. */
export function sourceKey(state: ClonerState): string {
  return JSON.stringify([state.source_images, state.selected_idx || 0]);
}

export interface ClonerProblem {
  message: string;
  title: string;
}

/** What blocks queueing before ComfyUI would reject the run. */
export function clonerQueueProblem(state: ClonerState): ClonerProblem | null {
  if (!state.character) {
    return {
      title: "No character",
      message: "Create or select a character first.",
    };
  }
  const refs = state.source_images.filter((value) => imageRef(value));
  if (refs.length === 0) {
    return {
      title: "Source Image Required",
      message: "Upload a character image in Character Cloner first.",
    };
  }
  if (state.source_images.length > MAX_SOURCE_IMAGES) {
    return {
      title: "One Image Only",
      message:
        "Character Cloner accepts only one reference image. Remove extra images or upload a replacement.",
    };
  }
  return null;
}

/**
 * Model over one Cloner state. Mutating methods are ported from the widget
 * closures and are only called through {@link updateClonerState}, which works
 * on a copy.
 */
export class ClonerModel {
  readonly context: ClonerContext;
  readonly state: ClonerState;

  constructor(state: ClonerState, context: ClonerContext) {
    this.state = state;
    this.context = context;
  }

  get info(): ClonerCharacterInfo {
    return this.state.character_info;
  }

  alphaAllowed(): boolean {
    return alphaAllowed(this.context.modelKind);
  }

  /**
   * The background control's `setValue`. Enforcing drops Alpha for a known
   * non-QI2 model; while the kind is unknown a restored Alpha is kept.
   */
  setBackground(value: unknown, enforce = false): void {
    let normalized = normalizeBackground(value);
    if (
      normalized === "Transparent" &&
      enforce &&
      this.context.modelKind &&
      !this.alphaAllowed()
    ) {
      normalized =
        this.state.previous_background_color === "Blue" ? "Blue" : "Green";
    }
    if (normalized !== "Transparent") {
      this.state.previous_background_color = normalized;
    }
    this.info.background_color = normalized;
  }

  /** A click on a background button; Alpha is ignored unless QI2 is active. Never auto-selects Alpha. */
  chooseBackground(value: string): boolean {
    if (normalizeBackground(value) === "Transparent" && !this.alphaAllowed()) {
      return false;
    }
    this.setBackground(value, true);
    return true;
  }

  /** `syncBackgroundControl`: re-apply the rule for the current model kind. */
  enforceBackground(): void {
    this.setBackground(this.info.background_color, true);
  }

  setInfo<K extends keyof ClonerCharacterInfo>(
    key: K,
    value: ClonerCharacterInfo[K]
  ): void {
    this.info[key] = value;
  }

  setTrait(key: TraitKey, value: string): void {
    this.info[key] = value;
  }

  setAge(value: unknown): void {
    this.info.age = normalizeAge(value);
  }

  setSex(value: unknown): void {
    const sex = String(value || "").toLowerCase();
    if (sex === "male" || sex === "female") {
      this.info.sex = sex;
    }
  }

  /**
   * Merge an analysis reply into the character fields. The widget merged the
   * reply unfiltered; here `name` is dropped (it would break the node's
   * ownership check) and the values are coerced to the fields' types.
   */
  applyAnalysis(data: Record<string, unknown>): void {
    const info = this.info;
    for (const [key, value] of Object.entries(data)) {
      if (key === "name") {
        continue;
      }
      if (key === "sex") {
        info.sex = analysisSex(value) ?? info.sex;
      } else if (key === "age") {
        info.age = normalizeAge(value);
      } else if (key === "nsfw") {
        info.nsfw = analysisFlag(value);
      } else if (key === "background_color") {
        this.setBackground(value);
      } else {
        info[key] = TEXT_KEYS.has(key) ? traitText(value) : value;
      }
    }
  }

  /** Adopt freshly loaded metadata (or the defaults for no character). */
  loadCharacterInfo(
    name: string,
    saved: Record<string, unknown> | null = null
  ): void {
    this.state.character = name;
    this.state.character_info = {
      ...defaultClonerCharacterInfo(),
      name,
      ...saved,
    } as ClonerCharacterInfo;
    this.normalizeInfoFields();
  }

  /** What re-syncing the field controls (`updateUIFromState`) wrote back into the state. */
  normalizeInfoFields(): void {
    this.setBackground(this.info.background_color);
    this.info.age = normalizeAge(this.info.age);
  }

  /** `clearSourceImages`. */
  clearSources(): void {
    this.state.source_images = [];
    this.state.selected_idx = 0;
    this.state.source_images_character = this.state.character || "";
    this.state.char_preview_url = null;
    this.state.selected_preview_sprite = null;
  }

  /** A successful upload replaces the single reference. */
  setUploadedSource(ref: ImageRef): void {
    this.state.source_images = [ref];
    this.state.selected_idx = 0;
    this.state.source_images_character = this.state.character || "";
  }

  selectSource(index: number): void {
    this.state.selected_idx = index;
    this.normalizeSelection();
  }

  removeSource(index: number): void {
    this.state.source_images.splice(index, 1);
    if (this.state.selected_idx >= this.state.source_images.length) {
      this.state.selected_idx = Math.max(
        0,
        this.state.source_images.length - 1
      );
    }
  }

  /** `renderThumbs`: an out-of-range selection falls back to the first image. */
  normalizeSelection(): void {
    const index = this.state.selected_idx;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.state.source_images.length
    ) {
      this.state.selected_idx = 0;
    }
  }

  /** The reference the preview shows and analysis reads. */
  selectedSource(): ImageRef | null {
    return imageRef(this.state.source_images[this.state.selected_idx || 0]);
  }

  /** The navigator's `onLoaded`. */
  setPreviewSprite(url: string, preview: SpritePreviewState): void {
    this.state.char_preview_url = url;
    this.state.selected_preview_sprite =
      preview.count > 0
        ? {
            character: preview.character,
            costume: preview.costume || "",
            index: preview.index,
            count: preview.count,
          }
        : null;
  }

  /** The navigator's `onMissing`. */
  clearPreviewSprite(): void {
    this.state.char_preview_url = null;
    this.state.selected_preview_sprite = null;
  }

  /** Every save: keep the selection in range and apply the background rule. */
  finalize(): void {
    this.normalizeSelection();
    this.enforceBackground();
  }
}

export function serializeClonerState(state: ClonerState): string {
  return JSON.stringify(state);
}

export interface LoadedClonerState {
  /** Set when the saved character_info was verified to belong to `character`. */
  restoredInfoCharacter: string | null;
  state: ClonerState;
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

const has = (record: Record<string, unknown>, key: string) =>
  Object.hasOwn(record, key);

/**
 * `loadState()`: restore saved widget data onto the defaults. Unlike the
 * widget, saved character_info is only trusted when its `name` matches the
 * saved character; otherwise the metadata is fetched again, since the node
 * rejects info that names another character.
 */
export function parseClonerState(
  raw: JsonState | null | undefined
): LoadedClonerState {
  const state = defaultClonerState();
  const parsed = parseSavedRecord(raw);
  if (!parsed) {
    return { state, restoredInfoCharacter: null };
  }
  if (has(parsed, "character")) {
    state.character = String(parsed.character || "");
  }
  if (Array.isArray(parsed.source_images)) {
    state.source_images = parsed.source_images as (ImageRef | string)[];
  }
  if (has(parsed, "source_images_character")) {
    state.source_images_character = String(
      parsed.source_images_character || ""
    );
  } else if (state.source_images.length > 0) {
    state.source_images_character = state.character;
  }
  if (has(parsed, "selected_idx")) {
    state.selected_idx = parsed.selected_idx as number;
  }
  state.previous_background_color = String(
    parsed.previous_background_color || "Green"
  );
  let restoredInfoCharacter: string | null = null;
  const info = asRecord(parsed.character_info);
  const owner = String(info?.name || "").trim();
  if (info && owner && owner === state.character.trim()) {
    Object.assign(state.character_info, info);
    restoredInfoCharacter = state.character;
  }
  return { state, restoredInfoCharacter };
}

/** The init sequence after loading: the field controls normalize what they show. */
export function initializeClonerState(
  state: ClonerState,
  context: ClonerContext
): ClonerState {
  const model = new ClonerModel(structuredClone(state), context);
  model.normalizeInfoFields();
  model.finalize();
  return model.state;
}

/** A model over a private copy of the state, for reads. */
export function viewClonerState(
  state: ClonerState,
  context: ClonerContext
): ClonerModel {
  return new ClonerModel(structuredClone(state), context);
}

/** Apply one user action and return the state the widget would have saved. */
export function updateClonerState(
  state: ClonerState,
  context: ClonerContext,
  mutate: (model: ClonerModel) => void
): ClonerState {
  const model = new ClonerModel(structuredClone(state), context);
  mutate(model);
  model.finalize();
  return model.state;
}
