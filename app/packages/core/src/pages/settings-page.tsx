"use client";

import { SelectField } from "@workspace/core/components/common/form-fields";
import { Page } from "@workspace/core/components/common/page";
import { useRuntimeControl } from "@workspace/core/hooks/use-runtime-control";
import { formatGiB } from "@workspace/core/lib/format";
import { modelMemory } from "@workspace/core/lib/model-memory";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { DEFAULT_COMFY_URL } from "@workspace/vnccs/http";
import { Eraser, Loader2, Play, Square } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

const DEV_ORIGIN = "http://localhost:1420";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function ConnectionCard() {
  const comfyUrl = useSettingsStore((state) => state.comfyUrl);
  const setComfyUrl = useSettingsStore((state) => state.setComfyUrl);
  const status = useConnectionStore((state) => state.status);
  const system = useConnectionStore((state) => state.system);
  const [draft, setDraft] = useState(comfyUrl);
  const inputId = useId();

  useEffect(() => setDraft(comfyUrl), [comfyUrl]);

  const valid = isHttpUrl(draft.trim());
  const apply = () => {
    if (valid) {
      setComfyUrl(draft);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ComfyUI connection</CardTitle>
        <CardDescription>
          The studio drives one ComfyUI with VNCCS installed. It must be started
          with --enable-cors-header set to this app&apos;s origin.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>Address</Label>
          <div className="flex gap-2">
            <Input
              aria-invalid={!valid}
              id={inputId}
              onBlur={apply}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  apply();
                }
              }}
              placeholder={DEFAULT_COMFY_URL}
              value={draft}
            />
            <Button
              disabled={comfyUrl === DEFAULT_COMFY_URL}
              onClick={() => setComfyUrl(DEFAULT_COMFY_URL)}
              variant="outline"
            >
              Reset
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={status === "online" ? "success" : "destructive"}>
            {status === "online" ? "Online" : "Offline"}
          </Badge>
          {system ? (
            <>
              <span className="text-muted-foreground">
                ComfyUI {system.system.comfyui_version ?? "unknown"} · Python{" "}
                {system.system.python_version.split(" ")[0]} · PyTorch{" "}
                {system.system.pytorch_version ?? "unknown"}
              </span>
              {system.devices.map((device) => (
                <span className="text-muted-foreground" key={device.index}>
                  {device.name} ({formatGiB(device.vram_total)})
                </span>
              ))}
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeLog({ lines }: { lines: string[] }) {
  const end = useRef<HTMLDivElement>(null);
  const count = lines.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever the tail grows
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  return (
    <div className="h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
      {count === 0 ? (
        <span className="text-muted-foreground">No output yet.</span>
      ) : (
        <pre className="whitespace-pre-wrap break-all">{lines.join("\n")}</pre>
      )}
      <div ref={end} />
    </div>
  );
}

function ManagedRuntimeCard() {
  const runtimeRoot = useSettingsStore((state) => state.runtimeRoot);
  const setRuntimeRoot = useSettingsStore((state) => state.setRuntimeRoot);
  const autoStart = useSettingsStore((state) => state.autoStartRuntime);
  const setAutoStart = useSettingsStore((state) => state.setAutoStartRuntime);
  const { busy, logs, runtime, start, stop } = useRuntimeControl({
    withLogs: true,
  });
  const [draft, setDraft] = useState(runtimeRoot);
  const rootId = useId();
  const autoId = useId();

  useEffect(() => setDraft(runtimeRoot), [runtimeRoot]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Managed runtime</CardTitle>
        <CardDescription>
          The desktop app can launch the dedicated ComfyUI created by
          runtime/setup-comfyui.ps1 and stops it when the app closes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={rootId}>ComfyUI folder</Label>
          <Input
            id={rootId}
            onBlur={() => setRuntimeRoot(draft)}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={autoStart}
            id={autoId}
            onCheckedChange={setAutoStart}
          />
          <Label htmlFor={autoId}>
            Start ComfyUI when the studio opens (skipped if one is already
            running)
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {runtime?.running ? (
            <Button disabled={busy} onClick={stop} variant="destructive">
              <Square />
              Stop ComfyUI
            </Button>
          ) : (
            <Button disabled={busy} onClick={start}>
              <Play />
              Start ComfyUI
            </Button>
          )}
          <span className="text-muted-foreground text-sm">
            {runtime?.running
              ? `Running (PID ${runtime.pid ?? "?"}), trusting ${runtime.origin}`
              : "Not started by the studio"}
          </span>
        </div>
        <RuntimeLog lines={logs} />
      </CardContent>
    </Card>
  );
}

const IDLE_CHOICES = [
  { label: "Never", value: "0" },
  { label: "After 1 minute", value: "1" },
  { label: "After 2 minutes", value: "2" },
  { label: "After 5 minutes", value: "5" },
  { label: "After 10 minutes", value: "10" },
  { label: "After 15 minutes", value: "15" },
  { label: "After 30 minutes", value: "30" },
  { label: "After 1 hour", value: "60" },
];

function ModelMemoryCard() {
  const gpuMinutes = useSettingsStore((state) => state.gpuIdleMinutes);
  const allMinutes = useSettingsStore((state) => state.memoryIdleMinutes);
  const setGpuMinutes = useSettingsStore((state) => state.setGpuIdleMinutes);
  const setAllMinutes = useSettingsStore((state) => state.setMemoryIdleMinutes);
  const system = useConnectionStore((state) => state.system);
  const [releasing, setReleasing] = useState(false);

  const releaseNow = async () => {
    setReleasing(true);
    try {
      if (await modelMemory.releaseAll()) {
        toast.success("Models released");
      } else {
        toast.error("Could not release models", {
          description: "ComfyUI is offline or still generating.",
        });
      }
    } finally {
      setReleasing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model memory</CardTitle>
        <CardDescription>
          The studio frees the previous model family before loading another,
          frees everything when the window closes, and releases models after it
          has been idle. Freeing VRAM keeps RAM copies so the next preview and
          Regenerate start quickly; freeing all memory also ends Regenerate for
          earlier runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Free VRAM when idle"
            onChange={(value) => setGpuMinutes(Number(value))}
            options={IDLE_CHOICES}
            value={String(gpuMinutes)}
          />
          <SelectField
            label="Free all model memory when idle"
            onChange={(value) => setAllMinutes(Number(value))}
            options={IDLE_CHOICES}
            value={String(allMinutes)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={releasing} onClick={releaseNow} variant="outline">
            {releasing ? <Loader2 className="animate-spin" /> : <Eraser />}
            Free memory now
          </Button>
          {system ? (
            <span className="text-muted-foreground text-sm">
              {system.devices.map(
                (device) =>
                  `VRAM ${formatGiB(device.vram_total - device.vram_free)} of ${formatGiB(device.vram_total)} in use · `
              )}
              RAM {formatGiB(system.system.ram_total - system.system.ram_free)}{" "}
              of {formatGiB(system.system.ram_total)} in use
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function BrowserRuntimeCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime</CardTitle>
        <CardDescription>
          In a browser the studio cannot launch ComfyUI. Start it yourself so it
          trusts this page&apos;s origin:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre className="overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
          {`runtime\\start-comfyui.ps1 -Origin ${DEV_ORIGIN}`}
        </pre>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { available } = useRuntimeControl();

  return (
    <Page className="max-w-4xl">
      <ConnectionCard />
      <ModelMemoryCard />
      {available ? <ManagedRuntimeCard /> : <BrowserRuntimeCard />}
    </Page>
  );
}
