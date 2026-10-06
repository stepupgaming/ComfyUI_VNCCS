"use client";

import {
  SegmentedField,
  SelectField,
  SliderField,
  SwitchField,
} from "@workspace/core/components/common/form-fields";
import {
  PresetDialog,
  WizardDialog,
} from "@workspace/core/components/create/creator-dialogs";
import { CREATOR_HELP } from "@workspace/core/components/create/creator-help";
import {
  StyleDialog,
  StylePreview,
} from "@workspace/core/components/create/style-library";
import { useCreatorUpdate } from "@workspace/core/hooks/use-creator";
import { useCreatorStore } from "@workspace/core/stores/creator-store";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  CUSTOM_STYLE_ID,
  resolveStyleId,
  styleSummary,
} from "@workspace/vnccs/character-styles";
import {
  BACKGROUND_OPTIONS,
  type CreatorModel,
  FRAMING_OPTIONS,
  TRAIT_FIELDS,
  type TraitKey,
} from "@workspace/vnccs/creator-state";
import { ListChecks, Sparkles } from "lucide-react";
import { useId, useState } from "react";

function StyleField({ model }: { model: CreatorModel }) {
  const styles = useCreatorStore((store) => store.styles);
  const update = useCreatorUpdate();
  const [open, setOpen] = useState(false);
  const info = model.state.character_info;
  const summary = styleSummary(styles, info);
  const custom = resolveStyleId(styles, info.style) === CUSTOM_STYLE_ID;

  return (
    <div className="flex flex-col gap-1.5" title={CREATOR_HELP.style}>
      <span className="font-medium text-sm">Style</span>
      <button
        aria-haspopup="dialog"
        aria-label={`Choose style: ${summary.label}`}
        className="flex items-stretch gap-3 rounded-lg border p-2 text-left transition-colors hover:border-primary/60"
        onClick={() => setOpen(true)}
        type="button"
      >
        <StylePreview
          className="size-16 shrink-0 rounded-md"
          image={summary.image}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <strong className="truncate text-sm">{summary.label}</strong>
          <span
            className="line-clamp-2 text-muted-foreground text-xs"
            title={summary.description}
          >
            {summary.description}
          </span>
          <span
            className="truncate text-muted-foreground text-xs"
            title={summary.reference}
          >
            Reference: {summary.reference}
          </span>
        </span>
      </button>
      {custom ? (
        <Input
          aria-label="Custom style description"
          maxLength={16_000}
          onChange={(event) =>
            update((next) => next.setInfo("custom_style", event.target.value))
          }
          placeholder="Describe any visual style"
          value={info.custom_style || ""}
        />
      ) : null}
      {open ? <StyleDialog onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function TraitField({
  field,
  label,
  onPresets,
  value,
}: {
  field: TraitKey;
  label: string;
  onPresets: () => void;
  value: string;
}) {
  const update = useCreatorUpdate();
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5" title={CREATOR_HELP[field]}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-1.5">
        <Input
          id={id}
          onChange={(event) =>
            update((next) => next.setInfo(field, event.target.value))
          }
          value={value}
        />
        <Button
          aria-label={`Choose ${label.toLowerCase()} presets`}
          onClick={onPresets}
          size="icon"
          title="Presets"
          variant="outline"
        >
          <ListChecks />
        </Button>
      </div>
    </div>
  );
}

/** Background, gender, age, framing, style and traits: the widget's centre column. */
export function AttributesColumn({ model }: { model: CreatorModel }) {
  const update = useCreatorUpdate();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [presetField, setPresetField] = useState<{
    key: TraitKey;
    label: string;
  } | null>(null);
  const info = model.state.character_info;
  const qi2 = model.mode() === "qi2";

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-medium text-sm">Attributes</h3>
      <Button onClick={() => setWizardOpen(true)} variant="secondary">
        <Sparkles />
        Character Wizzard
      </Button>
      <SegmentedField
        help={CREATOR_HELP.background_color}
        label="Background"
        onChange={(value) => update((next) => next.setBackground(value, true))}
        options={BACKGROUND_OPTIONS.map((option) =>
          option.value === "Transparent"
            ? {
                ...option,
                disabled: !qi2,
                title: qi2
                  ? "Native transparency"
                  : "Native transparency requires Qwen Image 2.1",
              }
            : option
        )}
        value={info.background_color}
      />
      <SegmentedField
        help={CREATOR_HELP.sex}
        label="Gender"
        onChange={(sex) => update((next) => next.setInfo("sex", sex))}
        options={[
          { label: "Male", value: "male" },
          { label: "Female", value: "female" },
        ]}
        value={info.sex}
      />
      <SliderField
        help={CREATOR_HELP.age}
        label="Age"
        max={100}
        min={1}
        onChange={(age) => update((next) => next.setAge(age))}
        step={1}
        value={Number(info.age) || 18}
      />
      <SelectField
        help={CREATOR_HELP.framing}
        label="Framing"
        onChange={(framing) =>
          update((next) => next.setInfo("framing", framing))
        }
        options={FRAMING_OPTIONS}
        value={info.framing || FRAMING_OPTIONS[0].value}
      />
      <StyleField model={model} />
      <div className="flex flex-col gap-3">
        {TRAIT_FIELDS.map(({ key, label }) => (
          <TraitField
            field={key}
            key={key}
            label={label}
            onPresets={() => setPresetField({ key, label })}
            value={String(info[key] ?? "")}
          />
        ))}
      </div>
      <SwitchField
        checked={Boolean(info.nsfw)}
        help={CREATOR_HELP.nsfw}
        label="NSFW Mode"
        onChange={(nsfw) => update((next) => next.setInfo("nsfw", nsfw))}
      />
      {wizardOpen ? (
        <WizardDialog onClose={() => setWizardOpen(false)} />
      ) : null}
      {presetField ? (
        <PresetDialog
          field={presetField.key}
          label={presetField.label}
          onApply={(value) =>
            update((next) => next.setInfo(presetField.key, value))
          }
          onClose={() => setPresetField(null)}
          value={String(info[presetField.key] ?? "")}
        />
      ) : null}
    </div>
  );
}
