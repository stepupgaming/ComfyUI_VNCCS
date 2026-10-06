import { type VnccsHttp, VnccsRequestError } from "./http";

/** `/vnccs/context_lists`: local model folders, sampler lists and saved characters. */
export interface ContextLists {
  characters: string[];
  checkpoints: string[];
  diffusion_models: string[];
  loras: string[];
  samplers: string[];
  schedulers: string[];
  text_encoders: string[];
  vae_models: string[];
}

export async function fetchContextLists(
  http: VnccsHttp
): Promise<ContextLists> {
  const data = await http.get<Partial<ContextLists>>("/vnccs/context_lists");
  const list = (value: unknown) =>
    Array.isArray(value) ? value.map(String) : [];
  return {
    characters: list(data.characters),
    checkpoints: list(data.checkpoints),
    diffusion_models: list(data.diffusion_models),
    loras: list(data.loras),
    samplers: list(data.samplers),
    schedulers: list(data.schedulers),
    text_encoders: list(data.text_encoders),
    vae_models: list(data.vae_models),
  };
}

/** Saved `character_info` for one character; rejects metadata that belongs to another one. */
export async function fetchCharacterInfo(
  http: VnccsHttp,
  character: string
): Promise<Record<string, unknown>> {
  const info = await http.get<unknown>("/vnccs/character_info", { character });
  if (
    !info ||
    typeof info !== "object" ||
    Array.isArray(info) ||
    ("name" in info && info.name && info.name !== character)
  ) {
    throw new Error(`Invalid character metadata for '${character}'`);
  }
  return info as Record<string, unknown>;
}

export const CHARACTER_NAME_PATTERN = /^[A-Za-z0-9 _-]{1,120}$/;

/**
 * Creator V2 seeds new characters from its own catalog; the Cloner sends no
 * catalog, so the server applies the legacy defaults.
 */
export function createCharacter(
  http: VnccsHttp,
  name: string,
  catalog: string | null = "creator_v2"
) {
  return http.post<{ status?: string }>(
    "/vnccs/create",
    catalog ? { name, catalog } : { name }
  );
}

export function deleteCharacter(http: VnccsHttp, name: string) {
  return http.post<{ status?: string }>("/vnccs/delete", { name });
}

/** Number of saved pose sprites the preview can step through; 0 when the route fails. */
export async function fetchPosePreviewCount(
  http: VnccsHttp,
  character: string,
  costume = ""
): Promise<number> {
  try {
    const meta = await http.get<{ count?: number }>(
      "/vnccs/get_character_pose_preview_meta",
      { character, t: Date.now(), costume: costume || undefined }
    );
    return Number(meta.count || 0);
  } catch {
    return 0;
  }
}

export function cachedPreviewUrl(http: VnccsHttp, character: string): string {
  return http.url("/vnccs/get_cached_preview", { character, t: Date.now() });
}

/** One saved pose sprite; without a costume the server picks Naked, then Original. */
export function posePreviewUrl(
  http: VnccsHttp,
  character: string,
  index: number,
  cacheBust: string,
  costume = ""
): string {
  return http.url("/vnccs/get_character_pose_preview", {
    character,
    index,
    v: cacheBust || "current",
    costume: costume || undefined,
  });
}

/** Sprite navigation wraps around in both directions. */
export function normalizeSpriteIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return ((Math.trunc(Number(index) || 0) % count) + count) % count;
}

export interface PreviewPayload {
  character: string;
  character_info: object;
  gen_settings: { lora_stack: { name: string; strength: number }[] };
}

/** Render a preview outside the queue; resolves with a PNG data URL. */
export async function generatePreview(
  http: VnccsHttp,
  payload: PreviewPayload
): Promise<string | null> {
  const data = await http.post<{ image?: string }>(
    "/vnccs/preview_generate",
    payload
  );
  return data.image ? `data:image/png;base64,${data.image}` : null;
}

export interface WizardModelStatus {
  message?: string;
  model_name?: string;
  ready: boolean;
}

