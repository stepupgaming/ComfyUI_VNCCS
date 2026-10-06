"use client";

import {
  CcBlock,
  EmptyEntries,
} from "@workspace/core/components/control-center/cc-block";
import {
  DownloadBar,
  EntryAction,
  StatusBadge,
  useEntryView,
} from "@workspace/core/components/control-center/entry-status";
import { studioHttp } from "@workspace/core/lib/studio";
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
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Slider } from "@workspace/ui/components/slider";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import {
  addCustomLora,
  type CatalogEntry,
  deleteCustomLora,
  fetchLoraFiles,
  type LoraFile,
} from "@workspace/vnccs/control-center";
import type {
  ControlCenterModel,
  ModelKind,
} from "@workspace/vnccs/control-center-state";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function LoraDetails({ entry }: { entry: CatalogEntry }) {
  if (!(entry.description || entry.version)) {
    return null;
  }
  return (
    <div className="flex items-start gap-2 text-muted-foreground text-xs">
      <p className="min-w-0 flex-1">{entry.description}</p>
      {entry.version ? <span>v{entry.version}</span> : null}
    </div>
  );
}

function PipeLoraCard({ entry }: { entry: CatalogEntry }) {
  const view = useEntryView("lora", entry);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 font-medium text-sm">{entry.name}</span>
        <StatusBadge
          label={view.status === "installed" ? "Pipe" : undefined}
          view={view}
        />
      </div>
      <LoraDetails entry={entry} />
      <DownloadBar view={view} />
      <EntryAction category="lora" entry={entry} size="xs" view={view} />
    </div>
  );
}

export function PipeLoraBlock({ model }: { model: ControlCenterModel }) {
  const entries = model.pipeLoras();
  return (
    <CcBlock blockKey="lora" count={entries.length} title="LoRA">
      {entries.length === 0 ? (
        <EmptyEntries />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <PipeLoraCard entry={entry} key={entry.name} />
          ))}
        </div>
      )}
    </CcBlock>
  );
}

function StrengthSlider({
  name,
  strength,
}: {
  name: string;
  strength: number;
}) {
  const update = useControlCenterStore((state) => state.update);
  const [value, setValue] = useState(strength);
  useEffect(() => setValue(strength), [strength]);

  return (
    <div className="flex items-center gap-3">
      <Slider
        aria-label={`${name} strength`}
        max={2}
        min={-2}
        onValueChange={([next]) => setValue(next ?? value)}
        onValueCommit={([next]) =>
          update((model) =>
            model.updateLora(name, { strength: next ?? strength })
          )
        }
        step={0.05}
        value={[value]}
      />
      <span className="w-10 text-right text-xs tabular-nums">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function CustomLoraCard({
  entry,
  model,
  onRemove,
}: {
  entry: CatalogEntry;
  model: ControlCenterModel;
  onRemove: (entry: CatalogEntry) => void;
}) {
  const update = useControlCenterStore((state) => state.update);
  const view = useEntryView("lora", entry);
  const lora = model.loraState(entry.name);
  const installed = view.status === "installed";
  const active = lora.auto_apply === true;
  const switchId = useId();
  let label: string | undefined;
  if (installed) {
    label = active ? "Active" : "Pipe";
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        active && installed && "border-primary/60 bg-primary/5"
      )}
    >
      <div className="flex items-start gap-2">
        <Label
          className="min-w-0 flex-1 font-medium text-sm"
          htmlFor={switchId}
        >
          {entry.name}
        </Label>
        <StatusBadge label={label} view={view} />
        {installed ? (
          <Switch
            checked={active}
            id={switchId}
            onCheckedChange={(enabled) =>
              update((next) =>
                next.updateLora(entry.name, { auto_apply: enabled })
              )
            }
          />
        ) : null}
        <Button
          aria-label={`Remove ${entry.name}`}
          onClick={() => onRemove(entry)}
          size="icon-xs"
          title="Remove custom LoRA from list"
          variant="ghost"
        >
          <X />
        </Button>
      </div>
      <LoraDetails entry={entry} />
      <DownloadBar view={view} />
      {installed && active ? (
        <StrengthSlider name={entry.name} strength={lora.strength ?? 1} />
      ) : (
        <EntryAction category="lora" entry={entry} size="xs" view={view} />
      )}
    </div>
  );
}

