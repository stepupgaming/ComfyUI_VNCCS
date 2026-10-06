"use client";

import {
  DeleteCostumeDialog,
  NewCostumeDialog,
} from "@workspace/core/components/clothes/clothes-dialogs";
import { CLOTHES_HELP } from "@workspace/core/components/clothes/clothes-help";
import { SpritePreviewFrame } from "@workspace/core/components/common/sprite-preview-frame";
import { useClothesUi } from "@workspace/core/hooks/use-clothes";
import { clothesSession } from "@workspace/core/lib/clothes-actions";
import { useClothesStore } from "@workspace/core/stores/clothes-store";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import type { CostumeTicket } from "@workspace/vnccs/clothes";
import type { ClothesModel } from "@workspace/vnccs/clothes-state";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useId, useState } from "react";

type ColumnDialog = { kind: "new" } | { kind: "delete"; ticket: CostumeTicket };

function NameSelect({
  disabled,
  help,
  label,
  names,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  help: string;
  label: string;
  names: readonly string[];
  onChange: (name: string) => void;
  placeholder: string;
  value: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5" title={help}>
      <Label htmlFor={id}>{label}</Label>
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full min-w-0" id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {names.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Character and costume selects, NEW/DELETE, GENERATE PREVIEW and the preview: the widget's Design Studio column. */
export function DesignColumn({ model }: { model: ClothesModel }) {
  const ui = useClothesUi();
  const sprite = useClothesStore((store) => store.sprite);
  const [dialog, setDialog] = useState<ColumnDialog | null>(null);
  const session = clothesSession();
  const { character, costume } = model.state;
  const busy = ui.deleting || ui.previewRunning;
  const costumeValue = ui.costumes.includes(costume) ? costume : "";

  const openDelete = () => {
    const ticket = session.openDelete();
    if (ticket) {
      setDialog({ kind: "delete", ticket });
    }
  };

  let generateLabel = "Generate preview";
  if (ui.previewRunning) {
    generateLabel = "Generating…";
  } else if (ui.previewGenerated) {
    generateLabel = "Generate preview / Save";
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Design Studio</h3>
      <NameSelect
        disabled={ui.characters.length === 0 || ui.deleting}
        help={CLOTHES_HELP.character}
        label="Character"
        names={ui.characters}
        onChange={(name) => session.selectCharacter(name)}
        placeholder="No characters yet"
        value={character}
      />
      <NameSelect
        disabled={ui.costumes.length === 0 || ui.loadingCostume || ui.deleting}
        help={CLOTHES_HELP.costume}
        label="Costume (select to edit)"
        names={ui.costumes}
        onChange={(name) => session.selectCostume(name)}
        placeholder={
          ui.loadingCostume ? "Loading costumes…" : "Create a costume to begin"
        }
        value={costumeValue}
      />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!character || ui.deleting}
          onClick={() => setDialog({ kind: "new" })}
          variant="outline"
        >
          <Plus />
          New
        </Button>
        <Button
          className="flex-1"
          disabled={!model.editable() || ui.deleting}
          onClick={openDelete}
          title="Delete the selected costume. Base sprite sets cannot be deleted."
          variant="outline"
        >
          {ui.deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Delete
        </Button>
      </div>
      <Button
        disabled={busy || ui.loadingCostume || !character}
        onClick={() => session.generatePreview()}
        title="Save the costume and render a preview outside the queue"
      >
        {ui.previewRunning ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Sparkles />
        )}
        {generateLabel}
      </Button>
      <SpritePreviewFrame
        onStep={(delta) => session.stepSprite(delta)}
        state={sprite}
        url={ui.generatedImage ?? undefined}
      >
        {ui.previewRunning ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 text-muted-foreground text-sm">
            <Loader2 className="size-8 animate-spin" />
            Generating preview…
          </div>
        ) : null}
      </SpritePreviewFrame>
      {dialog?.kind === "new" ? (
        <NewCostumeDialog onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteCostumeDialog
          onClose={() => setDialog(null)}
          ticket={dialog.ticket}
        />
      ) : null}
    </div>
  );
}
