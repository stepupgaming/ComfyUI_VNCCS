"use client";

import { ClothesWizardDialog } from "@workspace/core/components/clothes/clothes-dialogs";
import {
  CLONE_DESCRIPTION,
  CLOTHES_HELP,
} from "@workspace/core/components/clothes/clothes-help";
import {
  AssetCardFrame,
  AssetCardHead,
  AssetDescription,
} from "@workspace/core/components/common/asset-card";
import {
  NumberField,
  SegmentedField,
  SliderField,
} from "@workspace/core/components/common/form-fields";
import type { QwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import { RemoteImage } from "@workspace/core/components/common/remote-image";
import { useClothesUi } from "@workspace/core/hooks/use-clothes";
import { clothesSession } from "@workspace/core/lib/clothes-actions";
import { studioHttp } from "@workspace/core/lib/studio";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import type { CostumeTicket } from "@workspace/vnccs/clothes";
import {
  CLOTHES_BACKGROUNDS,
  type ClothesModel,
  type ClothesTab,
  COSTUME_FIELD_PLACEHOLDERS,
  COSTUME_FIELDS,
  type CostumeField,
} from "@workspace/vnccs/clothes-state";
import {
  RESOLUTION_SCALE,
  resolutionScaleMegapixels,
  resolutionScaleValue,
} from "@workspace/vnccs/resolution";
import { viewUrl } from "@workspace/vnccs/uploads";
import { Dices, ImageIcon, Loader2, Upload, WandSparkles } from "lucide-react";
import { useId, useRef, useState } from "react";

const FIELD_LABELS: Record<CostumeField, string> = {
  top: "Top",
  bottom: "Bottom",
  shoes: "Shoes",
  head: "Head",
  face: "Face",
};

function parseSeed(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? null : value;
}

function ClothesCoreCard({ model }: { model: ClothesModel }) {
  const card = model.clothesCoreCard();
  const state = card.installed ? "installed" : "missing";
  return (
    <div className="flex flex-col gap-1.5" title={CLOTHES_HELP.lora_name}>
      <span className="font-medium text-sm">VNCCS Clothes Core</span>
      <AssetCardFrame state={state}>
        <AssetCardHead disabled={true} name={card.name} state={state}>
          <Badge variant={card.installed ? "secondary" : "outline"}>
            {card.installed ? "Core" : "Missing"}
          </Badge>
        </AssetCardHead>
        <AssetDescription text={card.description} />
      </AssetCardFrame>
    </div>
  );
}

function SeedField({ model }: { model: ClothesModel }) {
  const session = clothesSession();
  const random = model.settings.seed_mode === "randomize";
  return (
    <div className="flex items-end gap-2">
      <NumberField
        className="flex-1"
        help={CLOTHES_HELP.seed}
        label="Seed"
        onCommit={(seed) => session.update((next) => next.setSeed(seed))}
        parse={parseSeed}
        step={1}
        value={Number(model.settings.seed) || 0}
      />
      <Button
        aria-label="Randomize seed for each preview"
        aria-pressed={random}
        className={cn(random && "border-primary text-primary")}
        onClick={() => session.update((next) => next.toggleSeedMode())}
        size="icon"
        title={`${random ? "Random seed on queue" : "Fixed seed"}. ${CLOTHES_HELP.seed_mode}`}
        variant="outline"
      >
        <Dices />
      </Button>
    </div>
  );
}

/** The widget's resolution slider: the label says when the size follows the model. */
function ResolutionField({ model }: { model: ClothesModel }) {
  const resolution = model.resolution();
  return (
    <SliderField
      format={() => resolution.label}
      help={CLOTHES_HELP.target_size}
      label="Resolution scale"
      max={RESOLUTION_SCALE.maxMp}
      min={RESOLUTION_SCALE.minMp}
      onChange={(megapixels) =>
        clothesSession().update((next) =>
          next.setTargetSize(resolutionScaleValue(megapixels))
        )
      }
      step={RESOLUTION_SCALE.stepMp}
      value={Number(resolutionScaleMegapixels(resolution.size).toFixed(1))}
    />
  );
}

/** Typing updates the widget state; leaving a changed field saves the costume. */
function CostumeFieldInput({
  disabled,
  field,
  value,
}: {
  disabled: boolean;
  field: CostumeField;
  value: string;
}) {
  const id = useId();
  const dirty = useRef(false);
  const session = clothesSession();
  return (
    <div className="flex flex-col gap-1.5" title={CLOTHES_HELP[field]}>
      <Label htmlFor={id}>{FIELD_LABELS[field]}</Label>
      <Textarea
        className="min-h-9 resize-none"
        disabled={disabled}
        id={id}
        onBlur={() => {
          if (dirty.current) {
            dirty.current = false;
            session.commitCostumeFields();
          }
        }}
        onChange={(event) => {
          dirty.current = true;
          session.update((next) =>
            next.setCostumeField(field, event.target.value)
          );
        }}
        placeholder={COSTUME_FIELD_PLACEHOLDERS[field]}
        rows={1}
        value={value}
      />
    </div>
  );
}

function GeneratePanel({
  disabled,
  model,
  onWizard,
}: {
  disabled: boolean;
  model: ClothesModel;
  onWizard: () => void;
}) {
  const editable = model.editable() && !disabled;
  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={!editable}
        onClick={onWizard}
        title="Expand a broad outfit idea into the fields with the local Qwen3.5 model"
      >
        <WandSparkles />
        Clothes Wizzard
      </Button>
      {COSTUME_FIELDS.map((field) => (
        <CostumeFieldInput
          disabled={!editable}
          field={field}
          key={field}
          value={String(model.state.costume_info[field] ?? "")}
        />
      ))}
    </div>
  );
}

