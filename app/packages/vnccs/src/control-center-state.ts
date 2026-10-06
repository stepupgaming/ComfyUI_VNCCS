import type {
  CatalogEntry,
  ControlCenterCatalog,
  DownloadCategory,
  DownloadState,
  EntryStatus,
} from "./control-center";
import type { JsonState } from "./graphs";

/**
 * The Control Center `node_state` model. Every rule mirrors
 * `web/vnccs_control_center.js` so the studio stores exactly what the legacy
 * widget wrote: the server and the generator nodes read these keys directly.
 */

export type ModelKind = "QI2" | "Klein9b" | "MiniMaxH3";

export interface ModelFamily {
  cfg?: number;
  defaultType: string;
  kind: ModelKind;
  label: string;
  preferredTypes: string[];
  sampler: string;
  steps: number;
}

export const MODEL_FAMILIES: readonly ModelFamily[] = [
  {
    kind: "QI2",
    label: "Qwen Image 2.1",
    defaultType: "unet",
    preferredTypes: ["unet", "custom"],
    steps: 25,
    cfg: 3,
    sampler: "euler",
  },
  {
    kind: "Klein9b",
    label: "Flux Klein9b",
    defaultType: "unet",
    preferredTypes: ["unet", "custom"],
    steps: 4,
    sampler: "euler",
  },
  {
    kind: "MiniMaxH3",
    label: "MiniMax H3",
    defaultType: "unet",
    preferredTypes: ["unet", "custom"],
    steps: 20,
    sampler: "res_multistep",
  },
];

export const DEFAULT_QI2_MODEL = "Qwen Image 2.1 INT8 ConvRot";
const DEFAULT_MODEL_STEPS = 4;
const DEFAULT_MODEL_CFG = 1;
const DEFAULT_MODEL_SAMPLER = "euler";
const DEFAULT_MODEL_SCHEDULER = "simple";

export const DEFAULT_SAMPLERS = [
  "euler",
  "euler_cfg_pp",
  "euler_ancestral",
  "euler_ancestral_cfg_pp",
  "heun",
  "heunpp2",
  "dpm_2",
  "dpm_2_ancestral",
  "lms",
  "dpm_fast",
  "dpm_adaptive",
  "dpmpp_2s_ancestral",
  "dpmpp_sde",
  "dpmpp_2m",
  "dpmpp_2m_cfg_pp",
  "dpmpp_2m_sde",
  "dpmpp_3m_sde",
  "ddpm",
  "lcm",
  "ddim",
  "uni_pc",
];

export const DEFAULT_SCHEDULERS = [
  "normal",
  "karras",
  "exponential",
  "sgm_uniform",
  "simple",
  "ddim_uniform",
  "beta",
  "linear_quadratic",
  "cosine",
  "align_your_steps",
  "gits",
];

export const QI2_CACHE_DEVICES = ["auto", "gpu", "cpu", "off"] as const;
export const QI2_CACHE_DTYPES = ["default", "int8", "int4"] as const;
export const UNET_WEIGHT_DTYPES = [
  "default",
  "fp8_e4m3fn",
  "fp8_e4m3fn_fast",
  "fp8_e5m2",
] as const;

export type Qi2CacheDevice = (typeof QI2_CACHE_DEVICES)[number];
export type Qi2CacheDtype = (typeof QI2_CACHE_DTYPES)[number];

export interface Qi2Cache {
  device: Qi2CacheDevice;
  dtype: Qi2CacheDtype;
}

export interface LoraState {
  auto_apply?: boolean;
  enabled?: boolean;
  name: string;
  strength?: number;
  [key: string]: unknown;
}

/** Stored per family; imported workflows may omit fields. */
export interface ModelParams {
  cfg?: number;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  turbo_previous_settings?: { cfg?: number; steps?: number } | null;
  [key: string]: unknown;
}

export type DisplayedParams = ModelParams & {
  cfg: number;
  sampler: string;
  scheduler: string;
  steps: number;
};

