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

export function createCharacter(http: VnccsHttp, name: string) {
  return http.post<{ status?: string }>("/vnccs/create", {
    name,
    catalog: "creator_v2",
  });
}

export function deleteCharacter(http: VnccsHttp, name: string) {
  return http.post<{ status?: string }>("/vnccs/delete", { name });
}

/** Number of saved pose sprites the preview can step through; 0 when the route fails. */
export async function fetchPosePreviewCount(
  http: VnccsHttp,
  character: string
): Promise<number> {
  try {
    const meta = await http.get<{ count?: number }>(
      "/vnccs/get_character_pose_preview_meta",
      { character, t: Date.now() }
    );
    return Number(meta.count || 0);
  } catch {
    return 0;
  }
}

export function cachedPreviewUrl(http: VnccsHttp, character: string): string {
  return http.url("/vnccs/get_cached_preview", { character, t: Date.now() });
}

export function posePreviewUrl(
  http: VnccsHttp,
  character: string,
  index: number,
  cacheBust: string
): string {
  return http.url("/vnccs/get_character_pose_preview", {
    character,
    index,
    v: cacheBust || "current",
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

/** The wizard only needs the text model, not the vision projector. */
export function fetchWizardModelStatus(
  http: VnccsHttp
): Promise<WizardModelStatus> {
  return http.get<WizardModelStatus>("/vnccs/qwen_vl_model_status", {
    vision: "false",
  });
}

export async function startWizardModelDownload(http: VnccsHttp): Promise<void> {
  try {
    await http.post("/vnccs/qwen_vl_download_model", {}, { vision: "false" });
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
    const data = error instanceof VnccsRequestError ? error.data : null;
    if (data && typeof data === "object" && "message" in data) {
      const { message } = data as { message?: unknown };
      if (typeof message === "string" && message) {
        throw new Error(message);
      }
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
