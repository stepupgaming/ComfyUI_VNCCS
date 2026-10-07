"use client";

import { getCurrentWindow } from "@tauri-apps/api/window";
import { modelMemory } from "@workspace/core/lib/model-memory";
import { inDesktopApp } from "@workspace/core/lib/tauri";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useEffect } from "react";

/** Closing must not hang on an unresponsive ComfyUI. */
const CLOSE_RELEASE_MS = 5000;

/**
 * Keep ComfyUI from holding models the studio no longer needs: idle out
 * models a previous session left behind, and free everything when the window
 * closes. A runtime the app started is stopped on exit instead.
 */
export function useModelMemory() {
  const online = useConnectionStore((state) => state.status === "online");

  useEffect(() => {
    if (online) {
      modelMemory.touch();
    }
  }, [online]);

  useEffect(() => {
    if (!inDesktopApp()) {
      return () => modelMemory.dispose();
    }
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      const { runtime, status } = useConnectionStore.getState();
      if (runtime?.running || status !== "online") {
        return;
      }
      await Promise.race([
        modelMemory.releaseAll().catch(() => false),
        new Promise((resolve) => setTimeout(resolve, CLOSE_RELEASE_MS)),
      ]);
    });
    return () => {
      modelMemory.dispose();
      unlisten.then((stop) => stop());
    };
  }, []);
}
