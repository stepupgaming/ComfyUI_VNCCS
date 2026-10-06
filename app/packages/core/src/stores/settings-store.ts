import { DEFAULT_COMFY_URL, trimTrailingSlashes } from "@workspace/vnccs/http";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const DEFAULT_RUNTIME_ROOT = "F:\\VNCCS\\ComfyUI";

interface SettingsState {
  autoStartRuntime: boolean;
  comfyUrl: string;
  runtimeRoot: string;
  setAutoStartRuntime: (value: boolean) => void;
  setComfyUrl: (value: string) => void;
  setRuntimeRoot: (value: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      autoStartRuntime: false,
      comfyUrl: DEFAULT_COMFY_URL,
      runtimeRoot: DEFAULT_RUNTIME_ROOT,
      setAutoStartRuntime: (autoStartRuntime) => set({ autoStartRuntime }),
      setComfyUrl: (comfyUrl) =>
        set({ comfyUrl: trimTrailingSlashes(comfyUrl.trim()) }),
      setRuntimeRoot: (runtimeRoot) => set({ runtimeRoot: runtimeRoot.trim() }),
    }),
    {
      name: "vnccs-studio-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/** Port the managed runtime listens on, taken from the configured URL. */
export function runtimePort(comfyUrl: string): number {
  try {
    const url = new URL(comfyUrl);
    return url.port ? Number(url.port) : 8188;
  } catch {
    return 8188;
  }
}