export interface NodeState {
  active_kind?: string;
  collapsed?: Record<string, boolean>;
  loras?: LoraState[];
  model_params?: ModelParams;
  model_params_by_kind?: Record<string, ModelParams>;
  output_slot_names?: string[];
  qi2_cache?: { device?: string; dtype?: string };
  selected_model?: string;
  selected_models?: Record<string, string>;
  selected_type?: string;
  selected_types_by_kind?: Record<string, string>;
  type_settings?: { [key: string]: unknown; unet?: { weight_dtype?: string } };
  unsupported_model_kind?: string;
  [key: string]: unknown;
}

const NON_ALPHANUMERIC = /[^a-z0-9]/g;

function compact(value: string): string {
  return value.toLowerCase().replace(NON_ALPHANUMERIC, "");
}

/** An entry's family as the widget displays it (`h3` spellings become MiniMaxH3). */
export function metaKind(entry: CatalogEntry | null | undefined): string {
  const value = String(entry?.kind ?? entry?.Kind ?? "").trim();
  const short = compact(value);
  return short === "h3" || short === "minimaxh3" ? "MiniMaxH3" : value;
}

export function metaType(entry: CatalogEntry | null | undefined): string {
  return String(entry?.type ?? entry?.Type ?? "").trim();
}

export function isTurboLora(entry: CatalogEntry): boolean {
  return metaType(entry).toLowerCase() === "turbolora";
}

export function isHelperLora(entry: CatalogEntry): boolean {
  return metaType(entry).toLowerCase() === "helper";
}

function isModelKind(value: string): value is ModelKind {
  return MODEL_FAMILIES.some((family) => family.kind === value);
}

export function familyOf(kind: ModelKind): ModelFamily {
  return (MODEL_FAMILIES.find((family) => family.kind === kind) ??
    MODEL_FAMILIES[0]) as ModelFamily;
}

export interface CatalogItem {
  category: DownloadCategory;
  entry: CatalogEntry;
}

/**
 * Read model over one node_state. Methods that the widget used to mutate
 * state with are only called through {@link updateNodeState}, which works on
 * a copy.
 */
export class ControlCenterModel {
  readonly catalog: ControlCenterCatalog | null;
  readonly state: NodeState;

  constructor(state: NodeState, catalog: ControlCenterCatalog | null) {
    this.state = state;
    this.catalog = catalog;
  }

  activeKind(): ModelKind {
    const raw = String(this.state.active_kind || "QI2");
    const short = compact(raw);
    const kind = short === "h3" || short === "minimaxh3" ? "MiniMaxH3" : raw;
    return isModelKind(kind) ? kind : "QI2";
  }

  family(): ModelFamily {
    return familyOf(this.activeKind());
  }

  modelTypeTabs(): string[] {
    const kind = this.activeKind();
    const available = new Set(
      (this.catalog?.models ?? [])
        .filter((entry) => metaKind(entry).toLowerCase() === kind.toLowerCase())
        .map((entry) => entry.type)
        .filter((type): type is string => Boolean(type))
    );
    available.add("custom");
    if (kind === "QI2") {
      available.add("unet");
    }
    const preferred = this.family().preferredTypes.filter((type) =>
      available.has(type)
    );
    return preferred.length > 0 ? preferred : Array.from(available);
  }

  selectedType(): string {
    const tabs = this.modelTypeTabs();
    const kind = this.activeKind();
    const selected =
      this.state.selected_types_by_kind?.[kind] ??
      (kind === "QI2" ? this.state.selected_type : "");
    if (selected && tabs.includes(selected)) {
      return selected;
    }
    const preferred = this.family().defaultType;
    return tabs.includes(preferred) ? preferred : (tabs[0] ?? "");
  }

  visibleModels(type: string): CatalogEntry[] {
    if (type === "custom") {
      return [];
    }
    const kind = this.activeKind().toLowerCase();
    return (this.catalog?.models ?? [])
      .filter(
        (entry) =>
          (!entry.type || entry.type === type) &&
          metaKind(entry).toLowerCase() === kind
      )
      .sort(
        (a, b) =>
          Number(b.name === DEFAULT_QI2_MODEL) -
          Number(a.name === DEFAULT_QI2_MODEL)
      );
  }

  selectedModelName(type: string = this.selectedType()): string {
    const kind = this.activeKind();
    const byType = this.state.selected_models?.[`${kind}:${type}`];
    if (byType) {
      return byType;
    }
    if (kind === "QI2") {
      const legacy = this.state.selected_model;
      const variants = this.visibleModels(type);
      if (legacy && variants.some((entry) => entry.name === legacy)) {
        return legacy;
      }
      return type === "unet" ? variants[0]?.name || DEFAULT_QI2_MODEL : "";
    }
    return "";
  }

