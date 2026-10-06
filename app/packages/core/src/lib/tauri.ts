import { invoke, isTauri } from "@tauri-apps/api/core";

export interface RuntimeStatus {
  origin: string;
  pid: number | null;
  running: boolean;
}

/** True inside the desktop app; false in a plain browser (`pnpm dev`). */
export function inDesktopApp(): boolean {
  return typeof window !== "undefined" && isTauri();
}

export function runtimeStatus(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>("runtime_status");
}

export function startRuntime(
  root: string,
  port: number
): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>("runtime_start", { root, port });
}

export function stopRuntime(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>("runtime_stop");
}

export function runtimeLogs(): Promise<string[]> {
  return invoke<string[]>("runtime_logs");
}
