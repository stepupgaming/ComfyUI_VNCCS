"use client";

import { RemoteImage } from "@workspace/core/components/common/remote-image";
import {
  GeneratorInlineSettings,
  GeneratorSettingsDialog,
} from "@workspace/core/components/generator/generator-settings";
import { ImageViewer } from "@workspace/core/components/generator/image-viewer";
import type { GeneratorHandle } from "@workspace/core/hooks/use-generator";
import {
  type GeneratorSources,
  regenerateStage,
  selectGeneratorPreview,
} from "@workspace/core/lib/generator-actions";
import { studioHttp } from "@workspace/core/lib/studio";
import { Button } from "@workspace/ui/components/button";
import { Progress } from "@workspace/ui/components/progress";
import { cn } from "@workspace/ui/lib/utils";
import {
  formatElapsed,
  formatStageStatus,
  GENERATOR_TITLE,
  type GeneratorView,
  regenerateElapsed,
  stageProgressPercent,
} from "@workspace/vnccs/character-generator";
import { Loader2, RotateCcw, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

/** Seconds since the outstanding Regenerate began, ticking while it runs. */
function useRegenerateElapsed(view: GeneratorView): number {
  const active = Boolean(view.regenerate);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return regenerateElapsed(view, now);
}

function RegenerateButton({
  label = "Regenerate",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      size="xs"
      variant="secondary"
    >
      <RotateCcw />
      {label}
    </Button>
  );
}

function StagePreview({
  elapsed,
  handle,
  sources,
}: {
  elapsed: number;
  handle: GeneratorHandle;
  sources: GeneratorSources;
}) {
  const { model, target, view } = handle;
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const stages = model.stages();
  const selected = view.selectedPreview;
  const label = stages.find((stage) => stage.key === selected)?.label;
  const state = view.stages[selected];
  const http = studioHttp();
  const images = (state?.images ?? []).map((image) => http.mediaUrl(image));
  const canRegenerate = state?.status === "done" && !view.regenerate;
  const regen = view.regenerate;
  const regenName =
    stages.find((stage) => stage.key === regen?.activeStage)?.label ?? "Stage";
  const regenItem = Number.isInteger(regen?.imageIndex)
    ? ` #${(regen?.imageIndex ?? 0) + 1}`
    : "";

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-sm">{label || "Results"}</span>
        {regen ? (
          <span className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Regenerating {regenName}
            {regenItem} · {formatElapsed(elapsed)}
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {stages.map((stage) => (
              <Button
                aria-pressed={stage.key === selected}
                key={stage.key}
                onClick={() => selectGeneratorPreview(target, stage.key)}
                size="xs"
                variant={stage.key === selected ? "secondary" : "ghost"}
              >
                {stage.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {images.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
          {images.map((source, index) => (
            <div
              className="group relative aspect-[2/3] overflow-hidden rounded-md border bg-[length:16px_16px] bg-[repeating-conic-gradient(#80808018_0%_25%,transparent_0%_50%)]"
              key={source}
            >
              <button
                aria-label={`Open image ${index + 1}`}
                className="size-full"
                onClick={() => setViewerIndex(index)}
                type="button"
              >
                <RemoteImage
                  className="size-full object-contain"
                  loading="lazy"
                  src={source}
                />
              </button>
              {canRegenerate ? (
                <div className="absolute inset-x-0 bottom-0 flex justify-center p-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <RegenerateButton
                    onClick={() =>
                      regenerateStage(target, sources, selected, index)
                    }
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
          {formatStageStatus(view, selected, elapsed)}
        </div>
      )}
      {viewerIndex === null ? null : (
        <ImageViewer
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onSelectStage={(stage) => selectGeneratorPreview(target, stage)}
          selectedStage={selected}
          sources={images}
          stages={stages}
        />
      )}
    </div>
  );
}

function StageChain({
  elapsed,
  handle,
  sources,
}: {
  elapsed: number;
  handle: GeneratorHandle;
  sources: GeneratorSources;
}) {
  const { model, target, view } = handle;
  return (
    <ol className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
      {model.stages().map((stage) => {
        const state = view.stages[stage.key];
        const status = state?.status ?? "waiting";
        const regenerating = view.regenerate?.targetStages.includes(stage.key);
        const showProgress =
          status === "running" || view.regenerate?.activeStage === stage.key;
        const lora = model.stageLoraLabel(stage.key);
        return (
          <li
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border p-2.5 text-sm transition-colors",
              status === "running" && "border-primary",
              status === "done" && "border-emerald-500/50",
              status === "error" && "border-destructive/60",
              regenerating && "border-amber-500/60",
              stage.key === view.selectedPreview && "bg-muted/50"
            )}
            key={stage.key}
          >
            <button
              className="flex flex-col items-start gap-0.5 text-left"
              onClick={() => selectGeneratorPreview(target, stage.key)}
              type="button"
            >
              <span className="font-medium">{stage.label}</span>
              <span
                className={cn(
                  "text-muted-foreground text-xs",
                  status === "error" && "text-destructive"
                )}
              >
                {formatStageStatus(view, stage.key, elapsed)}
              </span>
            </button>
            {showProgress ? (
              <Progress
                className="h-1"
                value={stageProgressPercent(state, elapsed)}
              />
            ) : null}
            {lora ? (
              <span className="text-muted-foreground text-xs">
                LoRA: {lora}
              </span>
            ) : null}
            {status === "done" && !view.regenerate ? (
              <div className="flex">
                <RegenerateButton
                  onClick={() => regenerateStage(target, sources, stage.key)}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A Character Generator node: inline settings, the stage preview and the
 * stage chain, like the widget's DOM panel.
 */
export function GeneratorPanel({
  handle,
  sources,
}: {
  handle: GeneratorHandle;
  sources: GeneratorSources;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const elapsed = useRegenerateElapsed(handle.view);

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <h3 className="font-medium text-sm">
          {GENERATOR_TITLE[handle.target.kind]}
        </h3>
        <GeneratorInlineSettings handle={handle} />
        <Button onClick={() => setSettingsOpen(true)} variant="outline">
          <Settings2 />
          Generator Settings
        </Button>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <StagePreview elapsed={elapsed} handle={handle} sources={sources} />
        <StageChain elapsed={elapsed} handle={handle} sources={sources} />
      </div>
      {settingsOpen ? (
        <GeneratorSettingsDialog
          handle={handle}
          onClose={() => setSettingsOpen(false)}
          sources={sources}
        />
      ) : null}
    </div>
  );
}
