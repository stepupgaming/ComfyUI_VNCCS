"use client";

import { TagDialog } from "@workspace/core/components/clone/cloner-dialogs";
import { CLONER_HELP } from "@workspace/core/components/clone/cloner-help";
import {
  SegmentedField,
  SliderField,
  SwitchField,
  TextAreaField,
  TextField,
} from "@workspace/core/components/common/form-fields";
import type { QwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import { useClonerUpdate } from "@workspace/core/hooks/use-cloner";
import {
  analyzeSource,
  loadTagGroups,
} from "@workspace/core/lib/cloner-actions";
import { useClonerStore } from "@workspace/core/stores/cloner-store";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import type {
  PresetGroup,
  TraitField,
} from "@workspace/vnccs/character-presets";
import {
  ALPHA_DISABLED_TITLE,
  CLONER_TRAIT_FIELDS,
  type ClonerModel,
  GENDER_OPTIONS,
} from "@workspace/vnccs/cloner-state";
import { BACKGROUND_OPTIONS } from "@workspace/vnccs/creator-state";
import { Loader2, Plus, ScanSearch } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** The chips of a comma-separated field, keyed by text and occurrence since tokens may repeat. */
function tokens(value: string): { key: string; text: string }[] {
  const seen = new Map<string, number>();
  return value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((text) => {
      const count = (seen.get(text) ?? 0) + 1;
      seen.set(text, count);
      return { key: `${text}#${count}`, text };
    });
}

/**
 * One trait row: the value as chips, edited inline on click; edits save as
 * the user types. "+" opens the tag constructor.
 */
function TraitRow({
  field,
  label,
  onPresets,
  value,
}: {
  field: TraitField;
  label: string;
  onPresets: () => void;
  value: string;
}) {
  const update = useClonerUpdate();
  const editRequest = useClonerStore((store) => store.editRequest);
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const chips = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const parts = tokens(value);

  useEffect(() => {
    if (editRequest?.field === field) {
      // Consumed once, so remounting the tab does not reopen the editor.
      useClonerStore.getState().set({ editRequest: null });
      setEditing(true);
    }
  }, [editRequest, field]);

  useEffect(() => {
    if (editing) {
      input.current?.focus({ preventScroll: true });
    } else if (returnFocus.current) {
      returnFocus.current = false;
      chips.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  return (
    <div
      className="grid min-h-14 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b py-2"
      title={CLONER_HELP[field]}
    >
      <span className="text-muted-foreground text-sm">{label}</span>
      {editing ? (
        <Input
          aria-label={label}
          onBlur={() => setEditing(false)}
          onChange={(event) =>
            update((next) => next.setTrait(field, event.target.value))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              returnFocus.current = true;
              setEditing(false);
            }
          }}
          placeholder="Add tags"
          ref={input}
          value={value}
        />
      ) : (
        <button
          aria-label={`Edit ${label.toLowerCase()} tags: ${value || "Add tags"}`}
          className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setEditing(true)}
          ref={chips}
          type="button"
        >
          {parts.length > 0 ? (
            parts.map((part) => (
              <span
                className="max-w-full truncate rounded-md border bg-muted px-2 py-0.5"
                key={part.key}
              >
                {part.text}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">Add tags</span>
          )}
        </button>
      )}
      <Button
        aria-label={`Choose ${label.toLowerCase()} presets`}
        onClick={onPresets}
        size="icon"
        title="Choose Presets"
        variant="outline"
      >
        <Plus />
      </Button>
    </div>
  );
}

function AnalyzeButton({ gate }: { gate: QwenModelGate }) {
  const phase = useClonerStore((store) => store.analysis);
  let label = "Analyze Captions";
  if (phase === "checking") {
    label = "Checking model…";
  } else if (phase === "analyzing") {
    label = "Analyzing…";
  }
  return (
    <Button
      disabled={phase !== "idle"}
      onClick={() => analyzeSource(gate)}
      title="Read the character's traits off the source image with the local Qwen3.5 vision model"
    >
      {phase === "idle" ? <ScanSearch /> : <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}

interface OpenPresets {
  field: TraitField;
  groups: PresetGroup[];
  label: string;
}

/** Analysis, background, gender, age, traits, aesthetics and NSFW: the widget's right column. */
export function AttributesColumn({
  gate,
  model,
}: {
  gate: QwenModelGate;
  model: ClonerModel;
}) {
  const update = useClonerUpdate();
  const [presets, setPresets] = useState<OpenPresets | null>(null);
  const [loadingPresets, setLoadingPresets] = useState<TraitField | null>(null);
  const info = model.state.character_info;
  const qi2 = model.alphaAllowed();

  const openPresets = async (field: TraitField, label: string) => {
    setLoadingPresets(field);
    try {
      const groups = await loadTagGroups(field);
      if (groups) {
        setPresets({ field, groups, label });
      }
    } finally {
      setLoadingPresets(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">Attributes</h3>
      <AnalyzeButton gate={gate} />
      <SegmentedField
        help={CLONER_HELP.background_color}
        label="Background"
        onChange={(value) =>
          update((next) => {
            next.chooseBackground(value);
          })
        }
        options={BACKGROUND_OPTIONS.map((option) =>
          option.value === "Transparent"
            ? {
                ...option,
                disabled: !qi2,
                title: qi2 ? undefined : ALPHA_DISABLED_TITLE,
              }
            : option
        )}
        value={info.background_color}
      />
      <SegmentedField
        help={CLONER_HELP.sex}
        label="Gender"
        onChange={(sex) => update((next) => next.setSex(sex))}
        options={GENDER_OPTIONS}
        value={info.sex}
      />
      <SliderField
        help={CLONER_HELP.age}
        label="Age"
        max={100}
        min={1}
        onChange={(age) => update((next) => next.setAge(age))}
        step={1}
        value={Number(info.age) || 18}
      />
      <div className="flex flex-col border-t">
        {CLONER_TRAIT_FIELDS.map(({ key, label }) => (
          <div className={cn(loadingPresets === key && "opacity-60")} key={key}>
            <TraitRow
              field={key}
              label={label}
              onPresets={() => openPresets(key, label)}
              value={String(info[key] ?? "")}
            />
          </div>
        ))}
      </div>
      <TextField
        help={CLONER_HELP.aesthetics}
        label="Aesthetics"
        onChange={(value) =>
          update((next) => next.setInfo("aesthetics", value))
        }
        value={String(info.aesthetics ?? "")}
      />
      <SwitchField
        checked={Boolean(info.nsfw)}
        help={CLONER_HELP.nsfw}
        label="NSFW Mode"
        onChange={(nsfw) => update((next) => next.setInfo("nsfw", nsfw))}
      />
      {presets ? (
        <TagDialog
          groups={presets.groups}
          label={presets.label}
          onApply={(value) =>
            update((next) => next.setTrait(presets.field, value))
          }
          onClose={() => setPresets(null)}
          value={String(info[presets.field] ?? "")}
        />
      ) : null}
    </div>
  );
}

/** The prompt textareas under the columns; they follow the loaded state. */
export function PromptsRow({ model }: { model: ClonerModel }) {
  const update = useClonerUpdate();
  const info = model.state.character_info;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextAreaField
        label="Extra / LoRA Prompt"
        onChange={(value) =>
          update((next) => next.setInfo("lora_prompt", value))
        }
        value={String(info.lora_prompt ?? "")}
      />
      <TextAreaField
        label="Negative Prompt"
        onChange={(value) =>
          update((next) => next.setInfo("negative_prompt", value))
        }
        value={String(info.negative_prompt ?? "")}
      />
    </div>
  );
}
