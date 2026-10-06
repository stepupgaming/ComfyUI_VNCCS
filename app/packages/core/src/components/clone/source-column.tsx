"use client";

import {
  DeleteCharacterDialog,
  NewCharacterDialog,
  RemoveImageDialog,
} from "@workspace/core/components/clone/cloner-dialogs";
import { RemoteImage } from "@workspace/core/components/common/remote-image";
import { SpritePreviewFrame } from "@workspace/core/components/common/sprite-preview-frame";
import { useClonerUpdate } from "@workspace/core/hooks/use-cloner";
import {
  loadCharacter,
  removeSource,
  stepSprite,
  uploadSource,
} from "@workspace/core/lib/cloner-actions";
import { studioHttp } from "@workspace/core/lib/studio";
import { useClonerStore } from "@workspace/core/stores/cloner-store";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import type { ClonerModel } from "@workspace/vnccs/cloner-state";
import { imageRef, viewUrl } from "@workspace/vnccs/uploads";
import { Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";

type ColumnDialog =
  | { kind: "new" }
  | { kind: "delete" }
  | { index: number; kind: "remove" };

function Thumbnails({
  model,
  onRemove,
}: {
  model: ClonerModel;
  onRemove: (index: number) => void;
}) {
  const update = useClonerUpdate();
  const http = studioHttp();
  const images = model.state.source_images;
  if (images.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image, index) => {
        const ref = imageRef(image);
        if (!ref) {
          return null;
        }
        const selected = index === model.state.selected_idx;
        return (
          <div
            className={cn(
              "relative rounded-md border-2 border-transparent",
              selected && "border-primary"
            )}
            key={`${ref.type}/${ref.subfolder}/${ref.name}`}
          >
            <button
              aria-label={`Select ${ref.name}`}
              aria-pressed={selected}
              className="block"
              onClick={() => update((next) => next.selectSource(index))}
              type="button"
            >
              <RemoteImage
                className="size-16 rounded object-cover"
                src={viewUrl(http, ref)}
              />
            </button>
            <Button
              aria-label="Remove image"
              className="absolute -top-2 -right-2 size-6 rounded-full"
              onClick={() => onRemove(index)}
              size="icon-xs"
              title="Remove image"
              variant="destructive"
            >
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** Character select, NEW/DEL and the reference image: the widget's left column. */
export function SourceColumn({ model }: { model: ClonerModel }) {
  const characters = useClonerStore((store) => store.characters);
  const preview = useClonerStore((store) => store.preview);
  const uploading = useClonerStore((store) => store.uploading);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<ColumnDialog | null>(null);
  const character = model.state.character;
  const source = model.selectedSource();
  const sourceUrl = source ? viewUrl(studioHttp(), source) : undefined;
  const empty = !(sourceUrl || preview.url);

  const pick = () => fileInput.current?.click();
  const uploadLabel = source ? "Replace image" : "Upload image";

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Character</h3>
      <Select
        disabled={characters.length === 0}
        onValueChange={(name) => loadCharacter(name, { clearSources: true })}
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
          onClick={() => setDialog({ kind: "new" })}
          variant="outline"
        >
          <Plus />
          New
        </Button>
        <Button
          className="flex-1"
          disabled={!character}
          onClick={() => setDialog({ kind: "delete" })}
          variant="outline"
        >
          <Trash2 />
          Delete
        </Button>
      </div>
      <h3 className="mt-2 font-medium text-sm">Source Image</h3>
      <Thumbnails
        model={model}
        onRemove={(index) => setDialog({ index, kind: "remove" })}
      />
      <SpritePreviewFrame
        emptyLabel="Source Preview"
        onStep={stepSprite}
        state={preview}
        url={sourceUrl}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 flex p-3 [&>*]:pointer-events-auto",
            empty ? "items-center justify-center" : "items-end justify-end"
          )}
        >
          <Button
            disabled={uploading}
            onClick={pick}
            size={empty ? "default" : "sm"}
            variant={empty ? "default" : "secondary"}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {uploading ? "Uploading…" : uploadLabel}
          </Button>
        </div>
      </SpritePreviewFrame>
      <input
        accept="image/*"
        aria-label="Source image file"
        className="hidden"
        multiple={false}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          uploadSource(files);
        }}
        ref={fileInput}
        type="file"
      />
      {dialog?.kind === "new" ? (
        <NewCharacterDialog onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "delete" && character ? (
        <DeleteCharacterDialog
          name={character}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "remove" ? (
        <RemoveImageDialog
          onClose={() => setDialog(null)}
          onRemove={() => removeSource(dialog.index)}
        />
      ) : null}
    </div>
  );
}
