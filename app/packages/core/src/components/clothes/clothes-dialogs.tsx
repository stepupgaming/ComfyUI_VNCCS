"use client";

import { WIZARD_DESCRIPTION } from "@workspace/core/components/clothes/clothes-help";
import type { QwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import {
  clothesSession,
  confirmCostumeDelete,
  fillCostumeFields,
  type WizardPhase,
} from "@workspace/core/lib/clothes-actions";
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
import { Textarea } from "@workspace/ui/components/textarea";
import type { CostumeTicket } from "@workspace/vnccs/clothes";
import { deleteCostumePrompt } from "@workspace/vnccs/clothes-state";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";

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

/** NEW: an empty costume, selected once saved. */
export function NewCostumeDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const create = async () => {
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await clothesSession().createCostume(trimmed);
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
          <DialogTitle>New costume</DialogTitle>
          <DialogDescription>
            The costume is saved for the selected character and selected for
            editing.
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
            aria-invalid={error !== null}
            aria-label="Costume name"
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
          <Button disabled={!trimmed || busy} onClick={create}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** DELETE, bound to the costume it was opened for. */
export function DeleteCostumeDialog({
  onClose,
  ticket,
}: {
  onClose: () => void;
  ticket: CostumeTicket;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await confirmCostumeDelete(ticket);
      if (result.status === "busy") {
        setBusy(false);
        return;
      }
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
          <DialogTitle>Delete costume</DialogTitle>
          <DialogDescription>
            {deleteCostumePrompt(ticket.character, ticket.costume)}
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
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

const PHASE_LABELS: Record<WizardPhase, string> = {
  checking: "Checking model…",
  thinking: "Thinking…",
};

/** CLOTHES WIZZARD: expand a broad outfit idea into the costume fields. */
export function ClothesWizardDialog({
  gate,
  onClose,
  ticket,
}: {
  gate: QwenModelGate;
  onClose: () => void;
  ticket: CostumeTicket;
}) {
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<WizardPhase | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const trimmed = description.trim();

  const close = () => {
    clothesSession().cancelWizard();
    onClose();
  };

  const fill = async () => {
    if (phase) {
      return;
    }
    if (!trimmed) {
      input.current?.focus();
      return;
    }
    try {
      if (await fillCostumeFields(ticket, trimmed, gate, setPhase)) {
        onClose();
      }
    } finally {
      setPhase(null);
    }
  };

  return (
    <Dialog onOpenChange={closeOnDismiss(close)} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clothes Wizzard</DialogTitle>
          <DialogDescription>{WIZARD_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Outfit description"
          autoFocus={true}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              fill();
            }
          }}
          placeholder="e.g. Santa Claus costume"
          ref={input}
          rows={4}
          value={description}
        />
        <DialogFooter>
          <Button onClick={close} variant="outline">
            Cancel
          </Button>
          <Button disabled={phase !== null} onClick={fill}>
            {phase ? <Loader2 className="animate-spin" /> : null}
            {phase ? PHASE_LABELS[phase] : "Fill fields"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
