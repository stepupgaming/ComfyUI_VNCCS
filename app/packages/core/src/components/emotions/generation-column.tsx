"use client";

import {
  AssetCardFrame,
  AssetCardHead,
  AssetDescription,
  assetState,
} from "@workspace/core/components/common/asset-card";
import {
  NumberField,
  SegmentedField,
  SelectField,
} from "@workspace/core/components/common/form-fields";
import {
  DownloadBar,
  EntryAction,
  StatusBadge,
  useEntryView,
} from "@workspace/core/components/control-center/entry-status";
import { useEmotionUpdate } from "@workspace/core/hooks/use-emotions";
import { useEmotionStore } from "@workspace/core/stores/emotion-store";
import { Button } from "@workspace/ui/components/button";
import { Switch } from "@workspace/ui/components/switch";
import { cn } from "@workspace/ui/lib/utils";
import type {
  CatalogEntry,
  DownloadCategory,
} from "@workspace/vnccs/control-center";
import { ccRelPath, type GenerationMode } from "@workspace/vnccs/creator-state";
import {
  EMOTION_EMPTY_MODELS,
  EMOTION_FIELD_HELP,
  EMOTION_GENERATION_MODES,
  EMOTION_LORA_HEADERS,
  EMOTION_SAMPLER_FALLBACK,
  EMOTION_SCHEDULER_FALLBACK,
  type EmotionStudioModel,
} from "@workspace/vnccs/emotion-state";
import { Dices } from "lucide-react";
import { useState } from "react";

const QI2_CACHE_DEVICES = ["auto", "gpu", "cpu", "off"];
const QI2_CACHE_DTYPES = ["default", "int8", "int4"];
const LORA_SLOT_LABELS = ["LoRA 1", "LoRA 2", "LoRA 3", "LoRA 4", "LoRA 5"];

function clamped(min: number, max: number, integer = false) {
  return (text: string) => {
    const value = integer ? Number.parseInt(text, 10) : Number.parseFloat(text);
    return Number.isNaN(value) ? null : Math.max(min, Math.min(max, value));
  };
}

function parseSeed(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? null : value;
}

/** A catalog or local model as a card, like the widget's `buildAssetCard`. */
function AssetCard({
  category,
  compact = false,
  entry,
  head = false,
  local = false,
  onSelect,
  onToggle,
  open = false,
  selected = false,
}: {
  category: DownloadCategory;
  compact?: boolean;
  entry: CatalogEntry;
  /** The picker head stays clickable even when its model is missing. */
  head?: boolean;
  /** A stand-in that is not in the catalog, so it cannot be downloaded here. */
  local?: boolean;
  onSelect?: () => void;
  onToggle?: (checked: boolean) => void;
  open?: boolean;
  selected?: boolean;
}) {
  const view = useEntryView(category, entry);
  const state = assetState(local ? entry.status : view.status);
  const installed = state === "installed";
  const name = entry.name || ccRelPath(entry) || "Unknown";
  const clickable = Boolean(onSelect) && (installed || head);
  let action = (
    <EntryAction category={category} entry={entry} size="xs" view={view} />
  );
  if (local) {
    action = (
      <span className="text-muted-foreground text-xs">
        Not in the catalog. Place it in models/loras to use it.
      </span>
    );
  }

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
        {local ? null : <StatusBadge className="shrink-0" view={view} />}
        {onToggle && installed ? (
          <Switch
            aria-label={`Use ${name}`}
            checked={selected}
            onCheckedChange={onToggle}
          />
        ) : null}
      </AssetCardHead>
      {compact ? null : <AssetDescription text={entry.description} />}
      {local ? null : <DownloadBar view={view} />}
      {installed ? null : <div className="flex">{action}</div>}
    </AssetCardFrame>
  );
}