  selectedModelEntry(): CatalogEntry | null {
    if (!this.catalog?.models.length) {
      return null;
    }
    const type = this.selectedType();
    if (type === "custom") {
      return this.customContextModelEntry();
    }
    const name = this.selectedModelName(type);
    const variants = this.visibleModels(type);
    return variants.find((entry) => entry.name === name) ?? variants[0] ?? null;
  }

  /** The family's default model, which custom (pass-through) mode borrows its metadata from. */
  customContextModelEntry(): CatalogEntry {
    const type = this.family().defaultType;
    const variants = this.visibleModels(type);
    const name = this.selectedModelName(type);
    return (
      variants.find((entry) => entry.name === name) ??
      variants[0] ?? {
        name: `Custom ${this.activeKind()}`,
        type: "custom",
        kind: this.activeKind(),
        custom: true,
      }
    );
  }

  selectedKind(): string {
    return metaKind(this.selectedModelEntry()) || this.activeKind();
  }

  isQwenFamily(
    entry: CatalogEntry | null = this.selectedModelEntry()
  ): boolean {
    const identity = [
      metaKind(entry),
      entry?.name ?? "",
      entry?.local_path ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return identity.includes("qwen") || identity.includes("qie");
  }

  sameKind(entry: CatalogEntry, kind: string = this.selectedKind()): boolean {
    const entryKind = metaKind(entry);
    return (
      !(entryKind && kind) || entryKind.toLowerCase() === kind.toLowerCase()
    );
  }

  exactKind(entry: CatalogEntry, kind: string = this.selectedKind()): boolean {
    const entryKind = metaKind(entry);
    return Boolean(
      entryKind && kind && entryKind.toLowerCase() === kind.toLowerCase()
    );
  }

  /** The active family's sampler parameters, created from its defaults on first use. */
  modelParams(): ModelParams {
    this.state.model_params_by_kind ??= {};
    const kind = this.activeKind();
    let params = this.state.model_params_by_kind[kind];
    if (!params) {
      const family = familyOf(kind);
      params = {
        steps: family.steps ?? DEFAULT_MODEL_STEPS,
        cfg: family.cfg ?? DEFAULT_MODEL_CFG,
        sampler: family.sampler ?? DEFAULT_MODEL_SAMPLER,
        scheduler: DEFAULT_MODEL_SCHEDULER,
      };
      this.state.model_params_by_kind[kind] = params;
    }
    return params;
  }

  /** Parameters as the fields display them, with the widget's fallbacks. */
  displayedParams(): DisplayedParams {
    return {
      steps: DEFAULT_MODEL_STEPS,
      cfg: DEFAULT_MODEL_CFG,
      sampler: DEFAULT_MODEL_SAMPLER,
      scheduler: DEFAULT_MODEL_SCHEDULER,
      ...this.modelParams(),
    };
  }

  qi2Cache(): Qi2Cache {
    const { device, dtype } = this.state.qi2_cache ?? {};
    return {
      device: QI2_CACHE_DEVICES.find((value) => value === device) ?? "gpu",
      dtype: QI2_CACHE_DTYPES.find((value) => value === dtype) ?? "int8",
    };
  }

  unetWeightDtype(): string {
    return this.state.type_settings?.unet?.weight_dtype ?? "default";
  }

  collapsed(key: string): boolean {
    return this.state.collapsed?.[key] ?? false;
  }

  loraState(name: string): LoraState {
    return (
      this.state.loras?.find((lora) => lora.name === name) ?? {
        name,
        auto_apply: false,
        strength: 1,
      }
    );
  }

  /** Turbo LoRAs for the selected model's family, shown inline in the model block. */
  turboLoras(): CatalogEntry[] {
    const kind = this.selectedKind();
    return (this.catalog?.lora ?? []).filter(
      (entry) =>
        !entry.custom && isTurboLora(entry) && this.exactKind(entry, kind)
    );
  }

  /** Helper LoRAs the pipe applies for the selected family. */
  pipeLoras(): CatalogEntry[] {
    const kind = this.selectedKind();
    return (this.catalog?.lora ?? []).filter(
      (entry) =>
        !(entry.custom || isTurboLora(entry)) && this.exactKind(entry, kind)
    );
  }

  customLoras(): CatalogEntry[] {
    const kind = this.activeKind().toLowerCase();
    return (this.catalog?.lora ?? []).filter((entry) => {
      if (!entry.custom) {
        return false;
      }
      const entryKind = metaKind(entry).toLowerCase();
      return !entryKind || entryKind === "custom" || entryKind === kind;
    });
  }

  clipVaeEntries(): CatalogItem[] {
    const kind = this.selectedKind();
    return [
      ...(this.catalog?.clip ?? [])
        .filter((entry) => this.sameKind(entry, kind))
        .map((entry) => ({ category: "clip" as const, entry })),
      ...(this.catalog?.vae ?? [])
        .filter((entry) => this.sameKind(entry, kind))
        .map((entry) => ({ category: "vae" as const, entry })),
    ];
  }

  /**
   * LoRA file names other nodes offer for the selected family (the legacy
   * `vnccs-lora-options-updated` event payload).
   */
  helperLoraOptions(): string[] {
    const kind = this.selectedKind();
    const options: string[] = [];
    for (const entry of this.catalog?.lora ?? []) {
      if (entry.custom || isTurboLora(entry) || !isHelperLora(entry)) {
        continue;
      }
      if (!this.exactKind(entry, kind)) {
        continue;
      }
      const path = (entry.local_path ?? "").replaceAll("\\", "/");
      options.push(
        path.startsWith("models/loras/")
          ? path.slice("models/loras/".length)
          : (path.split("/").pop() ?? "")
      );
    }
    return options;
  }

  /** What "Download / Update" offers: the selected model plus the family's assets and utilities. */
  downloadAllCandidates(): CatalogItem[] {
    const catalog = this.catalog;
    if (!catalog) {
      return [];
    }
    const items: CatalogItem[] = [];
    const selected = catalog.models.find(
      (entry) => entry.name === this.selectedModelName()
    );
    if (selected && isDownloadableStatus(selected.status)) {
      items.push({ category: "models", entry: selected });
    }
    const kind = this.selectedKind();
    for (const category of [
      "clip",
      "vae",
      "lora",
      "controlnet",
      "other",
    ] as const) {
      for (const entry of catalog[category] ?? []) {
        if (
          (category === "clip" || category === "vae") &&
          !this.sameKind(entry, kind)
        ) {
          continue;
        }
        if (
          category === "lora" &&
          !entry.custom &&
          !this.exactKind(entry, kind)
        ) {
          continue;
        }
        if (isDownloadableStatus(entry.status)) {
          items.push({ category, entry });
        }
      }
    }
    return items;
  }

  // Mutations. Each one matches a widget handler minus its final _saveState,
  // which updateNodeState applies.

  private setSelectedModelName(type: string, name: string): void {
    if (!(type && name)) {
      return;
    }
    this.state.selected_models ??= {};
    this.state.selected_models[`${this.activeKind()}:${type}`] = name;
    if (type === this.selectedType()) {
      this.state.selected_model = name;
    }
  }

  /** What every widget render did before the user could act: pin the shown variant. */
  reconcileVariant(): void {
    const type = this.selectedType();
    if (type === "custom") {
      return;
    }
    const variants = this.visibleModels(type);
    const current = variants.find(
      (entry) => entry.name === this.selectedModelName(type)
    );
    if (current) {
      this.setSelectedModelName(type, current.name);
    } else if (variants[0]) {
      this.setSelectedModelName(type, variants[0].name);
    }
  }

  syncActiveFamilyState(): void {
    const kind = this.activeKind();
    const type = this.selectedType();
    this.state.selected_types_by_kind ??= {};
    this.state.active_kind = kind;
    this.state.selected_types_by_kind[kind] = type;
    this.state.selected_type = type;
    this.state.selected_model = this.selectedModelName(type);
    this.state.model_params = { ...this.modelParams() };
  }

  setActiveKind(kind: ModelKind): void {
    if (!isModelKind(kind) || kind === this.activeKind()) {
      return;
    }
    this.syncActiveFamilyState();
    this.state.active_kind = kind;
    const type = this.selectedType();
    const variants = this.visibleModels(type);
    const first = variants[0];
    if (
      first &&
      !variants.some((entry) => entry.name === this.selectedModelName(type))
    ) {
      this.setSelectedModelName(type, first.name);
    }
  }

  setSelectedType(type: string): void {
    if (!type || this.selectedType() === type) {
      return;
    }
    this.state.selected_types_by_kind ??= {};
    this.state.selected_types_by_kind[this.activeKind()] = type;
    this.state.selected_type = type;
    if (type === "custom") {
      return;
    }
    const variants = this.visibleModels(type);
    const name = this.selectedModelName(type);
    const first = variants[0];
    if (first && !variants.some((entry) => entry.name === name)) {
      this.setSelectedModelName(type, first.name);
    } else if (name) {
      this.state.selected_model = name;
    }
  }

  chooseVariant(type: string, name: string): void {
    const chosen = this.visibleModels(type).find(
      (entry) => entry.name === name
    );
    if (!chosen) {
      return;
    }
    this.setSelectedModelName(type, chosen.name);
    this.state.selected_types_by_kind ??= {};
    this.state.selected_types_by_kind[this.activeKind()] = chosen.type || type;
    this.state.selected_type = chosen.type || type;
  }

  patchModelParams(patch: Partial<ModelParams>): void {
    Object.assign(this.modelParams(), patch);
  }

  setQi2Cache(patch: Partial<Qi2Cache>): void {
    this.state.qi2_cache = { ...this.qi2Cache(), ...patch };
  }

  private setTurboPreset(enabled: boolean): void {
    const params = this.modelParams();
    if (enabled) {
      params.turbo_previous_settings = {
        steps: params.steps ?? DEFAULT_MODEL_STEPS,
        cfg: params.cfg ?? DEFAULT_MODEL_CFG,
      };
      params.steps = this.activeKind() === "QI2" ? 6 : 4;
      params.cfg = 1;
      return;
    }
    const previous = params.turbo_previous_settings ?? {};
    if (previous.steps !== undefined) {
      params.steps = previous.steps;
    }
    if (previous.cfg !== undefined) {
      params.cfg = previous.cfg;
    }
    params.turbo_previous_settings = null;
  }

  /** Turbo LoRAs are exclusive: enabling one disables the others and applies the turbo preset. */
  selectTurboLora(name: string, enabled: boolean): void {
    const turboNames = new Set(this.turboLoras().map((entry) => entry.name));
    this.state.loras ??= [];
    const loras = this.state.loras;
    const wasEnabled = loras.some(
      (lora) => turboNames.has(lora?.name) && lora.auto_apply === true
    );
    for (const turboName of turboNames) {
      const active = turboName === name ? enabled : false;
      const existing = loras.find((lora) => lora.name === turboName);
      if (existing) {
        existing.auto_apply = active;
        existing.strength = 1;
      } else {
        loras.push({ name: turboName, auto_apply: active, strength: 1 });
      }
    }
    if (enabled && !wasEnabled) {
      this.setTurboPreset(true);
    } else if (!enabled && wasEnabled) {
      this.setTurboPreset(false);
    }
  }

  updateLora(name: string, patch: Partial<LoraState>): void {
    this.state.loras ??= [];
    const existing = this.state.loras.find((lora) => lora.name === name);
    if (existing) {
      Object.assign(existing, patch);
    } else {
      this.state.loras.push({ name, auto_apply: false, strength: 1, ...patch });
    }
  }

  removeLora(name: string): void {
    this.state.loras = (this.state.loras ?? []).filter(
      (lora) => lora.name !== name
    );
  }

  toggleCollapsed(key: string): void {
    this.state.collapsed ??= {};
    this.state.collapsed[key] = !this.state.collapsed[key];
  }

  saveSettings(settings: { weightDtype: string }): void {
    this.state.selected_type = this.selectedType();
    this.state.type_settings ??= {};
    this.state.type_settings.unet = { weight_dtype: settings.weightDtype };
    // Nunchaku support was removed; stale workflows may still carry its settings.
    this.state.type_settings.nunchaku = undefined;
  }

  dismissUnsupportedKind(): void {
    this.state.unsupported_model_kind = undefined;
  }
}

function asObject(value: unknown): NodeState {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as NodeState)
    : {};
}

