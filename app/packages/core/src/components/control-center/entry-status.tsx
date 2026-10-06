"use client";

import { useDownload } from "@workspace/core/hooks/use-control-center";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Progress } from "@workspace/ui/components/progress";
import { cn } from "@workspace/ui/lib/utils";
import {
  type CatalogEntry,
  type DownloadCategory,
  type DownloadState,
  downloadKey,
} from "@workspace/vnccs/control-center";
import {
  type DisplayStatus,
  isDownloadableStatus,
  resolveStatus,
  statusLabel,
} from "@workspace/vnccs/control-center-state";
import { downloadBlockReason } from "@workspace/vnccs/download-guard";
import { ArrowUp, Ban, Download, KeyRound } from "lucide-react";

export interface EntryView {
  /** Set when the entry needs downloading but the guard refuses it. */
  blockReason: string | null;
  download: DownloadState | undefined;
  status: DisplayStatus;
}

export function useEntryView(
  category: DownloadCategory,
  entry: CatalogEntry
): EntryView {
  const download = useControlCenterStore(
    (state) => state.downloads[downloadKey(category, entry.name)]
  );
  const status = resolveStatus(download, entry.status);
  return {
    download,
    status,
    blockReason: isDownloadableStatus(status)
      ? downloadBlockReason(category, entry)
      : null,
  };
}

const BADGE_VARIANTS: Record<
  DisplayStatus,
  "success" | "warning" | "secondary" | "destructive" | "outline"
> = {
  installed: "success",
  outdated: "warning",
  queued: "secondary",
  downloading: "secondary",
  error: "destructive",
  auth_required: "destructive",
  missing: "outline",
};

export function StatusBadge({
  className,
  label,
  view,
}: {
  className?: string;
  label?: string;
  view: EntryView;
}) {
  return (
    <Badge
      className={cn("max-w-56 truncate", className)}
      title={view.download?.message}
      variant={BADGE_VARIANTS[view.status]}
    >
      {label ?? statusLabel(view.status, view.download)}
    </Badge>
  );
}

/** Byte progress while a download runs; an indeterminate bar while it waits. */
export function DownloadBar({ view }: { view: EntryView }) {
  if (view.status !== "downloading" && view.status !== "queued") {
    return null;
  }
  const progress = view.download?.progress;
  if (view.status === "downloading" && Number.isFinite(progress)) {
    return (
      <Progress
        className="h-1"
        value={Math.max(0, Math.min(progress ?? 0, 100))}
      />
    );
  }
  return <Progress className="h-1 animate-pulse" value={100} />;
}

/** The download or update button, or why there is none. */
export function EntryAction({
  category,
  entry,
  size = "sm",
  view,
}: {
  category: DownloadCategory;
  entry: CatalogEntry;
  size?: "xs" | "sm";
  view: EntryView;
}) {
  const download = useDownload();

  if (view.blockReason) {
    return (
      <span
        className="flex items-center gap-1.5 text-muted-foreground text-xs"
        title={view.blockReason}
      >
        <Ban className="size-3.5 shrink-0" />
        Install outside the app
      </span>
    );
  }
  if (view.status === "auth_required") {
    return (
      <span className="flex items-center gap-1.5 text-destructive text-xs">
        <KeyRound className="size-3.5 shrink-0" />
        Authentication required
      </span>
    );
  }
  if (!isDownloadableStatus(view.status)) {
    return null;
  }
  const update = view.status === "outdated";
  return (
    <Button
      onClick={(event) => {
        event.stopPropagation();
        download(category, entry);
      }}
      size={size}
      variant="outline"
    >
      {update ? <ArrowUp /> : <Download />}
      {update ? "Update" : "Download"}
    </Button>
  );
}

/** The guard's full explanation, for cards with room to show it. */
export function BlockedNote({ view }: { view: EntryView }) {
  if (!view.blockReason) {
    return null;
  }
  return <p className="text-muted-foreground text-xs">{view.blockReason}</p>;
}