/** The selected model as a card that opens the VNCCS and user model lists. */
function ModelPicker({
  mode,
  model,
}: {
  mode: GenerationMode;
  model: EmotionStudioModel;
}) {
  const update = useEmotionUpdate();
  const [open, setOpen] = useState(false);
  const entries = model.modelEntries(mode);
  const head = model.selectedModelEntry(mode);

  if (!head) {
    return (
      <p className="text-muted-foreground text-xs">
        {EMOTION_EMPTY_MODELS[mode]}
      </p>
    );
  }

  const current = model.selectedModelRel(mode);
  const select = (rel: string) => {
    setOpen(false);
    update((next) => next.selectModel(mode, rel));
  };
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
              {group.items.map((entry) => (
                <AssetCard
                  category="models"
                  entry={entry}
                  key={`${entry.name}:${ccRelPath(entry)}`}
                  onSelect={() => select(ccRelPath(entry))}
                  selected={ccRelPath(entry) === current}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TurboCards({ model }: { model: EmotionStudioModel }) {
  const update = useEmotionUpdate();
  const cards = model.turboCards();
  if (cards.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-sm">Turbo LoRA</span>
      {cards.map(({ enabled, entry, fallback, rel }) => (
        <AssetCard
          category="lora"
          compact
          entry={entry}
          key={rel || entry.name}
          local={fallback}
          onSelect={() => update((next) => next.setCcTurboMode(!enabled, rel))}
          onToggle={(checked) =>
            update((next) => next.setCcTurboMode(checked, rel))
          }
          selected={enabled}
        />
      ))}
    </div>
  );
}

function SeedField({ model }: { model: EmotionStudioModel }) {
  const update = useEmotionUpdate();
  const random = (model.gen.seed_mode || "fixed") === "randomize";
  return (
    <div className="flex items-end gap-2">
      <NumberField
        className="flex-1"
        help={EMOTION_FIELD_HELP.seed}
        label="Seed"
        onCommit={(seed) => update((next) => next.setValue("seed", seed))}
        parse={parseSeed}
        step={1}
        value={Number(model.gen.seed) || 0}
      />
      <Button
        aria-label="Randomize seed for each generation"
        aria-pressed={random}
        className={cn(random && "border-primary text-primary")}
        onClick={() => update((next) => next.toggleSeedMode())}
        size="icon"
        title={random ? "Random seed on queue" : "Fixed seed"}
        variant="outline"
      >
        <Dices />
      </Button>
    </div>
  );
}

function LoraStack({ model }: { model: EmotionStudioModel }) {
  const update = useEmotionUpdate();
  const options = [
    { label: "None", value: "" },
    ...model.stackLoraOptions().map((name) => ({ label: name, value: name })),
  ];
  return (
    <div className="flex flex-col gap-2" title={EMOTION_FIELD_HELP.lora_stack}>
      {model.loraRows().map((slot, index) => {
        const label = LORA_SLOT_LABELS[index] ?? `LoRA ${index + 1}`;
        return (
          <div
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_5rem] items-end gap-2",
              !slot.name && "opacity-70"
            )}
            key={label}
          >
            <SelectField
              hideLabel
              label={label}
              onChange={(name) =>
                update((next) => next.setLoraSlot(index, { name }))
              }
              options={options}
              value={slot.name}
            />
            <NumberField
              help={EMOTION_FIELD_HELP.lora_strength}
              hideLabel
              label={`${label} strength`}
              max={2}
              min={0}
              onCommit={(strength) =>
                update((next) => next.setLoraSlot(index, { strength }))
              }
              parse={clamped(0, 2)}
              step={0.05}
              value={slot.strength}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Family tabs, model, sampling and LoRAs: the widget's Generation section. */
export function GenerationColumn({ model }: { model: EmotionStudioModel }) {
  const update = useEmotionUpdate();
  const lists = useEmotionStore((store) => store.lists);
  const mode = (model.emotionMode() || "anima") as GenerationMode;
  const g = model.gen;
  const samplers = lists?.samplers.length
    ? lists.samplers
    : EMOTION_SAMPLER_FALLBACK;
  const schedulers = lists?.schedulers.length
    ? lists.schedulers
    : EMOTION_SCHEDULER_FALLBACK;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">Generation</h3>
      <SegmentedField
        onChange={(next) => update((studio) => studio.setGenerationMode(next))}
        options={EMOTION_GENERATION_MODES.map(({ label, mode: value }) => ({
          label,
          value,
        }))}
        value={mode}
      />
      <ModelPicker mode={mode} model={model} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          help={EMOTION_FIELD_HELP.steps}
          label="Steps"
          max={100}
          min={1}
          onCommit={(steps) => update((next) => next.setValue("steps", steps))}
          parse={clamped(1, 100, true)}
          step={1}
          value={Number(g.steps) || 1}
        />
        <SelectField
          help={EMOTION_FIELD_HELP.sampler}
          label="Sampler"
          onChange={(sampler) =>
            update((next) => next.setValue("sampler", sampler))
          }
          options={samplers}
          value={String(g.sampler || "euler")}
        />
        <NumberField
          help={EMOTION_FIELD_HELP.cfg}
          label="CFG"
          max={20}
          min={0}
          onCommit={(cfg) => update((next) => next.setValue("cfg", cfg))}
          parse={clamped(0, 20)}
          step={0.1}
          value={Number(g.cfg) || 0}
        />
        <SelectField
          help={EMOTION_FIELD_HELP.scheduler}
          label="Scheduler"
          onChange={(scheduler) =>
            update((next) => next.setValue("scheduler", scheduler))
          }
          options={schedulers}
          value={String(g.scheduler || "normal")}
        />
      </div>
      <SeedField model={model} />
      {mode === "qi2" ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <span className="font-medium text-sm">Qwen Image 2.1 Cache</span>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Device"
              onChange={(device) =>
                update((next) => next.setQi2Cache({ device }))
              }
              options={QI2_CACHE_DEVICES}
              value={g.qi2_cache?.device || "gpu"}
            />
            <SelectField
              label="Dtype"
              onChange={(dtype) =>
                update((next) => next.setQi2Cache({ dtype }))
              }
              options={QI2_CACHE_DTYPES}
              value={g.qi2_cache?.dtype || "int8"}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        <h3 className="font-medium text-sm">{EMOTION_LORA_HEADERS[mode]}</h3>
        <TurboCards model={model} />
        <LoraStack model={model} />
      </div>
    </div>
  );
}
