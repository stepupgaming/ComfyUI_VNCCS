"use client";

import {
  createNewCharacter,
  deleteCurrentCharacter,
  runWizard,
} from "@workspace/core/lib/creator-actions";
import { studioHttp } from "@workspace/core/lib/studio";
import { useCreatorStore } from "@workspace/core/stores/creator-store";
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
import { Progress } from "@workspace/ui/components/progress";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import {
  type PresetItem,
  presetGroups,
  presetSelection,
  type TraitField,
} from "@workspace/vnccs/character-presets";
import {
  CHARACTER_NAME_PATTERN,
  fetchWizardDownloadStatus,
  fetchWizardModelStatus,
  startWizardModelDownload,
} from "@workspace/vnccs/creator";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function closeOnDismiss(onClose: () => void) {
  return (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
}

export function NewCharacterDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const valid = CHARACTER_NAME_PATTERN.test(trimmed);

  const create = async () => {
    if (!valid || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (await createNewCharacter(trimmed)) {
        onClose();
      }
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={closeOnDismiss(onClose)} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New character</DialogTitle>
          <DialogDescription>
            Letters, numbers, spaces, dashes and underscores.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <Input
            aria-invalid={trimmed !== "" && !valid}
            aria-label="Character name"
            autoFocus={true}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name..."
            value={name}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={!valid || busy} onClick={create}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCharacterDialog({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteCurrentCharacter();
      onClose();
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={closeOnDismiss(onClose)} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete character</DialogTitle>
          <DialogDescription>
            Permanently delete{" "}
            <strong className="text-foreground">{name}</strong>? This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={busy} onClick={remove} variant="destructive">
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? "Deleting…" : "Confirm delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type WizardPhase =
  | { kind: "describe" }
  | { kind: "checking" }
  | { kind: "confirm-download"; message: string }
  | { kind: "downloading"; file: string; progress: number }
  | { kind: "thinking" };

const WIZARD_POLL_MS = 700;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** CHARACTER WIZZARD: expand a broad description into the trait fields with the local Qwen3.5 model. */
export function WizardDialog({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<WizardPhase>({ kind: "describe" });
  const [error, setError] = useState<string | null>(null);
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  const fill = async () => {
    setPhase({ kind: "thinking" });
    try {
      if (await runWizard(description.trim())) {
        onClose();
        return;
      }
    } catch (reason) {
      setError(errorText(reason));
    }
    if (open.current) {
      setPhase({ kind: "describe" });
    }
  };

  const download = async () => {
    setPhase({ kind: "downloading", file: "", progress: 0 });
    try {
      const http = studioHttp();
      await startWizardModelDownload(http);
      while (open.current) {
        const status = await fetchWizardDownloadStatus(http);
        if (status.status === "completed") {
          await fill();
          return;
        }
        if (status.status === "error") {
          throw new Error(status.error || "QwenVL download failed.");
        }
        setPhase({
          kind: "downloading",
          file: status.current_file ?? "",
          progress: Math.max(0, Math.min(100, Number(status.progress) || 0)),
        });
        await delay(WIZARD_POLL_MS);
      }
    } catch (reason) {
      if (open.current) {
        setError(errorText(reason));
        setPhase({ kind: "describe" });
      }
    }
  };

  const start = async () => {
    if (!description.trim()) {
      return;
    }
    setError(null);
    setPhase({ kind: "checking" });
    try {
      const status = await fetchWizardModelStatus(studioHttp());
      if (!open.current) {
        return;
      }
      if (status.ready) {
        await fill();
      } else {
        setPhase({
          kind: "confirm-download",
          message: `${status.message || status.model_name || "The Qwen3.5 model is not installed."} Download the required files from Hugging Face now?`,
        });
      }
    } catch (reason) {
      setError(errorText(reason));
      setPhase({ kind: "describe" });
    }
  };

  let body = (
    <Textarea
      autoFocus={true}
      onChange={(event) => setDescription(event.target.value)}
      placeholder="e.g. adult demon girl with long white hair, red eyes, elegant sharp face"
      rows={5}
      value={description}
    />
  );
  let footer = (
    <>
      <Button onClick={onClose} variant="outline">
        Cancel
      </Button>
      <Button
        disabled={!description.trim() || phase.kind !== "describe"}
        onClick={start}
      >
        {phase.kind === "checking" || phase.kind === "thinking" ? (
          <Loader2 className="animate-spin" />
        ) : null}
        {phase.kind === "checking" ? "Checking model…" : null}
        {phase.kind === "thinking" ? "Thinking…" : null}
        {phase.kind === "describe" ? "Fill fields" : null}
      </Button>
    </>
  );
  if (phase.kind === "confirm-download") {
    body = <p>{phase.message}</p>;
    footer = (
      <>
        <Button
          onClick={() => setPhase({ kind: "describe" })}
          variant="outline"
        >
          Cancel
        </Button>
        <Button onClick={download}>Download & install</Button>
      </>
    );
  } else if (phase.kind === "downloading") {
    body = (
      <div className="flex flex-col gap-2">
        <p>
          {phase.file ? `Downloading ${phase.file}…` : "Preparing model files…"}
        </p>
        <Progress value={phase.progress} />
        <p className="text-muted-foreground text-xs tabular-nums">
          {phase.progress}%
        </p>
      </div>
    );
    footer = (
      <Button onClick={onClose} variant="outline">
        Close
      </Button>
    );
  }

  return (
    <Dialog onOpenChange={closeOnDismiss(onClose)} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Character Wizzard</DialogTitle>
          <DialogDescription>
            Describe the character in a broad way. The model will expand it into
            the creator fields and prefer tags from the tag constructor.
          </DialogDescription>
        </DialogHeader>
        {body}
        {error ? (
          <p className="whitespace-pre-wrap text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const RACE_HINT =
  "Choose a species to see its features. These descriptions are added automatically to the prompt. Combine species for hybrids; custom traits take priority.";
const TRAIT_HINT =
  "Choose the traits you need. Custom text remains editable in the character field.";

/** The preset chips for one trait field; Apply writes the joined selection back. */
export function PresetDialog({
  field,
  label,
  onApply,
  onClose,
  value,
}: {
  field: TraitField;
  label: string;
  onApply: (value: string) => void;
  onClose: () => void;
  value: string;
}) {
  const presets = useCreatorStore((store) => store.presets);
  const groups = useMemo(() => presetGroups(presets, field), [presets, field]);
  const [selection] = useState(() => presetSelection(value, groups));
  const [, setVersion] = useState(0);
  const [hint, setHint] = useState(field === "race" ? RACE_HINT : TRAIT_HINT);

  const toggle = (item: PresetItem) => {
    selection.toggle(item);
    setVersion((version) => version + 1);
    if (item.prompt) {
      setHint(item.prompt);
    }
  };

  return (
    <Dialog onOpenChange={closeOnDismiss(onClose)} open={true}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose presets: {label}</DialogTitle>
          <DialogDescription aria-live="polite">{hint}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
          {groups.length === 0 ? (
            <p className="text-muted-foreground">
              No presets found for this category.
            </p>
          ) : null}
          {groups.map((group) => (
            <div className="flex flex-col gap-2" key={group.header}>
              <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {group.header}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => {
                  const active = selection.has(item);
                  return (
                    <button
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                        active &&
                          "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                      )}
                      key={item.tag}
                      onClick={() => toggle(item)}
                      onFocus={() => item.prompt && setHint(item.prompt)}
                      title={item.prompt}
                      type="button"
                    >
                      {item.label || item.tag}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply(selection.value());
              onClose();
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
