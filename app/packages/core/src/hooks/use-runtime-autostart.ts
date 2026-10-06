"use client";

import { inDesktopApp, startRuntime } from "@workspace/core/lib/tauri";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import {
  runtimePort,
  useSettingsStore,
} from "@workspace/core/stores/settings-store";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Start the managed ComfyUI once per launch when the setting is on. Waits for
 * the first connection check so an already running ComfyUI is reused instead
 * of colliding with a second one on the same port.
 */
export function useRuntimeAutostart() {
  const status = useConnectionStore((state) => state.status);
  const runtime = useConnectionStore((state) => state.runtime);
  const autoStart = useSettingsStore((state) => state.autoStartRuntime);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !autoStart || !inDesktopApp()) {
      return;
    }
    if (status === "checking") {
      return;
    }
    attempted.current = true;
    if (status === "online" || runtime?.running) {
      return;
    }
    const { runtimeRoot, comfyUrl } = useSettingsStore.getState();
    startRuntime(runtimeRoot, runtimePort(comfyUrl))
      .then((started) => useConnectionStore.setState({ runtime: started }))
      .catch((error: unknown) =>
        toast.error(`Could not start ComfyUI: ${String(error)}`)
      );
  }, [autoStart, runtime, status]);
}
