"use client";

import {
  CcBlock,
  EmptyEntries,
} from "@workspace/core/components/control-center/cc-block";
import {
  BlockedNote,
  DownloadBar,
  EntryAction,
  StatusBadge,
  useEntryView,
} from "@workspace/core/components/control-center/entry-status";
import { useSamplerLists } from "@workspace/core/hooks/use-control-center";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { cn } from "@workspace/ui/lib/utils";
import {
  type CatalogEntry,
  downloadKey,
} from "@workspace/vnccs/control-center";
import {
  type ControlCenterModel,
  QI2_CACHE_DEVICES,
  QI2_CACHE_DTYPES,
  resolveStatus,
  statusLabel,
  variantPrefixLength,
} from "@workspace/vnccs/control-center-state";
import { useEffect, useId, useState } from "react";

function useUpdate() {
  return useControlCenterStore((state) => state.update);
}

function ModelTypeTabs({
  model,
  selected,
}: {
  model: ControlCenterModel;
  selected: string;
}) {
  const update = useUpdate();
  return (
    <Tabs
      onValueChange={(type) => update((next) => next.setSelectedType(type))}
      value={selected}
    >
      <TabsList>
        {model.modelTypeTabs().map((type) => (
          <TabsTrigger
            className={cn(
              type !== "custom" &&
                model.visibleModels(type).length === 0 &&
                "opacity-60"
            )}
            key={type}
            value={type}
          >
            {type.toUpperCase()}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function VariantSelect({
  current,
  type,
  variants,
}: {
  current: CatalogEntry;
  type: string;
  variants: CatalogEntry[];
}) {
  const update = useUpdate();
  const downloads = useControlCenterStore((state) => state.downloads);
  const prefix = variantPrefixLength(variants.map((entry) => entry.name));

  return (
    <Select
      onValueChange={(name) =>
        update((model) => model.chooseVariant(type, name))
      }
      value={current.name}
    >
      <SelectTrigger aria-label="Model variant" className="min-w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {variants.map((entry) => {
          const download = downloads[downloadKey("models", entry.name)];
          const status = resolveStatus(download, entry.status);
          return (
            <SelectItem key={entry.name} value={entry.name}>
              {entry.name.slice(prefix) || entry.name}
              <span className="text-muted-foreground text-xs">
                {statusLabel(status, download)}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ModelCard({
  model,
  type,
  variants,
}: {
  model: ControlCenterModel;
  type: string;
  variants: CatalogEntry[];
}) {
  const name = model.selectedModelName(type);
  const current = (variants.find((entry) => entry.name === name) ??
    variants[0]) as CatalogEntry;
  const view = useEntryView("models", current);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{current.name}</span>
          {current.description ? (
            <p className="text-muted-foreground text-sm">
              {current.description}
            </p>
          ) : null}
        </div>
        <StatusBadge view={view} />
      </div>
      <DownloadBar view={view} />
      <div className="flex flex-wrap items-center gap-3">
        {variants.length > 1 ? (
          <VariantSelect current={current} type={type} variants={variants} />
        ) : null}
        <EntryAction category="models" entry={current} view={view} />
      </div>
      <BlockedNote view={view} />
    </div>
  );
}

function PassThroughNotice({ model }: { model: ControlCenterModel }) {
  const inputs =
    model.activeKind() === "MiniMaxH3"
      ? "MODEL, CLIP, video VAE and audio VAE"
      : "MODEL, CLIP and VAE";
  return (
    <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
      Pass-through mode takes {inputs} from the node&apos;s inputs inside a
      ComfyUI workflow. VNCCS Studio builds its own workflows and cannot wire
      those inputs, so choose UNET to generate here.
    </div>
  );
}

function NumberField({
  help,
  label,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  help: string;
  label: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  step: number;
  value: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  // Commits on blur or Enter, like the widget's native change event.
  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (Number.isFinite(parsed) && parsed !== value) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div className="flex flex-col gap-1.5" title={help}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        max={max}
        min={min}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
        step={step}
        type="number"
        value={draft}
      />
    </div>
  );
}

function SelectField({
  help,
  label,
  onChange,
  options,
  value,
}: {
  help?: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  const id = useId();
  // Imported workflows may name a sampler this ComfyUI does not list.
  const choices = options.includes(value) ? options : [value, ...options];
  return (
    <div className="flex flex-col gap-1.5" title={help}>
      <Label htmlFor={id}>{label}</Label>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SamplerParams({ model }: { model: ControlCenterModel }) {
  const update = useUpdate();
  const { samplers, schedulers } = useSamplerLists();
  const params = model.displayedParams();
  const patch = (
    values: Parameters<ControlCenterModel["patchModelParams"]>[0]
  ) => update((next) => next.patchModelParams(values));

  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        help="Default sampling step count shared with connected VNCCS generator nodes."
        label="Steps"
        max={200}
        min={1}
        onCommit={(steps) => patch({ steps })}
        step={1}
        value={params.steps}
      />
      <NumberField
        help="Default prompt guidance strength shared with connected VNCCS generator nodes."
        label="CFG"
        max={30}
        min={0}
        onCommit={(cfg) => patch({ cfg })}
        step={0.5}
        value={params.cfg}
      />
      <SelectField
        help="Default sampler algorithm shared with connected VNCCS generator nodes."
        label="Sampler"
        onChange={(sampler) => patch({ sampler })}
        options={samplers}
        value={params.sampler}
      />
      <SelectField
        help="Default scheduler/noise schedule shared with connected VNCCS generator nodes."
        label="Scheduler"
        onChange={(scheduler) => patch({ scheduler })}
        options={schedulers}
        value={params.scheduler}
      />
    </div>
  );
}

function Qi2CacheSection({ model }: { model: ControlCenterModel }) {
  const update = useUpdate();
  const cache = model.qi2Cache();
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Qwen Image 2.1 Cache</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <SelectField
            label="Device"
            onChange={(device) =>
              update((next) =>
                next.setQi2Cache({
                  device: device as (typeof QI2_CACHE_DEVICES)[number],
                })
              )
            }
            options={QI2_CACHE_DEVICES}
            value={cache.device}
          />
          <p className="text-muted-foreground text-xs">
            KV cache location. Auto uses spare VRAM then RAM; CPU uses
            prefetched RAM; Off recomputes the prefix every step.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <SelectField
            label="Dtype"
            onChange={(dtype) =>
              update((next) =>
                next.setQi2Cache({
                  dtype: dtype as (typeof QI2_CACHE_DTYPES)[number],
                })
              )
            }
            options={QI2_CACHE_DTYPES}
            value={cache.dtype}
          />
          <p className="text-muted-foreground text-xs">
            KV cache storage precision. Default is lossless; int8 halves its
            size; int4 uses about one quarter.
          </p>
        </div>
      </div>
    </div>
  );
}

function TurboStrip({
  entry,
  model,
}: {
  entry: CatalogEntry;
  model: ControlCenterModel;
}) {
  const update = useUpdate();
  const view = useEntryView("lora", entry);
  const installed = view.status === "installed";
  const active = installed && model.loraState(entry.name).auto_apply === true;
  const switchId = useId();
  let label: string | undefined;
  if (installed) {
    label = active ? "Active" : "Installed";
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        active && "border-primary/60 bg-primary/5"
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Label className="min-w-0 flex-1 truncate" htmlFor={switchId}>
          {entry.name}
        </Label>
        <StatusBadge label={label} view={view} />
        {installed ? (
          <Switch
            checked={active}
            id={switchId}
            onCheckedChange={(enabled) =>
              update((next) => next.selectTurboLora(entry.name, enabled))
            }
          />
        ) : (
          <EntryAction category="lora" entry={entry} view={view} />
        )}
      </div>
      <DownloadBar view={view} />
    </div>
  );
}

function TurboSection({ model }: { model: ControlCenterModel }) {
  const entries = model.turboLoras();
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-medium text-sm">Turbo LoRA</h3>
        <p className="text-muted-foreground text-xs">
          One turbo LoRA at a time. Turning one on switches to{" "}
          {model.activeKind() === "QI2" ? 6 : 4} steps at CFG 1 and restores
          your settings when it is turned off.
        </p>
      </div>
      {entries.map((entry) => (
        <TurboStrip entry={entry} key={entry.name} model={model} />
      ))}
    </div>
  );
}

export function ModelBlock({ model }: { model: ControlCenterModel }) {
  const type = model.selectedType();
  const custom = type === "custom";
  const variants = custom ? [] : model.visibleModels(type);

  let card = <EmptyEntries />;
  if (custom) {
    card = <PassThroughNotice model={model} />;
  } else if (variants.length > 0) {
    card = <ModelCard model={model} type={type} variants={variants} />;
  }

  return (
    <CcBlock blockKey="models" count={variants.length} title="Model">
      <div className="flex flex-col gap-5">
        <ModelTypeTabs model={model} selected={type} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          {card}
          <SamplerParams model={model} />
        </div>
        {model.activeKind() === "QI2" ? (
          <Qi2CacheSection model={model} />
        ) : null}
        <TurboSection model={model} />
      </div>
    </CcBlock>
  );
}
