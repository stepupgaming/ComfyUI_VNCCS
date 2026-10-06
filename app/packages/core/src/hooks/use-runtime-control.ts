"use client";

import {
  inDesktopApp,
  runtimeLogs,
  startRuntime,
  stopRuntime,
} from "@workspace/core/lib/tauri";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import {
  runtimePort,
  useSettingsStore,
} from "@workspace/core/stores/settings-store";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/** Start/stop the managed ComfyUI runtime and tail its log (desktop app only). */
export function useRuntimeControl({ withLogs = false } = {}) {
  const runtime = useConnectionStore((state) => state.runtime);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const available = inDesktopApp();

  const start = useCallback(async () => {
    const { runtimeRoot, comfyUrl } = useSettingsStore.getState();
    setBusy(true);
    try {
      const status = await startRuntime(runtimeRoot, runtimePort(comfyUrl));
      useConnectionStore.setState({ runtime: status });
      toast.success("ComfyUI is starting");
    } catch (error) {
      toast.error(`Could not start ComfyUI: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      useConnectionStore.setState({ runtime: await stopRuntime() });
      toast.success("ComfyUI stopped");
    } catch (error) {
      toast.error(`Could not stop ComfyUI: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!(available && withLogs)) {
      return;
    }
    let active = true;
    const refresh = async () => {
      const lines = await runtimeLogs().catch(() => null);
      if (active && lines) {
        setLogs(lines);
      }
    };
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [available, withLogs]);

  return { available, busy, logs, runtime, start, stop };
}
