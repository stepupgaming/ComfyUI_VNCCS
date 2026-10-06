"use client";

import { RemoteImage } from "@workspace/core/components/common/remote-image";
import { useComfyEvent } from "@workspace/core/lib/comfy-events";
import {
  canRenderStylePreview,
  clearStylePreviewStatus,
  deleteStyle,
  handleStylePreviewStage,
  refreshStyleLibrary,
  renderStylePreview,
  saveStyle,
  selectStyle,
} from "@workspace/core/lib/creator-actions";
import { studioHttp } from "@workspace/core/lib/studio";
import {
  type StylePreviewProgress,
  useCreatorStore,
} from "@workspace/core/stores/creator-store";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Slider } from "@workspace/ui/components/slider";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import {
  CUSTOM_STYLE_ID,
  findStyle,
  resolveStyleId,
  stylePreviewPath,
} from "@workspace/vnccs/character-styles";
import {
  customStyleDraft,
  filterStyles,
  isUserStyle,
  type LibraryStyle,
  STYLE_FIELDS,
  STYLE_LIMITS,
  type StyleDraft,
  type StyleTextField,
  styleDraft,
  validateStyleDraft,
} from "@workspace/vnccs/style-library";
import { ImagePlay, Loader2, Pencil, Plus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRunning(progress: StylePreviewProgress | null): boolean {
  return progress?.stage === "queued" || progress?.stage === "running";
}

const CARD_BASE_PX = 140;
const CARD_SCALE = { min: 80, max: 250, step: 10, initial: 130 };

export function StylePreview({
  className,
  image,
}: {
  className?: string;
  image?: string;
}) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const path = image ? stylePreviewPath({ image }) : null;
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden bg-muted text-muted-foreground text-xs",
        className
      )}
    >
      {path && path !== failedPath ? (
        <RemoteImage
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailedPath(path)}
          src={studioHttp().mediaUrl(path)}
        />
      ) : (
        "Preview"
      )}
    </span>
  );
}

/** A spinner or failure badge over the card whose preview is rendering. */
function PreviewProgressOverlay({
  progress,
  styleId,
}: {
  progress: StylePreviewProgress | null;
  styleId: string;
}) {
  if (progress?.styleId !== styleId) {
    return null;
  }
  if (isRunning(progress)) {
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70 text-xs">
        <Loader2 className="size-5 animate-spin" />
        {progress.stage === "queued" ? "Queued" : "Rendering"}
      </span>
    );
  }
  if (progress.stage === "error") {
    return (
      <span
        className="absolute inset-x-0 bottom-0 bg-destructive px-1 py-0.5 text-center text-white text-xs"
        title={progress.message}
      >
        Preview failed
      </span>
    );
  }
  return null;
}

interface CardActions {
  busy: boolean;
  onDelete: (style: LibraryStyle) => void;
  onEdit: (draft: StyleDraft) => void;
  onPreview: (id: string) => void;
  onSelect: (id: string) => void;
}