function AddCustomLoraDialog({
  familyLabel,
  files,
  kind,
  onOpenChange,
}: {
  familyLabel: string;
  files: LoraFile[];
  kind: ModelKind;
  onOpenChange: (open: boolean) => void;
}) {
  const repoId = useControlCenterStore((state) => state.repoId);
  const loadCatalog = useControlCenterStore((state) => state.loadCatalog);
  const [path, setPath] = useState(files[0]?.path ?? "");
  const [saving, setSaving] = useState(false);
  const selectId = useId();

  const add = async () => {
    if (!path) {
      return;
    }
    setSaving(true);
    try {
      await addCustomLora(studioHttp(), { kind, path, repoId });
      onOpenChange(false);
      await loadCatalog({ force: true });
    } catch (error) {
      toast.error("Could not add the LoRA", { description: message(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom LoRA</DialogTitle>
          <DialogDescription>
            Choose an installed LoRA for {familyLabel}. It is saved into a
            separate VNCCS JSON file and stays available between sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={selectId}>LoRA file</Label>
          <Select onValueChange={setPath} value={path}>
            <SelectTrigger className="w-full" id={selectId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {files.map((file) => (
                <SelectItem key={file.path} value={file.path}>
                  {file.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={saving || !path} onClick={add}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {saving ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveCustomLoraDialog({
  entry,
  onClose,
}: {
  entry: CatalogEntry;
  onClose: () => void;
}) {
  const repoId = useControlCenterStore((state) => state.repoId);
  const loadCatalog = useControlCenterStore((state) => state.loadCatalog);
  const update = useControlCenterStore((state) => state.update);
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    try {
      await deleteCustomLora(studioHttp(), {
        localPath: entry.local_path,
        name: entry.name,
        repoId,
      });
      update((model) => model.removeLora(entry.name));
      onClose();
      await loadCatalog({ force: true });
    } catch (error) {
      toast.error("Could not remove the LoRA", {
        description: message(error),
      });
      setRemoving(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove custom LoRA</DialogTitle>
          <DialogDescription>
            Remove “{entry.name}” from the list? The file stays in the loras
            folder.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={removing} onClick={remove} variant="destructive">
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomLoraBlock({ model }: { model: ControlCenterModel }) {
  const repoId = useControlCenterStore((state) => state.repoId);
  const entries = model.customLoras();
  const active = entries.filter(
    (entry) => model.loraState(entry.name).auto_apply === true
  );
  const available = entries.filter(
    (entry) => model.loraState(entry.name).auto_apply !== true
  );
  const [files, setFiles] = useState<LoraFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [removing, setRemoving] = useState<CatalogEntry | null>(null);

  const openAdd = async () => {
    setLoadingFiles(true);
    try {
      const items = (await fetchLoraFiles(studioHttp(), repoId)).filter(
        (item) => !item.already_added
      );
      if (items.length === 0) {
        toast.info("No new LoRA files available in the ComfyUI loras folder.");
      } else {
        setFiles(items);
      }
    } catch (error) {
      toast.error("Could not list LoRA files", { description: message(error) });
    } finally {
      setLoadingFiles(false);
    }
  };

  const section = (title: string, list: CatalogEntry[]) =>
    list.length > 0 ? (
      <div className="flex flex-col gap-2">
        <h3 className="font-medium text-muted-foreground text-xs">
          {title} ({list.length})
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((entry) => (
            <CustomLoraCard
              entry={entry}
              key={entry.name}
              model={model}
              onRemove={setRemoving}
            />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <CcBlock blockKey="custom_lora" count={entries.length} title="Custom LoRAs">
      <div className="flex flex-col gap-4">
        {section("Active", active)}
        {section("Available", available)}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={loadingFiles} onClick={openAdd} variant="outline">
            {loadingFiles ? <Loader2 className="animate-spin" /> : <Plus />}
            Add Custom LoRA
          </Button>
          <p className="text-muted-foreground text-xs">
            Select any installed LoRA from ComfyUI&apos;s standard loras folder
            and add it as a persistent card.
          </p>
        </div>
      </div>
      {files ? (
        <AddCustomLoraDialog
          familyLabel={model.family().label}
          files={files}
          kind={model.activeKind()}
          onOpenChange={(open) => !open && setFiles(null)}
        />
      ) : null}
      {removing ? (
        <RemoveCustomLoraDialog
          entry={removing}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </CcBlock>
  );
}