/** Parse a stored node_state and apply the widget's restore-time migrations. */
export function parseNodeState(raw: JsonState | null | undefined): NodeState {
  let state: NodeState = {};
  if (typeof raw === "string") {
    if (raw && raw !== "{}") {
      try {
        state = asObject(JSON.parse(raw));
      } catch {
        state = {};
      }
    }
  } else if (raw) {
    state = structuredClone(asObject(raw));
  }

  if (Array.isArray(state.loras)) {
    state.loras = state.loras.map((lora) => {
      if (
        lora &&
        typeof lora === "object" &&
        lora.auto_apply === undefined &&
        lora.enabled !== undefined
      ) {
        return { ...lora, auto_apply: lora.enabled !== false };
      }
      return lora;
    });
  }
  if (state.selected_model && !state.selected_models) {
    const type = state.selected_type;
    state.selected_models = type ? { [type]: state.selected_model } : {};
  }
  if (
    state.active_kind === "QIE2511" ||
    (!state.active_kind && String(state.selected_model || "").includes("2511"))
  ) {
    state.unsupported_model_kind = "QIE2511";
    state.active_kind = "QI2";
    state.selected_type = "unet";
    state.selected_model = DEFAULT_QI2_MODEL;
  }
  state.active_kind = new ControlCenterModel(state, null).activeKind();
  state.selected_types_by_kind ??= {};
  if (!state.selected_types_by_kind.QI2 && state.selected_type) {
    state.selected_types_by_kind.QI2 = state.selected_type;
  }
  // The Control Center exposes a single pipe output now.
  state.output_slot_names = [];
  return state;
}

