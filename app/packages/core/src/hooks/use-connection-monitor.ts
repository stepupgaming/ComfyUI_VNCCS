"use client";

import { inDesktopApp, runtimeStatus } from "@workspace/core/lib/tauri";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { VnccsHttp } from "@workspace/vnccs/http";
import { fetchQueueCounts, fetchSystemStats } from "@workspace/vnccs/system";
import { useEffect } from "react";

const POLL_MS = 3000;

async function poll(comfyUrl: string) {
  const runtime = inDesktopApp()
    ? await runtimeStatus().catch(() => null)
    : null;
  try {
    const http = new VnccsHttp(comfyUrl);
    const [system, queue] = await Promise.all([
      fetchSystemStats(http),
      fetchQueueCounts(http),
    ]);
    useConnectionStore.setState({
      status: "online",
      error: null,
      system,
      queue,
      runtime,
    });
  } catch (error) {
    useConnectionStore.setState({
      status: "offline",
      error: error instanceof Error ? error.message : String(error),
      runtime,
    });
  }
}

/** Poll ComfyUI (and the managed runtime in the desktop app) while mounted. */
export function useConnectionMonitor() {
  const comfyUrl = useSettingsStore((state) => state.comfyUrl);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await poll(comfyUrl);
      if (active) {
        timer = setTimeout(tick, POLL_MS);
      }
    };
    useConnectionStore.setState({ status: "checking" });
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [comfyUrl]);
}