export interface WizardModelOptions {
  /**
   * Image analysis (the Cloner) also needs the vision projector; the text
   * wizards (Creator, Clothes) only need the language model.
   */
  vision?: boolean;
}

function visionQuery({ vision = false }: WizardModelOptions) {
  return vision ? undefined : { vision: "false" };
}

export function fetchWizardModelStatus(
  http: VnccsHttp,
  options: WizardModelOptions = {}
): Promise<WizardModelStatus> {
  return http.get<WizardModelStatus>(
    "/vnccs/qwen_vl_model_status",
    visionQuery(options)
  );
}

/** Starts a Hugging Face download of the Qwen3.5 model files. */
export async function startWizardModelDownload(
  http: VnccsHttp,
  options: WizardModelOptions = {}
): Promise<void> {
  try {
    await http.post("/vnccs/qwen_vl_download_model", {}, visionQuery(options));
  } catch (error) {
    // 409: a download is already running; keep polling it.
    if (!(error instanceof VnccsRequestError && error.status === 409)) {
      throw error;
    }
  }
}

export interface WizardDownloadStatus {
  current_file?: string;
  error?: string;
  progress?: number;
  status?: "idle" | "downloading" | "completed" | "error";
}

export function fetchWizardDownloadStatus(
  http: VnccsHttp
): Promise<WizardDownloadStatus> {
  return http.get<WizardDownloadStatus>("/vnccs/qwen_vl_download_status");
}

export interface WizardFields {
  additional_details?: string;
  age?: number | string;
  body?: string;
  eyes?: string;
  face?: string;
  hair?: string;
  race?: string;
  sex?: string;
  skin_color?: string;
}

/** Error codes the Qwen3.5 routes answer with when the model cannot run. */
export const MODEL_FILE_ERRORS = [
  "MODEL_MISSING",
  "MODEL_INVALID",
  "MMPROJ_MISSING",
  "MMPROJ_INVALID",
  "MODEL_DOWNLOAD_FAILED",
] as const;

export interface WizardFailure {
  /** `DEPENDENCY_MISSING`, one of {@link MODEL_FILE_ERRORS}, or another server code. */
  code: string;
  message: string;
  /** The model file the server looked for. */
  model: string;
  /** Raw model output, for parse failures. */
  raw: string;
}

/** The `{error, message, raw}` body of a failed wizard or analysis call; null for other errors. */
export function wizardFailure(error: unknown): WizardFailure | null {
  const data = error instanceof VnccsRequestError ? error.data : null;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const record = data as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const code = text(record.error);
  const message = text(record.message);
  if (!(code || message)) {
    return null;
  }
  return {
    code,
    message: message || code,
    model: text(record.model_name),
    raw: text(record.raw),
  };
}

export function isModelFileError(code: string): boolean {
  return (MODEL_FILE_ERRORS as readonly string[]).includes(code);
}

/** Expand a broad description into Creator fields with the local Qwen3.5 model. */
export async function runCharacterWizard(
  http: VnccsHttp,
  description: string,
  nodeId: string
): Promise<WizardFields> {
  try {
    return await http.post<WizardFields>("/vnccs/character_wizard", {
      description,
      node_id: nodeId,
    });
  } catch (error) {
    // Failures carry an error code plus a readable message.
    const failure = wizardFailure(error);
    if (failure) {
      throw new Error(failure.message);
    }
    throw error;
  }
}

/** Previews cannot render while ComfyUI is running or holding queued prompts. */
export async function fetchQueueBusy(http: VnccsHttp): Promise<boolean> {
  const queue = await http.get<{
    queue_pending?: unknown;
    queue_running?: unknown;
  }>("/queue");
  if (
    !(Array.isArray(queue.queue_running) && Array.isArray(queue.queue_pending))
  ) {
    throw new Error("Invalid queue response");
  }
  return queue.queue_running.length > 0 || queue.queue_pending.length > 0;
}
