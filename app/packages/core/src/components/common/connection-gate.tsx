"use client";

import { useRuntimeControl } from "@workspace/core/hooks/use-runtime-control";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Loader2, Plug } from "lucide-react";
import type { ReactNode } from "react";

/** Render children only while ComfyUI answers; otherwise offer to start it. */
export function ConnectionGate({ children }: { children: ReactNode }) {
  const status = useConnectionStore((state) => state.status);
  const comfyUrl = useSettingsStore((state) => state.comfyUrl);
  const { available, busy, runtime, start } = useRuntimeControl();

  if (status === "online") {
    return children;
  }

  const starting = Boolean(runtime?.running) || status === "checking";
  let description = `No ComfyUI answered at ${comfyUrl}. Start the VNCCS runtime with runtime/start-comfyui.ps1, then this page connects on its own.`;
  if (available) {
    description = `No ComfyUI answered at ${comfyUrl}. Start the managed runtime or check the address in Settings.`;
  }
  if (starting) {
    description =
      "Waiting for ComfyUI. The first start loads every custom node and can take a minute.";
  }

  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {starting ? <Loader2 className="animate-spin" /> : <Plug />}
        </EmptyMedia>
        <EmptyTitle>
          {starting ? "Connecting to ComfyUI" : "ComfyUI is not running"}
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {available && !starting ? (
        <EmptyContent>
          <Button disabled={busy} onClick={start}>
            Start ComfyUI
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