function StyleCard({
  actions,
  customPrompt,
  progress,
  selected,
  style,
}: {
  actions: CardActions;
  customPrompt: string;
  progress: StylePreviewProgress | null;
  selected: boolean;
  style: LibraryStyle;
}) {
  const custom = style.id === CUSTOM_STYLE_ID;
  const user = isUserStyle(style);
  return (
    <div className="group relative flex flex-col">
      <button
        aria-pressed={selected}
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border text-left transition-colors hover:border-primary/60",
          selected && "border-primary ring-2 ring-primary/40"
        )}
        onClick={() => actions.onSelect(style.id)}
        title={[style.description, style.reference].filter(Boolean).join("\n")}
        type="button"
      >
        <span className="relative">
          <StylePreview className="aspect-square w-full" image={style.image} />
          <PreviewProgressOverlay progress={progress} styleId={style.id} />
        </span>
        <span className="truncate px-2 py-1.5 font-medium text-xs">
          {style.label}
        </span>
      </button>
      {custom || user ? (
        <div className="mt-1 flex gap-1">
          <Button
            aria-label={custom ? "Save custom style" : `Edit ${style.label}`}
            className="flex-1"
            disabled={actions.busy}
            onClick={() =>
              actions.onEdit(
                custom ? customStyleDraft(customPrompt) : styleDraft(style)
              )
            }
            size="xs"
            title={
              custom
                ? "Save the custom prompt as a style in My styles"
                : "Edit style"
            }
            variant="outline"
          >
            <Pencil />
            {custom ? "Save as style" : "Edit"}
          </Button>
          {custom ? (
            <Button
              aria-label="Generate preview for Custom style"
              disabled={actions.busy || !customPrompt.trim()}
              onClick={() => actions.onPreview(style.id)}
              size="icon-xs"
              title={
                customPrompt.trim()
                  ? "Render the custom style preview with seed 0 and current Creator settings"
                  : "Enter a custom style prompt before generating its preview"
              }
              variant="outline"
            >
              <ImagePlay />
            </Button>
          ) : null}
        </div>
      ) : null}
      {user ? (
        <Button
          aria-label={`Delete ${style.label}`}
          className="absolute top-1 right-1"
          disabled={actions.busy}
          onClick={() => actions.onDelete(style)}
          size="icon-xs"
          title="Delete style"
          variant="destructive"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

function DeleteStyleDialog({
  onClose,
  onDeleted,
  style,
}: {
  onClose: () => void;
  onDeleted: () => void;
  style: LibraryStyle;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteStyle(style.id);
      onDeleted();
    } catch (reason) {
      setError(`Cannot delete style: ${errorText(reason)}`);
      setBusy(false);
    }
  };
  return (
    <Dialog onOpenChange={(open) => !(open || busy) && onClose()} open={true}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete style</DialogTitle>
          <DialogDescription>
            Delete “{style.label}”? Its saved style and preview will be
            permanently removed.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={busy} onClick={remove} variant="destructive">
            {busy ? <Loader2 className="animate-spin" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StyleEditor({
  draft: initial,
  onBack,
  onSaved,
  onStored,
  progress,
}: {
  draft: StyleDraft;
  onBack: () => void;
  /** "Save style" finished; the library closes. */
  onSaved: () => void;
  /** "Generate preview" saved the draft; the editor continues on the stored style. */
  onStored: (draft: StyleDraft) => void;
  progress: StylePreviewProgress | null;
}) {
  const styles = useCreatorStore((store) => store.styles);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const baseId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const running = isRunning(progress);
  const disabled = busy || running;
  const image = draft.id ? findStyle(styles, draft.id)?.image : undefined;
  const ownProgress =
    draft.id && progress?.styleId === draft.id ? progress : null;

  const setField = (key: StyleTextField, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const commit = async (preview: boolean) => {
    if (disabled) {
      return;
    }
    const problem = validateStyleDraft(draft);
    if (problem) {
      setError(`Cannot save style: ${problem}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await saveStyle(draft);
      if (!mounted.current) {
        return;
      }
      setDraft(styleDraft(saved));
      if (!preview) {
        onSaved();
        return;
      }
      setBusy(false);
      // Start the render before onStored re-keys this editor to the saved id.
      const render = renderStylePreview(saved.id);
      onStored(styleDraft(saved));
      await render;
    } catch (reason) {
      if (mounted.current) {
        setError(`Cannot save style: ${errorText(reason)}`);
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  return (
    <form
      aria-label={draft.id ? "Edit your style" : "Create your style"}
      className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1"
      onSubmit={(event) => {
        event.preventDefault();
        commit(false);
      }}
    >
      <div className="flex items-center gap-3">
        <span className="relative size-28 shrink-0 overflow-hidden rounded-md">
          <StylePreview className="size-full" image={image} />
          {draft.id ? (
            <PreviewProgressOverlay progress={progress} styleId={draft.id} />
          ) : null}
        </span>
        <p className="text-muted-foreground text-sm">
          {ownProgress?.message ??
            "Generate preview saves the style, then renders its portrait with seed 0 and the current Creator settings."}
        </p>
      </div>
      {STYLE_FIELDS.map((field, index) => {
        const id = `${baseId}-${field.key}`;
        const props = {
          disabled: busy,
          id,
          maxLength: STYLE_LIMITS[field.key],
          required: field.required,
          value: draft[field.key],
        };
        return (
          <div className="flex flex-col gap-1.5" key={field.key}>
            <Label htmlFor={id}>{field.label}</Label>
            {field.key === "prompt" ? (
              <Textarea
                {...props}
                onChange={(event) => setField(field.key, event.target.value)}
                rows={8}
              />
            ) : (
              <Input
                {...props}
                autoFocus={index === 0}
                onChange={(event) => setField(field.key, event.target.value)}
              />
            )}
          </div>
        );
      })}
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled} type="submit">
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save style
        </Button>
        <Button
          disabled={disabled}
          onClick={() => commit(true)}
          title="Save this style and render only its portrait preview with seed 0 and current Creator settings."
          type="button"
          variant="outline"
        >
          {running ? <Loader2 className="animate-spin" /> : <ImagePlay />}
          Generate preview
        </Button>
        <Button
          disabled={busy}
          onClick={onBack}
          type="button"
          variant="outline"
        >
          Back to library
        </Button>
      </div>
    </form>
  );
}

function useLibraryRefresh() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    clearStylePreviewStatus();
    refreshStyleLibrary()
      .catch((reason) => {
        if (active) {
          setError(
            `Cannot refresh styles: ${errorText(reason)}. Showing cached library.`
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return { error, loading };
}

function libraryStatus(
  count: number,
  progress: StylePreviewProgress | null,
  notice: string | null,
  refreshError: string | null
): string {
  if (progress) {
    return progress.message;
  }
  if (notice) {
    return notice;
  }
  if (refreshError) {
    return refreshError;
  }
  return count ? `${count} styles` : "No matching styles";
}

/** The style library: pick a style, or create, edit, delete and preview user styles. */
export function StyleDialog({ onClose }: { onClose: () => void }) {
  const styles = useCreatorStore((store) => store.styles);
  const info = useCreatorStore((store) => store.state?.character_info);
  const progress = useCreatorStore((store) => store.stylePreview);
  const current = resolveStyleId(styles, info?.style);
  const customPrompt = info?.custom_style || "";
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [cardScale, setCardScale] = useState(CARD_SCALE.initial);
  const [editing, setEditing] = useState<StyleDraft | null>(null);
  const [deleting, setDeleting] = useState<LibraryStyle | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useLibraryRefresh();
  const running = isRunning(progress);
  useComfyEvent("vnccs.style_preview.stage", handleStylePreviewStage);

  const entries = useMemo(
    () => filterStyles(styles, query, group),
    [styles, query, group]
  );
  const groupLabels = styles.groups.map((item) => item.label);

  const close = () => {
    if (running) {
      toast.info("Stopping after the current image is saved...");
    }
    onClose();
  };

  const actions: CardActions = {
    busy: running || deleting !== null,
    onDelete: (style) => {
      if (!(refresh.loading || running || deleting)) {
        setDeleting(style);
      }
    },
    onEdit: (draft) => {
      setNotice(null);
      clearStylePreviewStatus();
      setEditing(draft);
    },
    onPreview: (id) => {
      if (canRenderStylePreview(id)) {
        renderStylePreview(id);
      }
    },
    onSelect: (id) => {
      selectStyle(id);
      onClose();
    },
  };

  let status = libraryStatus(
    entries.length,
    progress,
    notice,
    refresh.loading ? null : refresh.error
  );
  if (editing) {
    status = editing.id ? "Edit your style" : "Create your style";
  } else if (refresh.loading && !progress) {
    status = "Loading styles...";
  }

  return (
    <Dialog onOpenChange={(open) => !open && close()} open={true}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Style library</DialogTitle>
          <DialogDescription aria-live="polite" role="status">
            {status}
          </DialogDescription>
        </DialogHeader>
        {editing ? (
          <StyleEditor
            draft={editing}
            key={editing.id ?? "new"}
            onBack={() => {
              setEditing(null);
              clearStylePreviewStatus();
            }}
            onSaved={onClose}
            onStored={setEditing}
            progress={progress}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Search styles"
                autoFocus={true}
                className="min-w-48 flex-1"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search styles..."
                value={query}
              />
              <select
                aria-label="Style category"
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                onChange={(event) => setGroup(event.target.value)}
                value={groupLabels.includes(group) ? group : ""}
              >
                <option value="">All styles</option>
                {groupLabels.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
              <Button
                disabled={actions.busy}
                onClick={() => actions.onEdit(styleDraft())}
                variant="outline"
              >
                <Plus />
                New style
              </Button>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Card size</span>
              <Slider
                aria-label="Style card size"
                aria-valuetext={`${cardScale}%`}
                className="max-w-56"
                max={CARD_SCALE.max}
                min={CARD_SCALE.min}
                onValueChange={([value]) =>
                  setCardScale(value ?? CARD_SCALE.initial)
                }
                step={CARD_SCALE.step}
                value={[cardScale]}
              />
              <output className="w-12 text-muted-foreground tabular-nums">
                {cardScale}%
              </output>
            </div>
            <div
              className="grid max-h-[60vh] gap-3 overflow-y-auto pr-1"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${(CARD_BASE_PX * cardScale) / 100}px, 1fr))`,
              }}
            >
              {entries.map((style) => (
                <StyleCard
                  actions={actions}
                  customPrompt={customPrompt}
                  key={style.id}
                  progress={progress}
                  selected={style.id === current}
                  style={style}
                />
              ))}
            </div>
          </>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <span className="truncate text-muted-foreground text-xs">
            {styles.preview_directory
              ? `Preview folder: ${styles.preview_directory}`
              : null}
          </span>
          <Button
            onClick={close}
            title="Close the library and stop after the current preview"
            variant="outline"
          >
            Close
          </Button>
        </DialogFooter>
        {deleting ? (
          <DeleteStyleDialog
            onClose={() => setDeleting(null)}
            onDeleted={() => {
              setNotice(`Deleted: ${deleting.label}`);
              setDeleting(null);
            }}
            style={deleting}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
