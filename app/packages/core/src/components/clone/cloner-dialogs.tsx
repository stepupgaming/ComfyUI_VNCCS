"use client";

import type { QwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import {
  chooseDescribe,
  closeDescribePrompt,
  createNewCharacter,
  deleteCurrentCharacter,
} from "@workspace/core/lib/cloner-actions";
import { useClonerStore } from "@workspace/core/stores/cloner-store";
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
import { cn } from "@workspace/ui/lib/utils";
import {
  type PresetGroup,
  type PresetItem,
  presetSelection,
} from "@workspace/vnccs/character-presets";
import { CHARACTER_NAME_PATTERN } from "@workspace/vnccs/creator";
import { Loader2, TriangleAlert } from "lucide-react";
import { useState } from "react";

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

/** NEW: the server seeds the character with its legacy defaults. */
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
      setError(`Create Failed: ${errorText(reason)}`);
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
            Are you sure you want to delete{" "}
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
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveImageDialog({
  onClose,
  onRemove,
}: {
  onClose: () => void;
  onRemove: () => void;
}) {
  return (
    <Dialog onOpenChange={closeOnDismiss(onClose)} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Image</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove this image?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            onClick={() => {
              onRemove();
              onClose();
            }}
            variant="destructive"
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The tag constructor: chips from the legacy tag catalog; Apply writes the joined selection back. */
export function TagDialog({
  groups,
  label,
  onApply,
  onClose,
  value,
}: {
  groups: PresetGroup[];
  label: string;
  onApply: (value: string) => void;
  onClose: () => void;
  value: string;
}) {
  const [selection] = useState(() => presetSelection(value, groups));
  const [, setVersion] = useState(0);

  const toggle = (item: PresetItem) => {
    selection.toggle(item);
    setVersion((version) => version + 1);
  };

  return (
    <Dialog onOpenChange={closeOnDismiss(onClose)} open={true}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tag Constructor: {label}</DialogTitle>
          <DialogDescription>
            Choose the tags you need. Custom text stays in the field.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
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

/** "Describe Your Character", offered after each upload. */
export function DescribeDialog({ gate }: { gate: QwenModelGate }) {
  const describe = useClonerStore((store) => store.describe);
  if (!describe) {
    return null;
  }
  return (
    <Dialog
      key={describe.id}
      onOpenChange={closeOnDismiss(closeDescribePrompt)}
      open={true}
    >
      <DialogContent
        className="max-h-[calc(100vh-2rem)] overflow-y-auto"
        // Enter Manually focuses the Face editor; returning focus would steal it.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Describe Your Character</DialogTitle>
          <DialogDescription>
            Use the existing image wizard to analyze the selected source image
            and fill in character tags automatically, then review the results.
            If you choose manual entry, you must describe the character in the
            attribute fields yourself.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="flex flex-col gap-1">
            <strong className="text-amber-600 dark:text-amber-400">
              Face and eye descriptions are essential for consistent emotions.
            </strong>
            <p className="text-muted-foreground">
              Missing or inaccurate face and eye descriptions can cause
              inconsistent facial features and eyes when generating emotions
              later. Enter these details accurately, even after automatic
              analysis.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => chooseDescribe("manual", gate)}
            variant="outline"
          >
            Enter Manually
          </Button>
          <Button onClick={() => chooseDescribe("analyze", gate)}>
            Analyze Tags
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
