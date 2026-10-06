"use client";

import {
  NumberField,
  ResolutionScaleField,
  SegmentedField,
  SelectField,
  TextAreaField,
} from "@workspace/core/components/common/form-fields";
import { CREATOR_HELP } from "@workspace/core/components/create/creator-help";
import {
  ModeLoraCards,
  ModelPicker,
} from "@workspace/core/components/create/model-cards";
import { useCreatorUpdate } from "@workspace/core/hooks/use-creator";
import { useCreatorStore } from "@workspace/core/stores/creator-store";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  type CreatorModel,
  GENERATION_MODES,
  type GenerationMode,
  type LoraSlot,
  normalizeMode,
} from "@workspace/vnccs/creator-state";
import { Dices } from "lucide-react";

const QI2_CACHE_DEVICES = ["auto", "gpu", "cpu", "off"];
const QI2_CACHE_DTYPES = ["default", "int8", "int4"];
const LORA_SLOT_LABELS = ["LoRA 1", "LoRA 2", "LoRA 3", "LoRA 4", "LoRA 5"];

function clamped(min: number, max: number) {
  return (text: string) => {
    const value = Number.parseFloat(text);
    return Number.isNaN(value) ? null : Math.max(min, Math.min(max, value));
  };
}

function parseSeed(text: string): number | null {
  const value = Number.parseInt(text, 10);
  return Number.isNaN(value) ? null : value;
}

function loraHeader(mode: GenerationMode): string {
  if (mode === "qi2") {
    return "Qwen Image 2.1 LoRA Stack";
  }
  return mode === "anima" ? "ANIMA LoRA Stack" : "LoRa Stack";
}

function SeedField({ model }: { model: CreatorModel }) {
  const update = useCreatorUpdate();
  const random = model.settings.seed_mode === "randomize";
  return (
    <div className="flex items-end gap-2">
      <NumberField
        className="flex-1"
        help={CREATOR_HELP.seed}
        label="Seed"
        onCommit={(seed) =>
          update((next) => {
            next.settings.seed = seed;
          })
        }
        parse={parseSeed}
        step={1}
        value={Number(model.settings.seed) || 0}
      />
      <Button
        aria-label="Randomize seed for each generation"
        aria-pressed={random}
        className={cn(random && "border-primary text-primary")}
        onClick={() => update((next) => next.toggleSeedMode())}
        size="icon"
        title={CREATOR_HELP.seed_mode}
        variant="outline"
      >
        <Dices />
      </Button>
    </div>
  );
}

function LoraStack({ model }: { model: CreatorModel }) {
  const update = useCreatorUpdate();
  const options = [
    { label: "None", value: "" },
    ...model.stackLoraOptions().map((name) => ({ label: name, value: name })),
  ];
  const stack = (model.settings.lora_stack ?? []) as LoraSlot[];
  const setSlot = (index: number, patch: Partial<LoraSlot>) =>
    update((next) => next.setLoraSlot(index, patch));

  return (
    <div className="flex flex-col gap-2" title={CREATOR_HELP.lora_stack}>
      {LORA_SLOT_LABELS.map((label, index) => {
        const slot = stack[index];
        if (!slot) {
          return null;
        }
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
              onChange={(name) => setSlot(index, { name })}
              options={options}
              value={slot.name || ""}
            />
            <NumberField
              hideLabel
              label={`${label} strength`}
              onCommit={(strength) => setSlot(index, { strength })}
              step={0.05}
              value={slot.strength ?? 1}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Mode, model, sampling and LoRAs: the widget's right column. */
export function GenerationColumn({ model }: { model: CreatorModel }) {
  const update = useCreatorUpdate();
  const lists = useCreatorStore((store) => store.lists);
  const mode = normalizeMode(model.mode()) as GenerationMode;
  const g = model.settings;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">Generation</h3>
      <SegmentedField
        help={CREATOR_HELP.generation_mode}
        onChange={(next) =>
          update((creator) => creator.setGenerationMode(next))
        }
        options={GENERATION_MODES.map(({ label, mode: value }) => ({
          label,
          value,
        }))}
        value={mode}
      />
      <ModelPicker mode={mode} model={model} />
      <ResolutionScaleField
        help={CREATOR_HELP.target_size}
        onChange={(size) =>
          update((next) => {
            next.settings.target_size = size;
          })
        }
        value={g.target_size}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          help={CREATOR_HELP.steps}
          label="Steps"
          max={100}
          min={1}
          onCommit={(steps) =>
            update((next) => {
              next.settings.steps = steps;
            })
          }
          parse={clamped(1, 100)}
          step={1}
          value={Number(g.steps) || 1}
        />
        <SelectField
          help={CREATOR_HELP.sampler}
          label="Sampler"
          onChange={(sampler) =>
            update((next) => {
              next.settings.sampler = sampler;
            })
          }
          options={lists?.samplers ?? []}
          value={String(g.sampler || "")}
        />
        <NumberField
          help={CREATOR_HELP.cfg}
          label="CFG"
          max={20}
          min={1}
          onCommit={(cfg) =>
            update((next) => {
              next.settings.cfg = cfg;
            })
          }
          parse={clamped(1, 20)}
          step={0.1}
          value={Number(g.cfg) || 1}
        />
        <SelectField
          help={CREATOR_HELP.scheduler}
          label="Scheduler"
          onChange={(scheduler) =>
            update((next) => {
              next.settings.scheduler = scheduler;
            })
          }
          options={lists?.schedulers ?? []}
          value={String(g.scheduler || "")}
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
        <h3 className="font-medium text-sm">{loraHeader(mode)}</h3>
        <ModeLoraCards model={model} />
        <LoraStack model={model} />
      </div>
    </div>
  );
}

/** Aesthetics, negative prompt and LoRA trigger: the widget's bottom row. */
export function PromptsRow({ model }: { model: CreatorModel }) {
  const update = useCreatorUpdate();
  const info = model.state.character_info;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <TextAreaField
        help={CREATOR_HELP.aesthetics}
        label="Aesthetics"
        onChange={(value) =>
          update((next) => next.setPromptText("aesthetics", value))
        }
        value={info.aesthetics || ""}
      />
      <TextAreaField
        label="Negative Prompt"
        onChange={(value) =>
          update((next) => next.setPromptText("negative_prompt", value))
        }
        value={info.negative_prompt || ""}
      />
      <TextAreaField
        label="LoRA Trigger"
        onChange={(value) =>
          update((next) => next.setPromptText("lora_prompt", value))
        }
        value={info.lora_prompt || ""}
      />
    </div>
  );
}
