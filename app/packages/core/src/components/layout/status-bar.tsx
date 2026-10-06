"use client";

import { formatElapsed, formatGiB } from "@workspace/core/lib/format";
import { studioHttp } from "@workspace/core/lib/studio";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useJobStore } from "@workspace/core/stores/job-store";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import { Button } from "@workspace/ui/components/button";
import { Progress } from "@workspace/ui/components/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { interruptExecution } from "@workspace/vnccs/system";
import { Cpu, ListOrdered, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const URL_SCHEME = /^https?:\/\//;
const CUDA_PREFIX = /^cuda:\d+\s*/;

function ConnectionIndicator() {
  const status = useConnectionStore((state) => state.status);
  const error = useConnectionStore((state) => state.error);
  const starting = useConnectionStore(
    (state) => state.status !== "online" && Boolean(state.runtime?.running)
  );
  const comfyUrl = useSettingsStore((state) => state.comfyUrl);

  let label = "ComfyUI offline";
  let dot = "bg-destructive";
  if (status === "online") {
    label = "ComfyUI online";
    dot = "bg-emerald-500";
  } else if (starting) {
    label = "ComfyUI starting";
    dot = "animate-pulse bg-amber-500";
  } else if (status === "checking") {
    label = "Connecting";
    dot = "animate-pulse bg-muted-foreground";
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild={true}>
        <span className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", dot)} />
          <span>{label}</span>
          <span className="hidden text-muted-foreground lg:inline">
            {comfyUrl.replace(URL_SCHEME, "")}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {status === "online" ? comfyUrl : (error ?? comfyUrl)}
      </TooltipContent>
    </Tooltip>
  );
}

function DeviceSummary() {
  const device = useConnectionStore((state) => state.system?.devices[0]);
  if (!device) {
    return null;
  }
  const used = device.vram_total - device.vram_free;
  const name = device.name.replace(CUDA_PREFIX, "").split(":")[0];
  return (
    <span
      className="hidden items-center gap-1.5 text-muted-foreground md:flex"
      title={device.name}
    >
      <Cpu className="size-3.5" />
      <span className="max-w-48 truncate">{name}</span>
      <span>
        {formatGiB(used)} / {formatGiB(device.vram_total)}
      </span>
    </span>
  );
}

function QueueSummary() {
  const queue = useConnectionStore((state) => state.queue);
  const online = useConnectionStore((state) => state.status === "online");
  if (!online) {
    return null;
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <ListOrdered className="size-3.5" />
      {queue.running} running · {queue.pending} queued
    </span>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function JobSummary() {
  const job = useJobStore((state) => state.current);
  const active = job?.status === "queued" || job?.status === "running";
  const now = useNow(active);
  if (!job) {
    return null;
  }

  const interrupt = async () => {
    try {
      await interruptExecution(studioHttp());
    } catch (error) {
      toast.error(`Could not interrupt: ${String(error)}`);
    }
  };

  let detail = job.nodeName ?? "Queued";
  if (job.status === "done") {
    detail = "Finished";
  } else if (job.status === "failed") {
    detail = job.error ?? "Failed";
  } else if (job.nodeProgress) {
    detail = `${detail} ${job.nodeProgress.value}/${job.nodeProgress.max}`;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      {job.previewUrl ? (
        // biome-ignore lint/performance/noImgElement: blob preview from the websocket; next/image cannot optimize it in a static export
        <img
          alt="Live preview"
          className="size-7 rounded object-cover"
          height={28}
          src={job.previewUrl}
          width={28}
        />
      ) : null}
      <span className="max-w-40 truncate font-medium">{job.label}</span>
      <span
        className={cn(
          "max-w-72 truncate text-muted-foreground",
          job.status === "failed" && "text-destructive"
        )}
        title={detail}
      >
        {detail}
      </span>
      {active ? (
        <>
          <Progress className="h-1.5 w-32" value={job.percent} />
          <span className="text-muted-foreground tabular-nums">
            {Math.round(job.percent)}% · {formatElapsed(now - job.startedAt)}
          </span>
          <Button
            aria-label="Interrupt"
            onClick={interrupt}
            size="icon-xs"
            variant="ghost"
          >
            <Square />
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function StatusBar() {
  return (
    <footer className="flex h-9 shrink-0 items-center gap-5 border-t px-4 text-xs">
      <ConnectionIndicator />
      <DeviceSummary />
      <QueueSummary />
      <div className="ml-auto min-w-0">
        <JobSummary />
      </div>
    </footer>
  );
}
