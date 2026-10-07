import {
  BASE_COSTUMES,
  type ClothesContext,
  type ClothesModel,
  type ClothesState,
  clothesModelKind,
  displayCostumes,
  initializeClothesState,
  isEditableCostume,
  parseClothesState,
  updateClothesState,
  viewClothesState,
} from "./clothes-state";
import type { NodeState } from "./control-center-state";
import { fetchContextLists } from "./creator";
import { CLOTHES_IDS, type JsonState } from "./graphs";
import type { VnccsHttp } from "./http";
import type {
  SpritePreviewNavigator,
  SpritePreviewOptions,
  SpritePreviewState,
} from "./sprite-preview";
import { type ImageRef, uploadImage } from "./uploads";

/**
 * Clothes Designer routes and the widget's async flows (character and
 * costume loading, saves, deletion, the wizard, previews), ported from
 * `web/vnccs_clothes_designer.js`. Every flow takes a request guard so a
 * newer request makes older replies stale, like the widget's
 * `createRequestGuard`.
 */

// --- Routes -----------------------------------------------------------------------

/** Every costume folder of a character, base sprite sets included. */
export async function listCostumes(
  http: VnccsHttp,
  character: string
): Promise<string[]> {
  const list = await http.get<unknown>("/vnccs/list_costumes", { character });
  if (!Array.isArray(list)) {
    throw new Error("Failed to load character costumes.");
  }
  return list.map(String);
}

export async function fetchCostume(
  http: VnccsHttp,
  character: string,
  costume: string
): Promise<Record<string, unknown>> {
  const info = await http.get<unknown>("/vnccs/get_costume", {
    character,
    costume,
  });
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("Invalid costume metadata.");
  }
  return info as Record<string, unknown>;
}

/** Saving an unknown name creates the costume; the server checks the name. */
export function saveCostume(
  http: VnccsHttp,
  character: string,
  costume: string,
  info: object
) {
  return http.post<{ status?: string }>("/vnccs/save_costume", {
    character,
    costume,
    info,
  });
}

/** Removes the costume's settings, images and preview; a warning names leftovers. */
export async function deleteCostume(
  http: VnccsHttp,
  character: string,
  costume: string
): Promise<{ warning: string }> {
  const data = await http.post<{ warning?: unknown }>("/vnccs/delete_costume", {
    character,
    costume,
  });
  return { warning: typeof data.warning === "string" ? data.warning : "" };
}

/**
 * Saved character_info, as the widget read it: the Clothes Designer only
 * takes age and sex from it, so the name is not checked against the folder.
 */
export async function fetchClothesCharacterInfo(
  http: VnccsHttp,
  character: string
): Promise<Record<string, unknown>> {
  const info = await http.get<unknown>("/vnccs/character_info", { character });
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error(`Invalid character metadata for '${character}'`);
  }
  return info as Record<string, unknown>;
}

export type ClothesWizardFields = Partial<
  Record<"top" | "bottom" | "shoes" | "head" | "face", string>
>;

/**
 * Expand a broad outfit idea into the costume fields with the local Qwen3.5
 * model. Failures keep their `{error, message}` body for `wizardFailure`.
 */
export function runClothesWizard(
  http: VnccsHttp,
  description: string,
  nodeId: string = CLOTHES_IDS.source
): Promise<ClothesWizardFields> {
  return http.post<ClothesWizardFields>("/vnccs/clothes_wizard", {
    description,
    node_id: nodeId,
  });
}

/**
 * The costume preview: its sprites, the cached render, then the base body.
 * `force_cache` prefers the render a finished run just saved.
 */
export function clothesPreviewUrl(
  http: VnccsHttp,
  character: string,
  costume: string,
  timestamp: number,
  forceCache = false
): string {
  return http.url("/vnccs/get_preview", {
    character,
    costume,
    ts: timestamp,
    force_cache: forceCache ? "true" : undefined,
  });
}

export interface ClothesPreviewPayload {
  clothes_state: ClothesState;
  control_center_id: string;
  node_state: string;
  repo_id: string;
  selected_type: string;
}

export function clothesPreviewPayload(
  state: ClothesState,
  nodeState: NodeState,
  repoId: string
): ClothesPreviewPayload {
  return {
    repo_id: repoId,
    node_state: JSON.stringify(nodeState),
    selected_type: String(nodeState.selected_type || "").toLowerCase(),
    control_center_id: CLOTHES_IDS.controlCenter,
    clothes_state: state,
  };
}

