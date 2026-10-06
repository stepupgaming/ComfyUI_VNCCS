"use client";

import { RemoteImage } from "@workspace/core/components/common/remote-image";
import {
  DeleteCharacterDialog,
  NewCharacterDialog,
} from "@workspace/core/components/create/creator-dialogs";
import {
  generateCreatorPreview,
  loadCharacter,
  stepSprite,
} from "@workspace/core/lib/creator-actions";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useCreatorStore } from "@workspace/core/stores/creator-store";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { normalizeSpriteIndex } from "@workspace/vnccs/creator";
import type { CreatorModel } from "@workspace/vnccs/creator-state";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { useState } from "react";

function PreviewFrame({ model }: { model: CreatorModel }) {
  const preview = useCreatorStore((store) => store.preview);
  const count = Number(model.state.sprite_preview_count || 0);
  const showNav = model.state.preview_source === "pose" && count > 1;
  const index =
    normalizeSpriteIndex(Number(model.state.sprite_preview_index || 0), count) +
    1;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-lg border bg-[length:24px_24px] bg-[repeating-conic-gradient(#80808018_0%_25%,transparent_0%_50%)]">
        {preview.url ? (
          <RemoteImage className="size-full object-contain" src={preview.url} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
            <UserRound className="size-10" />
            {preview.message || "No Preview"}
          </div>
        )}
        {preview.loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>
      {showNav ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            aria-label="Previous sprite"
            disabled={preview.loading}
            onClick={() => stepSprite(-1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {index}/{count}
          </span>
          <Button
            aria-label="Next sprite"
            disabled={preview.loading}
            onClick={() => stepSprite(1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Character select, the preview and its actions: the widget's left column. */
export function CharacterColumn({ model }: { model: CreatorModel }) {
  const characters = useCreatorStore((store) => store.lists?.characters ?? []);
  const previewRunning = useCreatorStore((store) => store.previewRunning);
  const workflowBusy = useConnectionStore(
    (store) => store.queue.pending + store.queue.running > 0
  );
  const [dialog, setDialog] = useState<"new" | "delete" | null>(null);
  const character = model.state.character;

  let generateLabel = "Generate preview";
  if (previewRunning) {
    generateLabel = "Generating…";
  } else if (workflowBusy) {
    generateLabel = "Workflow busy…";
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Character</h3>
      <Select
        disabled={characters.length === 0}
        onValueChange={(name) => loadCharacter(name)}
        value={character || ""}
      >
        <SelectTrigger aria-label="Character" className="w-full">
          <SelectValue placeholder="No characters yet" />
        </SelectTrigger>
        <SelectContent>
          {characters.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={previewRunning || workflowBusy}
          onClick={() => generateCreatorPreview()}
          title={
            workflowBusy
              ? "Preview is unavailable while a workflow is queued or running."
              : undefined
          }
        >
          {previewRunning ? <Loader2 className="animate-spin" /> : null}
          {generateLabel}
        </Button>
        <Button
          aria-label="New character"
          onClick={() => setDialog("new")}
          size="icon"
          title="New character"
          variant="outline"
        >
          <Plus />
        </Button>
        <Button
          aria-label="Delete character"
          disabled={!character}
          onClick={() => setDialog("delete")}
          size="icon"
          title="Delete character"
          variant="outline"
        >
          <Trash2 />
        </Button>
      </div>
      <PreviewFrame model={model} />
      {dialog === "new" ? (
        <NewCharacterDialog onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "delete" && character ? (
        <DeleteCharacterDialog
          name={character}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
