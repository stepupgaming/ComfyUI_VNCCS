"use client";

import { useDownload } from "@workspace/core/hooks/use-control-center";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  type CatalogItem,
  type ControlCenterModel,
  UNET_WEIGHT_DTYPES,
} from "@workspace/vnccs/control-center-state";
import { partitionDownloads } from "@workspace/vnccs/download-guard";
import { DEFAULT_REPO_ID } from "@workspace/vnccs/graphs";
import { Ban, Download, Loader2 } from "lucide-react";
import { useId, useState } from "react";

const QUEUE_SPACING_MS = 300;

export function ControlCenterSettingsDialog({
  model,
  onClose,
}: {
  model: ControlCenterModel;
  onClose: () => void;
}) {
  const repoId = useControlCenterStore((state) => state.repoId);
  const setRepoId = useControlCenterStore((state) => state.setRepoId);
  const update = useControlCenterStore((state) => state.update);
  const [weightDtype, setWeightDtype] = useState(model.unetWeightDtype());
  const [repoDraft, setRepoDraft] = useState(repoId);
  const dtypeId = useId();
  const repoInputId = useId();
  const repoValid = repoDraft.trim() !== "" && !repoDraft.trim().includes(" ");

  const save = () => {
    update((next) => next.saveSettings({ weightDtype }));
    setRepoId(repoDraft);
    onClose();
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Control Center settings</DialogTitle>
          <DialogDescription>
            Loader options saved with the Control Center state.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={dtypeId}>UNet weight dtype</Label>
            <Select onValueChange={setWeightDtype} value={weightDtype}>
              <SelectTrigger className="w-full" id={dtypeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNET_WEIGHT_DTYPES.map((dtype) => (
                  <SelectItem key={dtype} value={dtype}>
                    {dtype}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Precision mode for UNet loading. Default follows the loader; fp8
              modes can reduce memory use.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={repoInputId}>Catalog repository</Label>
            <div className="flex gap-2">
              <Input
                aria-invalid={!repoValid}
                id={repoInputId}
                onChange={(event) => setRepoDraft(event.target.value)}
                value={repoDraft}
              />
              <Button
                disabled={repoDraft === DEFAULT_REPO_ID}
                onClick={() => setRepoDraft(DEFAULT_REPO_ID)}
                variant="outline"
              >
                Reset
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Hugging Face repository whose control_center.json lists the
              models, LoRAs and helpers.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={!repoValid} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DownloadAllDialog({
  items,
  onClose,
}: {
  items: CatalogItem[];
  onClose: () => void;
}) {
  const download = useDownload();
  const [running, setRunning] = useState(false);
  const { allowed, blocked } = partitionDownloads(items);

  const start = async () => {
    setRunning(true);
    for (const { category, entry } of allowed) {
      await download(category, entry);
      await new Promise((resolve) => setTimeout(resolve, QUEUE_SPACING_MS));
    }
    onClose();
  };

  return (
    <Dialog
      onOpenChange={(open) => !(open || running) && onClose()}
      open={true}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Download / Update</DialogTitle>
          <DialogDescription>
            {allowed.length > 0
              ? `Download or update ${allowed.length} item(s) for the selected family?`
              : "Nothing here can be downloaded from the studio."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-3 overflow-auto">
          {allowed.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {allowed.map(({ category, entry }) => (
                <li
                  className="flex items-center gap-2"
                  key={`${category}:${entry.name}`}
                >
                  <Download className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {category}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {blocked.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-xs">
                Skipped: install these outside the app
              </span>
              <ul className="flex flex-col gap-1 text-muted-foreground text-xs">
                {blocked.map(({ category, entry, reason }) => (
                  <li
                    className="flex items-start gap-2"
                    key={`${category}:${entry.name}`}
                    title={reason}
                  >
                    <Ban className="mt-0.5 size-3.5 shrink-0" />
                    <span>{entry.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button disabled={running} onClick={onClose} variant="outline">
            {allowed.length > 0 ? "Cancel" : "Close"}
          </Button>
          {allowed.length > 0 ? (
            <Button disabled={running} onClick={start}>
              {running ? <Loader2 className="animate-spin" /> : <Download />}
              {running ? "Queueing…" : "Download"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