/** Render the costume outside the queue; resolves with a PNG data URL. */
export async function generateClothesPreview(
  http: VnccsHttp,
  payload: ClothesPreviewPayload
): Promise<string | null> {
  const data = await http.post<{ image?: string }>(
    "/vnccs/control_center/clothes_preview",
    payload
  );
  return data.image ? `data:image/png;base64,${data.image}` : null;
}

export const CLONE_UPLOAD = {
  prefix: "clone_reference",
  fields: { type: "input", overwrite: "true" },
} as const;

export function uploadCloneReference(
  http: VnccsHttp,
  file: Blob & { name?: string }
): Promise<ImageRef> {
  return uploadImage(http, file, {
    prefix: CLONE_UPLOAD.prefix,
    fields: { ...CLONE_UPLOAD.fields },
  });
}

// --- Session ----------------------------------------------------------------------

export interface ClothesUi {
  characters: string[];
  /** The select's costumes; base sprite sets are hidden. */
  costumes: string[];
  deleting: boolean;
  /** A rendered preview shown instead of the sprite navigator. */
  generatedImage: string | null;
  loadError: string | null;
  /** The costume list or fields are loading; editing waits. */
  loadingCostume: boolean;
  /** Set after the first preview, which also saved the costume. */
  previewGenerated: boolean;
  previewRunning: boolean;
  uploading: boolean;
}

export interface ClothesSnapshot {
  sprite: SpritePreviewState;
  /** Null until the context lists loaded. */
  state: ClothesState | null;
  ui: ClothesUi;
}

export type NoticeLevel = "error" | "warning";

/** A costume action bound to the selection it was opened for. */
export interface CostumeTicket {
  /** False once a newer action of the same kind started or the session ended. */
  active: () => boolean;
  character: string;
  costume: string;
}

export type DeleteResult =
  | { status: "stale" }
  | { status: "busy" }
  | { status: "deleted"; warning: string };

export interface ClothesControlCenter {
  context: ClothesContext;
  nodeState: NodeState;
  repoId: string;
}

export type NavigatorHooks = Required<
  Pick<
    SpritePreviewOptions,
    "isSelectionCurrent" | "onChange" | "onLoaded" | "onMissing"
  >
>;

export interface ClothesSessionOptions {
  controlCenter: () => ClothesControlCenter;
  createNavigator: (hooks: NavigatorHooks) => SpritePreviewNavigator;
  http: () => VnccsHttp;
  notify: (title: string, message: string, level?: NoticeLevel) => void;
  now?: () => number;
  onChange?: (snapshot: ClothesSnapshot) => void;
  random?: () => number;
  /** Run work that loads `family`'s models (the app's model lifetime policy). */
  withModels?: <T>(family: string, task: () => Promise<T>) => Promise<T>;
}

const COSTUME_REQUIRED =
  "Create a new costume first, then select it before generating a preview.";
const PREVIEW_BUSY =
  "Wait for preview generation to finish before deleting a costume.";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function emptyClothesUi(): ClothesUi {
  return {
    characters: [],
    costumes: [],
    deleting: false,
    generatedImage: null,
    loadError: null,
    loadingCostume: false,
    previewGenerated: false,
    previewRunning: false,
    uploading: false,
  };
}

function eventDetail(detail: unknown) {
  const record =
    detail && typeof detail === "object"
      ? (detail as Record<string, unknown>)
      : {};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    character: text(record.character),
    message: text(record.message),
    nodeId: String(record.node_id ?? ""),
  };
}

/**
 * One Clothes Designer: owns its widget state and the sprite navigator, and
 * reports every change through `onChange`.
 */
export class ClothesSession {
  private readonly options: ClothesSessionOptions;
  private readonly navigator: SpritePreviewNavigator;
  private readonly pendingSaves = new Set<Promise<unknown>>();
  private current: ClothesState | null = null;
  private view: ClothesUi = emptyClothesUi();
  private disposed = false;
  private listLoading = false;
  private infoLoading = false;

  private readonly beginSelection = this.guard();
  private readonly beginPreview = this.guard();
  private readonly beginCostumes = this.guard();
  private readonly beginCostumeInfo = this.guard();
  private readonly beginCharacterInfo = this.guard();
  private readonly beginDelete = this.guard();
  private readonly beginWizard = this.guard();