function ClonePanel({ model }: { model: ClothesModel }) {
  const ui = useClothesUi();
  const fileInput = useRef<HTMLInputElement>(null);
  const image = model.state.clone_image;
  const url = image ? viewUrl(studioHttp(), image) : null;
  let label = "Upload image";
  if (ui.uploading) {
    label = "Uploading…";
  } else if (image) {
    label = "Replace image";
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">{CLONE_DESCRIPTION}</p>
      <div className="relative flex h-64 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
        {url ? (
          <RemoteImage
            className="size-full object-contain"
            src={url}
            title={image?.name}
          />
        ) : (
          <ImageIcon className="size-10 text-muted-foreground" />
        )}
        <div
          className={cn(
            "absolute inset-0 flex p-3",
            url ? "items-end justify-center" : "items-center justify-center"
          )}
        >
          <Button
            disabled={ui.uploading}
            onClick={() => fileInput.current?.click()}
            size={url ? "sm" : "default"}
            variant={url ? "secondary" : "default"}
          >
            {ui.uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {label}
          </Button>
        </div>
      </div>
      <input
        accept="image/*"
        aria-label="Clothing reference image"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            clothesSession().uploadClone(file);
          }
        }}
        ref={fileInput}
        type="file"
      />
    </div>
  );
}

/** Background, Clothes Core, seed and resolution, then the Generate/Clone tabs: the widget's middle column. */
export function CostumeColumn({
  gate,
  model,
}: {
  gate: QwenModelGate;
  model: ClothesModel;
}) {
  const ui = useClothesUi();
  const [wizard, setWizard] = useState<CostumeTicket | null>(null);
  const session = clothesSession();
  const tab = model.state.activeTab === "clone" ? "clone" : "generate";

  const openWizard = () => {
    const ticket = session.openWizard();
    if (ticket) {
      setWizard(ticket);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SegmentedField
          help={CLOTHES_HELP.background_color}
          label="Background"
          onChange={(value) =>
            session.update((next) => next.setBackground(value))
          }
          options={CLOTHES_BACKGROUNDS}
          value={String(model.settings.background_color)}
        />
        <SeedField model={model} />
      </div>
      <ClothesCoreCard model={model} />
      <ResolutionField model={model} />
      <Tabs
        onValueChange={(value) =>
          session.update((next) => next.setActiveTab(value as ClothesTab))
        }
        value={tab}
      >
        <TabsList className="w-full">
          <TabsTrigger value="generate">Generate clothes</TabsTrigger>
          <TabsTrigger value="clone">Clone clothes</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "generate" ? (
        <GeneratePanel
          disabled={ui.loadingCostume || ui.deleting}
          model={model}
          onWizard={openWizard}
        />
      ) : (
        <ClonePanel model={model} />
      )}
      {wizard ? (
        <ClothesWizardDialog
          gate={gate}
          onClose={() => setWizard(null)}
          ticket={wizard}
        />
      ) : null}
    </div>
  );
}
