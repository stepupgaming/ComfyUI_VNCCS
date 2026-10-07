"use client";

import {
  AssetCardFrame,
  AssetCardHead,
  AssetDescription,
  type AssetState,
  assetState,
} from "@workspace/core/components/common/asset-card";
import {
  NumberField,
  ResolutionScaleField,
  SegmentedField,
  SelectField,
  SliderField,
  TextAreaField,
  TextField,
} from "@workspace/core/components/common/form-fields";
import type { GeneratorHandle } from "@workspace/core/hooks/use-generator";
import {
  downloadSeedvrAsset,
  type GeneratorSources,
  updateGenerator,
} from "@workspace/core/lib/generator-actions";
import { useGeneratorStore } from "@workspace/core/stores/generator-store";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Label } from "@workspace/ui/components/label";
import { cn } from "@workspace/ui/lib/utils";
import {
  booleanValue,
  DEFAULT_GENERATOR_DATA,
  type FaceDenoiseZone,
  faceDenoiseZone,
  GENERATOR_TITLE,
  type GeneratorData,
  parseNumberField,
  resetDraftToDefaults,
  SEEDVR_COLOR_CORRECTION_MODES,
  type SeedvrEntry,
  type SettingsField,
  schemaInputOptions,
  seedvrRelativePath,
  settingsFieldOptions,
} from "@workspace/vnccs/character-generator";
import { Download } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

const HELP: Record<string, string> = {
  target_size:
    "Sets the generated image area from 1.0 to 4.0 megapixels while preserving aspect ratio.",
  prompt: "Prompt text used for the remove-clothes/preparation stage.",
  model: "SeedVR diffusion model used for the upscaler stage.",
  resolution: "Target size of the shortest output edge in pixels.",
  max_resolution:
    "Maximum size of either output edge in pixels. Set to 0 to disable the limit.",
  color_correction:
    "SeedVR color correction mode. Try adain, wavelet, or none if lab causes color shifts on your GPU.",
  preset: "Strength preset for chroma/background removal.",
  use_sam3_details_recovery:
    "Uses Easy SAM3 to restore character details after background removal.",
  face_denoise:
    "Controls how strongly the face detailer redraws each emotion face. Low preserves more, high changes more.",
  bbox_threshold: "Detection confidence threshold for the face bbox detector.",
  bbox_dilation: "Pixel dilation applied around detected face bounding boxes.",
  sam_dilation: "Pixel dilation applied to the SAM mask.",
  sam_threshold: "SAM mask confidence threshold.",
  sam_bbox_expansion: "Pixel expansion applied to the SAM bounding box.",
};

const TRANSIENT_SEEDVR = new Set(["queued", "downloading", "error"]);

type Section = Record<string, unknown>;

function section(data: GeneratorData, name: string): Section {
  const value = data[name];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Section)
    : {};
}

function Block({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-3">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h4>
      {children}
    </section>
  );
}