  constructor(options: ClothesSessionOptions) {
    this.options = options;
    this.navigator = options.createNavigator({
      isSelectionCurrent: (selection) =>
        Boolean(this.current) &&
        selection.character === this.character() &&
        selection.costume ===
          (isEditableCostume(this.costume()) ? this.costume() : "Naked"),
      onChange: () => this.emit(),
      onLoaded: (url, preview) => {
        // A cached render only stands in for the sprite it was made from;
        // keeping that selection keeps the next run on the same cache key.
        if (url.includes("force_cache=true")) {
          return;
        }
        this.update((model) =>
          model.setSelectedPreviewSprite(
            preview.count > 0
              ? {
                  character: preview.character,
                  costume: preview.costume || "",
                  index: preview.index,
                  count: preview.count,
                }
              : null
          )
        );
      },
      onMissing: () =>
        this.update((model) => model.setSelectedPreviewSprite(null)),
    });
  }

  private guard() {
    let latest = 0;
    return () => {
      latest += 1;
      const id = latest;
      return () => !this.disposed && id === latest;
    };
  }

  get state(): ClothesState | null {
    return this.current;
  }

  get ui(): ClothesUi {
    return this.view;
  }

  snapshot(): ClothesSnapshot {
    return { state: this.current, ui: this.view, sprite: this.navigator.state };
  }

  private emit(): void {
    this.options.onChange?.(this.snapshot());
  }

