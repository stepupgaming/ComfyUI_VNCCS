"use client";

import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Slider } from "@workspace/ui/components/slider";
import { Switch } from "@workspace/ui/components/switch";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import {
  RESOLUTION_SCALE,
  resolutionScaleMegapixels,
  resolutionScaleText,
  resolutionScaleValue,
} from "@workspace/vnccs/resolution";
import { useEffect, useId, useState } from "react";

/** A number input that commits on blur or Enter, like the widgets' native change event. */
export function NumberField({
  className,
  disabled,
  help,
  hideLabel,
  label,
  max,
  min,
  onCommit,
  parse = Number.parseFloat,
  step,
  value,
}: {
  className?: string;
  disabled?: boolean;
  help?: string;
  hideLabel?: boolean;
  label: string;
  max?: number;
  min?: number;
  onCommit: (value: number) => void;
  /** Turns the typed text into a value; null keeps the field unchanged. */
  parse?: (text: string) => number | null;
  step?: number;
  value: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = parse(draft);
    if (parsed !== null && Number.isFinite(parsed) && parsed !== value) {
      onCommit(parsed);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)} title={help}>
      <Label className={cn(hideLabel && "sr-only")} htmlFor={id}>
        {label}
      </Label>
      <Input
        disabled={disabled}
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

const EMPTY_OPTION = "__vnccs_empty__";

export interface SelectOption {
  label: string;
  value: string;
}

function toOptions(
  options: readonly (string | SelectOption)[]
): SelectOption[] {
  return options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );
}

/**
 * A labelled select. A saved value the server no longer lists stays
 * selectable, since imported workflows may name one.
 */
export function SelectField({
  className,
  disabled,
  help,
  hideLabel,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  className?: string;
  disabled?: boolean;
  help?: string;
  hideLabel?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: readonly (string | SelectOption)[];
  placeholder?: string;
  value: string;
}) {
  const id = useId();
  const choices = toOptions(options);
  if (value && !choices.some((option) => option.value === value)) {
    choices.unshift({ label: value, value });
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)} title={help}>
      <Label className={cn(hideLabel && "sr-only")} htmlFor={id}>
        {label}
      </Label>
      <Select
        disabled={disabled}
        onValueChange={(next) => onChange(next === EMPTY_OPTION ? "" : next)}
        value={value || EMPTY_OPTION}
      >
        <SelectTrigger className="w-full min-w-0" id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((option) => (
            <SelectItem
              key={option.value || EMPTY_OPTION}
              value={option.value || EMPTY_OPTION}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export interface SegmentOption {
  disabled?: boolean;
  label: string;
  title?: string;
  value: string;
}

/** A row of mutually exclusive buttons, like the widgets' segmented fields and mode tabs. */
export function SegmentedField({
  className,
  help,
  label,
  onChange,
  options,
  value,
}: {
  className?: string;
  help?: string;
  label?: string;
  onChange: (value: string) => void;
  options: readonly SegmentOption[];
  value: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} title={help}>
      {label ? <span className="font-medium text-sm">{label}</span> : null}
      <fieldset
        aria-label={label}
        className="flex rounded-lg bg-muted p-[3px] text-sm"
      >
        {options.map((option) => (
          <button
            aria-pressed={option.value === value}
            className={cn(
              "flex-1 rounded-md px-2 py-1 font-medium text-foreground/60 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
              option.value === value &&
                "bg-background text-foreground shadow-sm dark:bg-input/30"
            )}
            disabled={option.disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.title}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

/** A labelled slider with its value shown beside the label; saves while dragging. */
export function SliderField({
  className,
  disabled,
  format = String,
  help,
  label,
  max,
  min,
  onChange,
  step,
  value,
}: {
  className?: string;
  disabled?: boolean;
  format?: (value: number) => string;
  help?: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  value: number;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} title={help}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {format(value)}
        </span>
      </div>
      <Slider
        aria-label={label}
        disabled={disabled}
        max={max}
        min={min}
        onValueChange={([next]) => {
          if (next !== undefined && next !== value) {
            onChange(next);
          }
        }}
        step={step}
        value={[value]}
      />
    </div>
  );
}

/** The megapixel resolution slider shared by the Creator and the generators. */
export function ResolutionScaleField({
  className,
  help,
  label = "Resolution scale",
  onChange,
  value,
}: {
  className?: string;
  help?: string;
  label?: string;
  onChange: (targetSize: number) => void;
  /** The stored target size in pixels. */
  value: unknown;
}) {
  return (
    <SliderField
      className={className}
      format={() => resolutionScaleText(value)}
      help={help}
      label={label}
      max={RESOLUTION_SCALE.maxMp}
      min={RESOLUTION_SCALE.minMp}
      onChange={(megapixels) => {
        const next = resolutionScaleValue(megapixels);
        if (next !== Number(value)) {
          onChange(next);
        }
      }}
      step={RESOLUTION_SCALE.stepMp}
      value={Number(resolutionScaleMegapixels(value).toFixed(1))}
    />
  );
}

/** A labelled switch row. */
export function SwitchField({
  checked,
  className,
  disabled,
  help,
  label,
  onChange,
}: {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  help?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div
      className={cn("flex items-center justify-between gap-3", className)}
      title={help}
    >
      <Label htmlFor={id}>{label}</Label>
      <Switch
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={onChange}
      />
    </div>
  );
}

/** A text input that saves as the user types. */
export function TextField({
  className,
  help,
  label,
  onChange,
  placeholder,
  value,
}: {
  className?: string;
  help?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)} title={help}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

/** A textarea that saves as the user types, like the widgets' `oninput`. */
export function TextAreaField({
  className,
  help,
  label,
  onChange,
  placeholder,
  rows = 3,
  value,
}: {
  className?: string;
  help?: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  value: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)} title={help}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        value={value}
      />
    </div>
  );
}