function CheckField({
  checked,
  help,
  label,
  onChange,
}: {
  checked: boolean;
  help?: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2" title={help}>
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label className="font-normal" htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}

function SeedvrCard({
  entry,
  head = false,
  onSelect,
  open = false,
  selected,
}: {
  entry: SeedvrEntry;
  head?: boolean;
  onSelect: () => void;
  open?: boolean;
  selected: boolean;
}) {
  const { message, status } = useSeedvrStatus(entry);
  const state = assetState(status);

  return (
    <AssetCardFrame selected={selected} state={state}>
      <AssetCardHead
        disabled={!(head || state === "installed")}
        head={head}
        name={entry.name}
        onSelect={onSelect}
        open={open}
        selected={selected}
        state={state}
      >
        <Badge
          className="shrink-0"
          variant={state === "installed" ? "success" : "outline"}
        >
          {status}
        </Badge>
      </AssetCardHead>
      <AssetDescription text={entry.description} />
      {state === "installed" || head ? null : (
        <SeedvrDownloadButton
          entry={entry}
          message={message}
          state={state}
          status={status}
        />
      )}
    </AssetCardFrame>
  );
}

/** The live download status overrides the catalogue's while it is transient. */
function useSeedvrStatus(entry: SeedvrEntry) {
  const download = useGeneratorStore(
    (store) => store.seedvrDownloads[`models:${entry.name}`]
  );
  if (download && TRANSIENT_SEEDVR.has(download.status)) {
    return { message: download.message, status: download.status };
  }
  return { message: undefined, status: entry.status || "missing" };
}

function SeedvrDownloadButton({
  entry,
  message,
  state,
  status,
}: {
  entry: SeedvrEntry;
  message?: string;
  state: AssetState;
  status: string;
}) {
  let action = "Install / Download";
  if (status === "error") {
    action = message || "Retry";
  } else if (state === "progress") {
    action = message || "Downloading…";
  }
  return (
    <div className="flex">
      <Button
        disabled={state === "progress"}
        onClick={() => downloadSeedvrAsset(entry)}
        size="xs"
        title={status === "error" ? message : undefined}
        variant="outline"
      >
        <Download />
        <span className="max-w-56 truncate">{action}</span>
      </Button>
    </div>
  );
}

function SeedvrPicker({
  model,
  onSelect,
}: {
  model: string;
  onSelect: (rel: string) => void;
}) {
  const catalog = useGeneratorStore((store) => store.seedvr);
  const [open, setOpen] = useState(false);
  if (!catalog) {
    return (
      <p className="text-muted-foreground text-xs">Loading model catalogue…</p>
    );
  }
  const entries = catalog.models;
  const head =
    entries.find((entry) => seedvrRelativePath(entry) === model) ?? entries[0];
  if (!head) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2" title={HELP.model}>
      <SeedvrCard
        entry={head}
        head
        onSelect={() => setOpen((value) => !value)}
        open={open}
        selected={seedvrRelativePath(head) === model}
      />
      {open ? (
        <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto rounded-lg border bg-muted/30 p-2">
          {entries.map((entry) => (
            <SeedvrCard
              entry={entry}
              key={entry.name}
              onSelect={() => {
                setOpen(false);
                onSelect(seedvrRelativePath(entry));
              }}
              selected={seedvrRelativePath(entry) === model}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function colorCorrectionOptions(
  current: unknown,
  schemaOptions: string[]
): string[] {
  const list = schemaOptions.length
    ? schemaOptions
    : SEEDVR_COLOR_CORRECTION_MODES;
  return [...new Set([current, ...list].filter(Boolean).map(String))];
}

function sectionSetter(target: GeneratorHandle["target"]) {
  return (name: string, key: string, value: unknown) =>
    updateGenerator(target, (next) => next.set(name, key, value));
}

function BgRemoveBlock({ handle }: { handle: GeneratorHandle }) {
  const { data, model, target } = handle;
  const set = sectionSetter(target);
  const bgRemove = section(data, "bg_remove");
  return (
    <Block title="BG Remove">
      <SelectField
        help={HELP.preset}
        label="mode"
        onChange={(value) => set("bg_remove", "preset", value)}
        options={model.bgRemoveModes()}
        value={String(bgRemove.preset || "")}
      />
      {model.isNativeBgRemove() ? null : (
        <CheckField
          checked={Boolean(bgRemove.use_sam3_details_recovery)}
          help={HELP.use_sam3_details_recovery}
          label="Use SAM3 Details Recovery"
          onChange={(checked) =>
            set("bg_remove", "use_sam3_details_recovery", checked)
          }
        />
      )}
    </Block>
  );
}

const ZONE_BADGE: Record<
  FaceDenoiseZone,
  "secondary" | "success" | "destructive"
> = {
  weak: "secondary",
  optimal: "success",
  excessive: "destructive",
};

function FaceDenoiseField({
  mode,
  onChange,
  value,
}: {
  mode: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const zone = faceDenoiseZone(value, mode);
  return (
    <div className="flex flex-col gap-2">
      <SliderField
        format={(next) => next.toFixed(2)}
        help={HELP.face_denoise}
        label="face detailer denoise"
        max={1}
        min={0}
        onChange={onChange}
        step={0.01}
        value={value}
      />
      <Badge variant={ZONE_BADGE[zone]}>{zone}</Badge>
    </div>
  );
}

/**
 * The emotions generator never upscales: its panel holds the face pass
 * settings for the Emotion Studio's family instead of pose and upscaler.
 */
function EmotionInlineSettings({
  handle,
  mode,
}: {
  handle: GeneratorHandle;
  mode: string;
}) {
  const { data, target } = handle;
  const set = sectionSetter(target);
  const emotion = section(data, "emotion_generation");
  const defaults = DEFAULT_GENERATOR_DATA.emotion_generation;
  const count = Array.isArray(data.emotion_pairs)
    ? data.emotion_pairs.length
    : 0;
  const faceNumber = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number
  ) => (
    <NumberField
      help={HELP[key]}
      key={key}
      label={label}
      max={max}
      min={min}
      onCommit={(value) => set("emotion_generation", key, value)}
      parse={(text) => clampNumber(text.replace(",", "."), min, max)}
      step={step}
      value={Number(emotion[key] ?? defaults[key]) || 0}
    />
  );
  const denoise = Math.max(
    0,
    Math.min(1, Number(emotion.face_denoise ?? defaults.face_denoise))
  );

  return (
    <div className="flex flex-col gap-3">
      <Block title="Emotion Generation">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">character</dt>
          <dd className="truncate">
            {data.character_name || "Select a character"}
          </dd>
          <dt className="text-muted-foreground">steps</dt>
          <dd>{count} costume / emotion pair(s)</dd>
        </dl>
      </Block>
      {mode === "qi2" ? (
        <>
          <Block title="QI2 Face Generation">
            <ResolutionScaleField
              help={HELP.target_size}
              label="resolution scale"
              onChange={(size) =>
                set("emotion_generation", "target_size", size)
              }
              value={emotion.target_size}
            />
          </Block>
          <Block title="VNCCS BBox Extractor">
            <div className="grid grid-cols-2 gap-3">
              {faceNumber("bbox_threshold", "threshold", 0, 1, 0.01)}
              {faceNumber("bbox_dilation", "dilation", 0, 1024, 1)}
              {faceNumber("feather", "feather", 0, 1024, 1)}
              {faceNumber("drop_size", "drop_size", 1, 4096, 1)}
            </div>
          </Block>
        </>
      ) : (
        <>
          <Block title="Emotion Strength">
            <FaceDenoiseField
              mode={mode}
              onChange={(value) =>
                set("emotion_generation", "face_denoise", value)
              }
              value={denoise}
            />
          </Block>
          <Block title="Face Detailer">
            {faceNumber(
              "task_batch_size",
              "task_batch_size (0 = auto)",
              0,
              32,
              1
            )}
            <CheckField
              checked={booleanValue(emotion.use_sam)}
              label="Use SAM"
              onChange={(checked) =>
                set("emotion_generation", "use_sam", checked)
              }
            />
            <div className="grid grid-cols-2 gap-3">
              {faceNumber("bbox_threshold", "bbox_threshold", 0, 1, 0.01)}
              {faceNumber("bbox_dilation", "bbox_dilation", 0, 128, 1)}
              {faceNumber("sam_dilation", "sam_dilation", 0, 128, 1)}
              {faceNumber("sam_threshold", "sam_threshold", 0, 1, 0.01)}
              {faceNumber(
                "sam_bbox_expansion",
                "sam_bbox_expansion",
                0,
                128,
                1
              )}
            </div>
          </Block>
        </>
      )}
      <BgRemoveBlock handle={handle} />
    </div>
  );
}

/** The generator's inline controls: pose resolution, upscaler and background removal. */
export function GeneratorInlineSettings({
  handle,
  sources,
}: {
  handle: GeneratorHandle;
  sources: GeneratorSources;
}) {
  const schemas = useGeneratorStore((store) => store.schemas);
  const { data, model, target } = handle;
  if (target.kind === "emotions") {
    return (
      <EmotionInlineSettings
        handle={handle}
        mode={
          sources.emotionMode || String(data.ui.resolution_model_kind || "")
        }
      />
    );
  }
  const set = sectionSetter(target);
  const upscaler = section(data, "upscaler");
  const clone = target.kind === "clone";
  const poseSection = model.poseTargetSection();

  return (
    <div className="flex flex-col gap-3">
      <Block title={clone ? "Common" : "Pose Generation"}>
        <ResolutionScaleField
          help={HELP.target_size}
          label="resolution scale"
          onChange={(size) => set(poseSection, "target_size", size)}
          value={section(data, poseSection).target_size}
        />
      </Block>
      {clone && model.isCloneNsfwEnabled() ? (
        <Block title="Remove Clothes">
          <TextAreaField
            help={HELP.prompt}
            label="prompt"
            onChange={(value) => set("remove_clothes", "prompt", value)}
            value={String(section(data, "remove_clothes").prompt ?? "")}
          />
        </Block>
      ) : null}
      <Block title="Upscaler">
        <SegmentedField
          onChange={(mode) => set("upscaler", "mode", mode)}
          options={[
            { label: "SeedVR", value: "seedvr" },
            { label: "OFF", value: "off" },
          ]}
          value={String(upscaler.mode || "seedvr")}
        />
        {upscaler.mode === "off" ? null : (
          <>
            <SeedvrPicker
              model={String(upscaler.model || "")}
              onSelect={(rel) => set("upscaler", "model", rel)}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                help={HELP.resolution}
                label="target short edge"
                max={16_384}
                min={16}
                onCommit={(value) => set("upscaler", "resolution", value)}
                parse={(text) => clampNumber(text, 16, 16_384)}
                step={2}
                value={Number(upscaler.resolution) || 0}
              />
              <NumberField
                help={HELP.max_resolution}
                label="maximum edge"
                max={16_384}
                min={0}
                onCommit={(value) => set("upscaler", "max_resolution", value)}
                parse={(text) => clampNumber(text, 0, 16_384)}
                step={2}
                value={Number(upscaler.max_resolution) || 0}
              />
            </div>
            <SelectField
              help={HELP.color_correction}
              label="color correction"
              onChange={(value) => set("upscaler", "color_correction", value)}
              options={colorCorrectionOptions(
                upscaler.color_correction,
                schemas
                  ? schemaInputOptions(
                      schemas,
                      "SeedVR2PostProcessing",
                      "color_correction_method"
                    )
                  : []
              )}
              value={String(upscaler.color_correction || "")}
            />
          </>
        )}
      </Block>
      <BgRemoveBlock handle={handle} />
    </div>
  );
}

function clampNumber(text: string, min: number, max: number): number | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (!(trimmed && Number.isFinite(value))) {
    return null;
  }
  return Math.max(min, Math.min(max, value));
}

function DraftField({
  draft,
  field,
  onChange,
}: {
  draft: GeneratorData;
  field: SettingsField;
  onChange: (field: SettingsField, value: unknown) => void;
}) {
  const schemas = useGeneratorStore((store) => store.schemas);
  const current = section(draft, field.section)[field.key];
  const className = cn(field.wide && "sm:col-span-2");
  switch (field.type) {
    case "checkbox":
      return (
        <div className={className}>
          <CheckField
            checked={booleanValue(current, false)}
            label={field.label}
            onChange={(checked) => onChange(field, checked)}
          />
        </div>
      );
    case "resolution_scale":
      return (
        <ResolutionScaleField
          className="sm:col-span-2"
          label={field.label}
          onChange={(size) => onChange(field, size)}
          value={current}
        />
      );
    case "select":
      return (
        <SelectField
          className={className}
          label={field.label}
          onChange={(value) => onChange(field, value)}
          options={settingsFieldOptions(
            field,
            current,
            schemas
              ? schemaInputOptions(schemas, field.nodeName, field.inputName)
              : []
          )}
          value={String(current ?? "")}
        />
      );
    case "textarea":
      return (
        <TextAreaField
          className={className}
          label={field.label}
          onChange={(value) => onChange(field, value)}
          value={String(current ?? "")}
        />
      );
    case "number":
      return (
        <NumberField
          className={className}
          label={field.label}
          max={field.max}
          min={field.min}
          onCommit={(value) => onChange(field, value)}
          parse={(text) => parseNumberField(field, text)}
          step={field.step}
          value={Number(current ?? 0)}
        />
      );
    default:
      return (
        <TextField
          className={className}
          label={field.label}
          onChange={(value) => onChange(field, value)}
          value={String(current ?? "")}
        />
      );
  }
}

/** Every processing control, grouped by the internal node that receives it; saved on Apply. */
export function GeneratorSettingsDialog({
  handle,
  onClose,
  sources,
}: {
  handle: GeneratorHandle;
  onClose: () => void;
  sources: GeneratorSources;
}) {
  const { data, model, target } = handle;
  const [draft, setDraft] = useState(() => structuredClone(data));
  const [groups] = useState(() => model.settingsGroups());

  const change = (field: SettingsField, value: unknown) =>
    setDraft((previous) => {
      const next = structuredClone(previous);
      const values = { ...section(next, field.section), [field.key]: value };
      if (field.section === "upscaler" && field.key === "attention_mode") {
        values.attention_mode_manual = true;
      }
      next[field.section] = values;
      return next;
    });

  const apply = () => {
    updateGenerator(target, (next) => {
      next.applyDraft(draft);
      next.syncModelResolution(sources);
    });
    onClose();
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={true}
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{GENERATOR_TITLE[target.kind]} · Settings</DialogTitle>
          <DialogDescription>
            All processing controls are grouped by the internal node that
            receives them. Connected MODEL, CLIP, VAE, image and conditioning
            inputs remain managed by the generator.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 flex min-h-0 flex-col gap-4 overflow-y-auto px-6">
          {groups.map((group) => (
            <section
              className="flex flex-col gap-3 rounded-lg border p-3"
              key={group.title}
            >
              <h4 className="font-medium text-sm">{group.title}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <DraftField
                    draft={draft}
                    field={field}
                    key={`${field.section}.${field.key}`}
                    onChange={change}
                  />
                ))}
              </div>
              {group.note ? (
                <p className="text-muted-foreground text-xs">{group.note}</p>
              ) : null}
            </section>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            onClick={() => setDraft(resetDraftToDefaults(draft, groups))}
            title="Restore defaults in this dialog. They are saved only after Apply."
            variant="outline"
          >
            Load Defaults
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button onClick={apply}>Apply</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