  private http(): VnccsHttp {
    return this.options.http();
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private context(): ClothesContext {
    return this.options.controlCenter().context;
  }

  private character(): string {
    return this.current?.character ?? "";
  }

  private costume(): string {
    return this.current?.costume ?? "";
  }

  model(): ClothesModel | null {
    return this.current ? viewClothesState(this.current, this.context()) : null;
  }

  /** Apply one action to the widget state. */
  update(mutate: (model: ClothesModel) => void): void {
    if (this.current) {
      this.current = updateClothesState(this.current, this.context(), mutate);
      this.emit();
    }
  }

  private setUi(patch: Partial<ClothesUi>): void {
    this.view = { ...this.view, ...patch };
    this.emit();
  }

  private setLoading(list: boolean | null, info: boolean | null): void {
    this.listLoading = list ?? this.listLoading;
    this.infoLoading = info ?? this.infoLoading;
    const loadingCostume = this.listLoading || this.infoLoading;
    if (loadingCostume !== this.view.loadingCostume) {
      this.setUi({ loadingCostume });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.navigator.dispose();
  }

  /**
   * `node.onRemoved` without ending the session: replies to everything
   * started so far are dropped, the state stays for the next `init`.
   */
  leave(): void {
    for (const begin of [
      this.beginSelection,
      this.beginPreview,
      this.beginCostumes,
      this.beginCostumeInfo,
      this.beginCharacterInfo,
      this.beginDelete,
      this.beginWizard,
    ]) {
      begin();
    }
    this.navigator.invalidate();
    this.setLoading(false, false);
  }

  /** Model-dependent defaults after the Control Center changed. */
  syncControlCenter(): void {
    if (!this.current) {
      return;
    }
    const next = updateClothesState(this.current, this.context(), (model) =>
      model.syncControlCenter()
    );
    if (JSON.stringify(next) !== JSON.stringify(this.current)) {
      this.current = next;
      this.emit();
    }
  }

  // --- Loading ----------------------------------------------------------------

  /**
   * The widget's start: context lists, the saved state (kept across
   * remounts), then the character's metadata, costumes and preview.
   */
  async init(widgetData: JsonState | null): Promise<void> {
    if (this.disposed) {
      return;
    }
    const isSelection = this.beginSelection();
    const isPreview = this.beginPreview();
    this.beginWizard();
    this.navigator.invalidate();
    const saved = this.current ?? parseClothesState(widgetData);
    let characters: string[];
    try {
      characters = (await fetchContextLists(this.http())).characters;
    } catch (error) {
      if (isSelection()) {
        this.setUi({ loadError: errorText(error) });
      }
      return;
    }
    if (!isSelection()) {
      return;
    }
    const state = initializeClothesState(saved, this.context());
    if (!characters.includes(state.character)) {
      state.character = characters[0] ?? "";
    }
    this.current = state;
    this.setUi({ characters, loadError: null });
    if (!state.character) {
      this.setUi({ costumes: [] });
      return;
    }
    if (!((await this.loadCharacterInfo()) && isSelection())) {
      return;
    }
    if (!((await this.loadCostumes()) && isSelection())) {
      return;
    }
    if (isPreview()) {
      await this.refreshPreview();
    }
  }

  private async loadCharacterInfo(): Promise<boolean> {
    const isRequest = this.beginCharacterInfo();
    const character = this.character();
    if (!character) {
      return false;
    }
    const isCurrent = () => isRequest() && this.character() === character;
    try {
      const info = await fetchClothesCharacterInfo(this.http(), character);
      if (!isCurrent()) {
        return false;
      }
      this.update((model) => model.applyCharacterInfo(info));
      return true;
    } catch (error) {
      if (isCurrent()) {
        this.options.notify("Character Load Failed", errorText(error));
      }
      return false;
    }
  }

  private async loadCostumes(): Promise<boolean> {
    const isRequest = this.beginCostumes();
    const character = this.character();
    if (!character) {
      this.setLoading(false, null);
      return false;
    }
    const isCurrent = () => isRequest() && this.character() === character;
    this.setLoading(true, null);
    try {
      const list = await listCostumes(this.http(), character);
      if (!isCurrent()) {
        return false;
      }
      const costumes = displayCostumes(list);
      this.setUi({ costumes });
      this.update((model) => model.chooseCostume(costumes));
      return await this.loadCostumeInfo();
    } catch (error) {
      if (isCurrent()) {
        this.options.notify("Error", errorText(error));
      }
      return false;
    } finally {
      if (isRequest()) {
        this.setLoading(false, null);
      }
    }
  }

  private async loadCostumeInfo(): Promise<boolean> {
    const isRequest = this.beginCostumeInfo();
    const character = this.character();
    const costume = this.costume();
    if (!costume) {
      // The server answers `{}` for an empty name, so there is nothing to ask.
      this.setLoading(null, false);
      this.update((model) => model.applyCostumeInfo({}));
      return true;
    }
    const isCurrent = () =>
      isRequest() &&
      this.character() === character &&
      this.costume() === costume;
    this.setLoading(null, true);
    try {
      const info = await fetchCostume(this.http(), character, costume);
      if (!isCurrent()) {
        return false;
      }
      this.update((model) => model.applyCostumeInfo(info));
      return true;
    } catch (error) {
      if (isCurrent()) {
        this.resetSelection();
        this.options.notify("Error", errorText(error));
      }
      return false;
    } finally {
      if (isRequest()) {
        this.setLoading(null, false);
      }
    }
  }

  private resetSelection(): void {
    this.update((model) => model.resetCostumeSelection());
    this.setUi({ generatedImage: null });
    this.navigator.showFallback("", {
      character: this.character(),
      costume: "Naked",
    });
  }

  /** Character select: metadata (age and sex for Pose Studio), costumes, preview. */
  async selectCharacter(name: string): Promise<void> {
    if (!this.current || this.disposed) {
      return;
    }
    this.update((model) => {
      model.state.character = name;
    });
    this.beginWizard();
    const isSelection = this.beginSelection();
    const isPreview = this.beginPreview();
    this.navigator.invalidate();
    this.setUi({ generatedImage: null });
    if (!((await this.loadCharacterInfo()) && isSelection())) {
      return;
    }
    if (!((await this.loadCostumes()) && isSelection())) {
      return;
    }
    if (isPreview()) {
      await this.refreshPreview();
    }
  }

  async selectCostume(name: string): Promise<void> {
    if (!this.current || this.disposed) {
      return;
    }
    this.update((model) => {
      model.state.costume = name;
    });
    this.beginWizard();
    this.beginSelection();
    const isPreview = this.beginPreview();
    this.navigator.invalidate();
    this.setUi({ generatedImage: null });
    if (!(await this.loadCostumeInfo())) {
      return;
    }
    if (isPreview()) {
      await this.refreshPreview();
    }
  }

  /** NEW: create an empty costume and select it; an existing name is only selected. Throws server errors. */
  async createCostume(rawName: string): Promise<void> {
    const name = rawName.trim();
    const character = this.character();
    if (!(name && character && this.current)) {
      throw new Error("Select a character first.");
    }
    if (
      BASE_COSTUMES.some((base) => base.toLowerCase() === name.toLowerCase())
    ) {
      throw new Error(`"${name}" is a base sprite set. Choose another name.`);
    }
    if (this.view.costumes.includes(name)) {
      await this.selectCostume(name);
      return;
    }
    await saveCostume(this.http(), character, name, {});
    if (this.disposed || this.character() !== character) {
      return;
    }
    this.beginWizard();
    const isSelection = this.beginSelection();
    const isPreview = this.beginPreview();
    this.navigator.invalidate();
    this.update((model) => {
      model.state.costume = name;
    });
    this.setUi({ generatedImage: null });
    if (!((await this.loadCostumes()) && isSelection())) {
      return;
    }
    if (isPreview()) {
      await this.refreshPreview();
    }
  }

  // --- Saving -----------------------------------------------------------------

  /** Write the costume fields; tracked so a deletion can wait for it. */
  saveCostume(): Promise<unknown> {
    const state = this.current;
    if (!(state?.character && state.costume)) {
      return Promise.resolve();
    }
    const request = saveCostume(
      this.http(),
      state.character,
      state.costume,
      state.costume_info
    );
    this.pendingSaves.add(request);
    return request.finally(() => this.pendingSaves.delete(request));
  }

  /** A field's change event: typing already updated the state; this saves it. */
  commitCostumeFields(): Promise<void> {
    return this.saveCostume().then(
      () => undefined,
      (error) => this.options.notify("Save Failed", errorText(error))
    );
  }

  // --- Deletion ---------------------------------------------------------------

  /** DELETE: the selection to confirm, or null after reporting why it cannot be deleted. */
  openDelete(): CostumeTicket | null {
    const model = this.model();
    if (!model) {
      return null;
    }
    const problem = model.deleteProblem(this.view.previewRunning);
    if (problem) {
      this.options.notify("Warning", problem, "warning");
      return null;
    }
    return {
      active: this.beginDelete(),
      character: model.state.character,
      costume: model.state.costume,
    };
  }

  private ticketCurrent(ticket: CostumeTicket): boolean {
    return (
      ticket.active() &&
      this.character() === ticket.character &&
      this.costume() === ticket.costume
    );
  }

  /** The confirmed deletion; throws when the server refused, keeping the selection. */
  async confirmDelete(ticket: CostumeTicket): Promise<DeleteResult> {
    if (!this.ticketCurrent(ticket)) {
      return { status: "stale" };
    }
    if (this.view.previewRunning) {
      this.options.notify("Warning", PREVIEW_BUSY, "warning");
      return { status: "busy" };
    }
    this.beginWizard();
    this.setUi({ deleting: true });
    let warning: string;
    try {
      // Earlier field saves would recreate the costume after deletion.
      await Promise.allSettled([...this.pendingSaves]);
      if (!this.ticketCurrent(ticket)) {
        return { status: "stale" };
      }
      ({ warning } = await deleteCostume(
        this.http(),
        ticket.character,
        ticket.costume
      ));
    } finally {
      this.setUi({ deleting: false });
    }
    if (!this.ticketCurrent(ticket)) {
      return { status: "stale" };
    }
    const isSelection = this.beginSelection();
    this.beginPreview();
    this.beginCostumes();
    this.beginCostumeInfo();
    this.setUi({ costumes: [] });
    this.resetSelection();
    if ((await this.loadCostumes()) && isSelection() && ticket.active()) {
      await this.refreshPreview();
    }
    return { status: "deleted", warning: ticket.active() ? warning : "" };
  }

  // --- Wizard -----------------------------------------------------------------

  /** CLOTHES WIZZARD: the selection to fill, or null without an editable costume. */
  openWizard(): CostumeTicket | null {
    const model = this.model();
    if (!model?.editable()) {
      this.options.notify("Costume Required", COSTUME_REQUIRED, "warning");
      return null;
    }
    return {
      active: this.beginWizard(),
      character: model.state.character,
      costume: model.state.costume,
    };
  }

  /** Closing the wizard drops its pending result. */
  cancelWizard(): void {
    this.beginWizard();
  }

  isWizardCurrent(ticket: CostumeTicket): boolean {
    return this.ticketCurrent(ticket);
  }

  /**
   * Fill the fields from a description. Resolves false when the result
   * arrived for a closed wizard or another selection; rethrows failures
   * that are still current.
   */
  async runWizard(
    ticket: CostumeTicket,
    description: string
  ): Promise<boolean> {
    if (!this.ticketCurrent(ticket)) {
      return false;
    }
    let data: ClothesWizardFields;
    try {
      data = await runClothesWizard(this.http(), description);
    } catch (error) {
      if (!this.ticketCurrent(ticket)) {
        return false;
      }
      throw error;
    }
    if (!this.ticketCurrent(ticket)) {
      return false;
    }
    this.update((model) => model.applyWizardData(data));
    await this.saveCostume();
    return true;
  }

  // --- Preview ----------------------------------------------------------------

  /**
   * The preview for the selection: a random pose sprite of the costume (or
   * of the base body before one exists), else the costume preview route.
   * `forceCache` shows the render a finished run cached and keeps the
   * sprite that produced it selected.
   */
  async refreshPreview(forceCache = false): Promise<void> {
    const model = this.model();
    if (!model || this.disposed) {
      return;
    }
    this.beginPreview();
    this.navigator.invalidate();
    this.setUi({ generatedImage: null });
    const { character } = model.state;
    if (!character) {
      return;
    }
    const costume = model.previewCostume();
    const url = clothesPreviewUrl(
      this.http(),
      character,
      costume,
      this.now(),
      forceCache
    );
    if (forceCache) {
      await this.navigator.showFallback(url, { character, costume });
      return;
    }
    this.update((next) => next.setSelectedPreviewSprite(null));
    await this.navigator.load(character, { costume, fallbackUrl: url });
  }

  stepSprite(delta: number): Promise<void> {
    return this.navigator.step(delta);
  }

  /** GENERATE PREVIEW: save the costume, then render it outside the queue. */
  async generatePreview(): Promise<void> {
    const model = this.model();
    if (!model) {
      return;
    }
    const problem = model.runProblem();
    if (problem) {
      this.options.notify(problem.title, problem.message, "warning");
      return;
    }
    if (this.view.previewRunning || this.view.deleting) {
      return;
    }
    this.update((next) => {
      next.syncClothesCoreLora();
      next.randomizeSeedIfNeeded(this.options.random);
    });
    const { character, costume } = model.state;
    const isRequest = this.beginPreview();
    const isCurrent = () =>
      isRequest() &&
      this.character() === character &&
      this.costume() === costume;
    this.navigator.invalidate();
    this.setUi({ previewRunning: true });
    try {
      await this.saveCostume();
      const state = this.current;
      if (!(isCurrent() && state)) {
        return;
      }
      const { nodeState, repoId } = this.options.controlCenter();
      const render = () =>
        generateClothesPreview(
          this.http(),
          clothesPreviewPayload(state, nodeState, repoId)
        );
      const family = clothesModelKind(nodeState).toLowerCase();
      const image = await (this.options.withModels?.(family, render) ??
        render());
      if (isCurrent() && image) {
        this.setUi({ generatedImage: image });
      }
    } catch (error) {
      if (isCurrent()) {
        this.options.notify("Preview Failed", errorText(error));
      }
    } finally {
      this.setUi({ previewGenerated: true, previewRunning: false });
    }
  }

  // --- Clone reference --------------------------------------------------------

  async uploadClone(file: Blob & { name?: string }): Promise<boolean> {
    if (!this.current) {
      return false;
    }
    this.setUi({ uploading: true });
    try {
      const ref = await uploadCloneReference(this.http(), file);
      this.update((model) => model.setCloneImage(ref));
      return true;
    } catch (error) {
      this.options.notify("Upload Failed", errorText(error));
      return false;
    } finally {
      this.setUi({ uploading: false });
    }
  }

  // --- Server events ----------------------------------------------------------

  /** `vnccs.preview.updated`: a run cached a new render for this designer. */
  handlePreviewUpdated(detail: unknown): void {
    const { character, nodeId } = eventDetail(detail);
    if (
      nodeId === CLOTHES_IDS.source &&
      (!character || character === this.character())
    ) {
      this.refreshPreview(true);
    }
  }

  /** `vnccs.clothes_designer.validation_error`: the node refused a run. */
  handleValidationError(detail: unknown): void {
    const { message, nodeId } = eventDetail(detail);
    if (nodeId === CLOTHES_IDS.source) {
      this.options.notify("Costume Required", message || COSTUME_REQUIRED);
    }
  }
}
