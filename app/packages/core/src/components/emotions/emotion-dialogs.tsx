"use client";

import { RemoteImage } from "@workspace/core/components/common/remote-image";
import { saveCustomEmotion } from "@workspace/core/lib/emotion-actions";
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
import { Textarea } from "@workspace/ui/components/textarea";
import { ImagePlus, Loader2 } from "lucide-react";
import { useId, useState } from "react";

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

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Add Custom Emotion: the server stores it under "Custom" in emotions.json. */
export function CustomEmotionDialog({ onClose }: { onClose: () => void }) {
  const ids = {
    description: useId(),
    image: useId(),
    name: useId(),
    prompt: useId(),
  };
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [naturalPrompt, setNaturalPrompt] = useState("");
  const [imageData, setImageData] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pickImage = async (file: File | undefined) => {
    if (!file) {
      setImageData("");
      return;
    }
    try {
      setImageData(await readDataUrl(file));
    } catch (reason) {
      setError(errorText(reason));
    }
  };

  const save = async () => {
    if (busy) {
      return;
    }
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await saveCustomEmotion({ name, description, naturalPrompt, imageData });
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
          <DialogTitle>Add Custom Emotion</DialogTitle>
          <DialogDescription>
            Saved to the emotion list and selected.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.name}>Name</Label>
            <Input
              aria-invalid={error === "Name is required."}
              autoFocus={true}
              id={ids.name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Emotion name"
              value={name}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.description}>Tags / Description</Label>
            <Textarea
              id={ids.description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="angry, furrowed_brow, open_mouth"
              rows={2}
              value={description}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.prompt}>Natural Prompt</Label>
            <Textarea
              id={ids.prompt}
              onChange={(event) => setNaturalPrompt(event.target.value)}
              placeholder="The character looks..."
              rows={2}
              value={naturalPrompt}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.image}>Image</Label>
            <div className="flex items-center gap-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground">
                {imageData ? (
                  <RemoteImage
                    className="size-full object-cover"
                    src={imageData}
                  />
                ) : (
                  <ImagePlus className="size-5" />
                )}
              </div>
              <Input
                accept="image/*"
                id={ids.image}
                onChange={(event) => pickImage(event.target.files?.[0])}
                type="file"
              />
            </div>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The widget's confirm modal before selecting every visible emotion. */
export function SelectVisibleDialog({
  message,
  onClose,
  onConfirm,
}: {
  message: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog onOpenChange={closeOnDismiss(onClose)} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select visible emotions</DialogTitle>
          <DialogDescription className="whitespace-pre-wrap">
            {message}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            autoFocus={true}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Proceed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
