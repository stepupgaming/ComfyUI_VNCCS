import type { VnccsHttp } from "./http";

/** ComfyUI core routes the shell polls. These are not VNCCS routes. */

export interface ComfyDevice {
  index: number;
  name: string;
  type: string;
  vram_free: number;
  vram_total: number;
}

export interface SystemStats {
  devices: ComfyDevice[];
  system: {
    comfyui_version?: string;
    os: string;
    python_version: string;
    pytorch_version?: string;
    ram_free: number;
    ram_total: number;
  };
}

export interface QueueCounts {
  pending: number;
  running: number;
}

async function comfyJson<T>(http: VnccsHttp, route: string): Promise<T> {
  const response = await fetch(http.url(route), {
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    throw new Error(`${route}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchSystemStats(http: VnccsHttp): Promise<SystemStats> {
  return comfyJson<SystemStats>(http, "/system_stats");
}

export async function fetchQueueCounts(http: VnccsHttp): Promise<QueueCounts> {
  const queue = await comfyJson<{
    queue_pending: unknown[];
    queue_running: unknown[];
  }>(http, "/queue");
  return {
    pending: queue.queue_pending.length,
    running: queue.queue_running.length,
  };
}

export function interruptExecution(http: VnccsHttp): Promise<Response> {
  return fetch(http.url("/interrupt"), { method: "POST" });
}
