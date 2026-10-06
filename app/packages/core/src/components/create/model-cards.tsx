"use client";

import {
  AssetCardFrame,
  AssetCardHead,
  AssetDescription,
  assetState,
} from "@workspace/core/components/common/asset-card";
import {
  DownloadBar,
  EntryAction,
  StatusBadge,
  useEntryView,
} from "@workspace/core/components/control-center/entry-status";
import { OVERHAUL_HELP } from "@workspace/core/components/create/creator-help";
import { useDownload } from "@workspace/core/hooks/use-control-center";
import { useCreatorUpdate } from "@workspace/core/hooks/use-creator";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { currentCreatorModel } from "@workspace/core/stores/creator-store";
import { Slider } from "@workspace/ui/components/slider";
import { Switch } from "@workspace/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import type {
  CatalogEntry,
  DownloadCategory,
} from "@workspace/vnccs/control-center";
import {
  type CreatorModel,
  ccKind,
  ccRelPath,
  type GenerationMode,
  normalizeOverhaulStrength,
  QI2_OVERHAUL_TITLE,
} from "@workspace/vnccs/creator-state";
import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";

const OVERHAUL_STEPS = [0, 0.25, 0.5, 0.75, 1];

const EMPTY_MODELS: Record<GenerationMode, string> = {
  anima: "No Anima diffusion models found.",
  illustrious: "No checkpoints found.",
  qi2: "No Qwen Image 2.1 diffusion models found.",
};

/** A catalog or local model as a selectable card, like the widget's `buildAssetCard`. */
function AssetCard({
  accessory,
  category,
  children,
  compact = false,
  entry,
  head = false,
  label,
  onDownload,
  onSelect,
  onToggle,
  open = false,
  selected = false,
}: {
  accessory?: ReactNode;
  category: DownloadCategory;
  children?: ReactNode;
  compact?: boolean;
  entry: CatalogEntry;
  /** The picker head stays clickable even when its model is missing. */
  head?: boolean;
  label?: string;
  onDownload?: () => void;
  onSelect?: () => void;
  onToggle?: (checked: boolean) => void;
  open?: boolean;
  selected?: boolean;
}) {
  const view = useEntryView(category, entry);
  const state = assetState(view.status);
  const installed = state === "installed";
  const name = label || entry.name || ccRelPath(entry) || "Unknown";
  const clickable = Boolean(onSelect) && (installed || head);

  return (
    <AssetCardFrame clickable={clickable} selected={selected} state={state}>
      <AssetCardHead
        disabled={!clickable}
        head={head}
        name={name}
        onSelect={onSelect}
        open={open}
        selected={selected}
        state={state}
      >
        {accessory}
        <StatusBadge className="shrink-0" view={view} />
        {onToggle && installed ? (
          <Switch
            aria-label={`Use ${name}`}
            checked={selected}
            onCheckedChange={onToggle}
          />
        ) : null}
      </AssetCardHead>
      {compact ? null : <AssetDescription text={entry.description} />}
      <DownloadBar view={view} />
      {installed ? null : (
        <div className="flex">
          <EntryAction
            category={category}
            entry={entry}
            onDownload={onDownload}
            size="xs"
            view={view}
          />
        </div>
      )}
      {children}
    </AssetCardFrame>
  );
}

/** Download a family model with the CLIP and VAE the Creator pins for it. */
function useBundleDownload(mode: GenerationMode) {
  const download = useDownload();
  const update = useCreatorUpdate();
  if (mode === "illustrious") {
    return;
  }
  return async (entry: CatalogEntry) => {
    update((next) =>
      mode === "qi2" ? next.ensureQi2DefaultAux() : next.ensureAnimaDefaultAux()
    );
    await download("models", entry);
    const catalog = useControlCenterStore.getState().catalog;
    const model = currentCreatorModel();
    for (const section of ["clip", "vae"] as const) {
      const aux = catalog?.[section].find((item) => ccKind(item) === mode);
      if (aux && model?.resolveStatus(section, aux) !== "installed") {
        await download(section, aux);
      }
    }
  };
}