/** A model over a private copy of the state, safe for reads that fill defaults. */
export function viewNodeState(
  state: NodeState,
  catalog: ControlCenterCatalog | null
): ControlCenterModel {
  return new ControlCenterModel(structuredClone(state), catalog);
}

/**
 * Apply one user action and return the state the widget would have saved:
 * the variant pinned by the previous render, the change, then the active
 * family sync from `_saveState`.
 */
export function updateNodeState(
  state: NodeState,
  catalog: ControlCenterCatalog,
  mutate: (model: ControlCenterModel) => void
): NodeState {
  const model = new ControlCenterModel(structuredClone(state), catalog);
  model.reconcileVariant();
  mutate(model);
  model.syncActiveFamilyState();
  return model.state;
}

export type DisplayStatus =
  | EntryStatus
  | "queued"
  | "downloading"
  | "error"
  | "auth_required";

export function isDownloadableStatus(status: string | undefined): boolean {
  return status === "missing" || status === "error" || status === "outdated";
}

const TRANSIENT_PHASES = new Set<string>([
  "queued",
  "downloading",
  "error",
  "auth_required",
]);

/**
 * Transient download phases win over the catalog. A finished download is not
 * trusted until a catalog refresh reports the file as installed.
 */
export function resolveStatus(
  download: DownloadState | undefined,
  status: EntryStatus | undefined
): DisplayStatus {
  if (download && TRANSIENT_PHASES.has(download.status)) {
    return download.status as DisplayStatus;
  }
  return status || "missing";
}

export function statusLabel(
  status: DisplayStatus,
  download?: DownloadState
): string {
  switch (status) {
    case "installed":
      return "Installed";
    case "outdated":
      return "Update available";
    case "queued":
      return "Queued";
    case "downloading":
      return download?.message || "Downloading…";
    case "error":
      return download?.message || "Download failed";
    case "auth_required":
      return "Key required";
    default:
      return "Missing";
  }
}

/** Common prefix stripped from variant names in the model dropdown, cut back to a `-` or `_`. */
export function variantPrefixLength(names: string[]): number {
  const first = names[0] ?? "";
  let length = 0;
  for (let index = 0; index < first.length; index++) {
    if (names.every((name) => name[index] === first[index])) {
      length = index + 1;
    } else {
      break;
    }
  }
  const head = first.slice(0, length);
  const separator = Math.max(head.lastIndexOf("-"), head.lastIndexOf("_"));
  return separator > 0 ? separator + 1 : length;
}