/** The selected model as a card that opens the VNCCS and user model lists. */
export function ModelPicker({
  mode,
  model,
}: {
  mode: GenerationMode;
  model: CreatorModel;
}) {
  const update = useCreatorUpdate();
  const downloadBundle = useBundleDownload(mode);
  const [open, setOpen] = useState(false);
  const entries = model.modelEntries(mode);
  const head = model.selectedModelEntry(mode);

  if (!head) {
    return (
      <p className="text-muted-foreground text-xs">{EMPTY_MODELS[mode]}</p>
    );
  }

  const current = String(model.settings[model.selectedModelKey(mode)] || "")
    .split("\\")
    .join("/");
  const select = (rel: string) => {
    setOpen(false);
    update((next) => next.selectModel(mode, rel));
  };
  const card = (entry: CatalogEntry) => (
    <AssetCard
      category="models"
      entry={entry}
      key={`${entry.name}:${ccRelPath(entry)}`}
      onDownload={downloadBundle ? () => downloadBundle(entry) : undefined}
      onSelect={() => select(ccRelPath(entry))}
      selected={ccRelPath(entry) === current}
    />
  );
  const groups = [
    {
      title: "VNCCS Models",
      items: entries.filter((entry) => entry.source !== "local"),
    },
    {
      title: "User Models",
      items: entries.filter((entry) => entry.source === "local"),
    },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <AssetCard
        category="models"
        entry={head}
        head
        onDownload={downloadBundle ? () => downloadBundle(head) : undefined}
        onSelect={() => setOpen((value) => !value)}
        open={open}
        selected={ccRelPath(head) === current}
      />
      {open ? (
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-lg border bg-muted/30 p-2">
          {groups.map((group) => (
            <div className="flex flex-col gap-1.5" key={group.title}>
              <span className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {group.title}
              </span>
              {group.items.map(card)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OverhaulCard({
  entry,
  strength,
}: {
  entry: CatalogEntry;
  strength: number;
}) {
  const update = useCreatorUpdate();
  return (
    <AssetCard
      accessory={
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={`About ${QI2_OVERHAUL_TITLE}`}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              type="button"
            >
              <Info className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{OVERHAUL_HELP}</TooltipContent>
        </Tooltip>
      }
      category="lora"
      compact
      entry={entry}
      label={QI2_OVERHAUL_TITLE}
      selected={strength > 0}
    >
      <div className="flex flex-col gap-1.5 px-1">
        <Slider
          aria-label={`${QI2_OVERHAUL_TITLE} strength`}
          aria-valuetext={strength === 0 ? "0 — Off" : String(strength)}
          max={1}
          min={0}
          onValueChange={([next]) => {
            const value = normalizeOverhaulStrength(next);
            if (value !== strength) {
              update((creator) => creator.setOverhaulStrength(value));
            }
          }}
          step={0.25}
          value={[strength]}
        />
        <div
          aria-hidden="true"
          className="flex justify-between text-muted-foreground text-xs tabular-nums"
        >
          {OVERHAUL_STEPS.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </div>
    </AssetCard>
  );
}

function CardGroup({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-sm">{title}</span>
      {children}
    </div>
  );
}

/** Turbo, overhaul and age LoRA cards for the active family. */
export function ModeLoraCards({ model }: { model: CreatorModel }) {
  const update = useCreatorUpdate();
  const cards = model.modeLoraCards();
  if (!(cards.turbo.length || cards.overhaul || cards.age.length)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      {cards.turbo.length ? (
        <CardGroup title="Turbo LoRA">
          {cards.turbo.map(({ enabled, entry, rel }) => (
            <AssetCard
              category="lora"
              compact
              entry={entry}
              key={rel || entry.name}
              onSelect={() =>
                update((next) => next.setCcTurboMode(!enabled, rel))
              }
              onToggle={(checked) =>
                update((next) => next.setCcTurboMode(checked, rel))
              }
              selected={enabled}
            />
          ))}
        </CardGroup>
      ) : null}
      {cards.overhaul ? (
        <OverhaulCard
          entry={cards.overhaul.entry}
          strength={cards.overhaul.strength}
        />
      ) : null}
      {cards.age.length ? (
        <CardGroup title="Age LoRA">
          {cards.age.map(({ entry, rel, selected }) => (
            <AssetCard
              category="lora"
              compact
              entry={entry}
              key={rel || entry.name}
              onSelect={() => update((next) => next.setAgeLora(true, rel))}
              selected={selected}
            />
          ))}
        </CardGroup>
      ) : null}
    </div>
  );
}
