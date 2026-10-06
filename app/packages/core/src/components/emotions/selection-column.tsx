"use client";

import { SwitchField } from "@workspace/core/components/common/form-fields";
import { RemoteImage } from "@workspace/core/components/common/remote-image";
import {
  CustomEmotionDialog,
  SelectVisibleDialog,
} from "@workspace/core/components/emotions/emotion-dialogs";
import { useEmotionUpdate } from "@workspace/core/hooks/use-emotions";
import { studioHttp } from "@workspace/core/lib/studio";
import { useEmotionStore } from "@workspace/core/stores/emotion-store";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import {
  type EmotionStudioModel,
  filterEmotions,
  selectAllButton,
  selectedEmotionEntries,
  selectVisibleSummary,
} from "@workspace/vnccs/emotion-state";
import { type EmotionEntry, emotionImageUrl } from "@workspace/vnccs/emotions";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

function CostumeList({ model }: { model: EmotionStudioModel }) {
  const update = useEmotionUpdate();
  const costumes = useEmotionStore((store) => store.costumes);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">Selected costumes</h3>
      {costumes.length ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          {costumes.map((costume) => (
            <SwitchField
              checked={model.isCostumeSelected(costume)}
              key={costume}
              label={costume}
              onChange={(checked) =>
                update((next) => next.setCostume(costume, checked))
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No costumes found.</p>
      )}
    </div>
  );
}

/** An emotion with its reference image; clicking toggles it. */
function EmotionCard({
  compact = false,
  emotion,
  selected,
}: {
  compact?: boolean;
  emotion: EmotionEntry;
  selected: boolean;
}) {
  const update = useEmotionUpdate();
  const [failed, setFailed] = useState(false);
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border p-1.5 text-left transition-colors hover:border-primary/60",
        selected && "border-primary bg-primary/5",
        compact ? "w-20" : "w-full"
      )}
      onClick={() => update((next) => next.toggleEmotion(emotion.safe_name))}
      title={emotion.description || undefined}
      type="button"
    >
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-muted/40">
        {failed ? (
          <span className="text-muted-foreground text-xs">No Image</span>
        ) : (
          <RemoteImage
            className="size-full object-cover"
            loading="lazy"
            onError={() => setFailed(true)}
            src={emotionImageUrl(studioHttp(), emotion.safe_name)}
          />
        )}
      </div>
      <span className="w-full truncate text-center text-xs">
        {emotion.safe_name}
      </span>
    </button>
  );
}

function SelectedEmotions({
  emotions,
  model,
}: {
  emotions: EmotionEntry[];
  model: EmotionStudioModel;
}) {
  const [adding, setAdding] = useState(false);
  const selected = model.state.emotions;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">
        Selected emotions ({selected.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          className="flex w-20 flex-col items-center gap-1 rounded-lg border border-dashed p-1.5 text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          onClick={() => setAdding(true)}
          title="Add Custom Emotion"
          type="button"
        >
          <span className="flex aspect-square w-full items-center justify-center rounded-md bg-muted/40">
            <Plus className="size-6" />
          </span>
          <span className="w-full text-center text-xs leading-tight">
            Add Custom Emotion
          </span>
        </button>
        {selected.length ? (
          selectedEmotionEntries(emotions, selected).map((emotion) => (
            <EmotionCard
              compact
              emotion={emotion}
              key={emotion.safe_name}
              selected
            />
          ))
        ) : (
          <p className="self-center text-muted-foreground text-xs">
            No emotions selected
          </p>
        )}
      </div>
      {adding ? <CustomEmotionDialog onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function EmotionGrid({
  emotions,
  model,
}: {
  emotions: EmotionEntry[];
  model: EmotionStudioModel;
}) {
  const update = useEmotionUpdate();
  const search = useEmotionStore((store) => store.search);
  const setStore = useEmotionStore((store) => store.set);
  const [confirm, setConfirm] = useState<string | null>(null);
  const filtered = useMemo(
    () => filterEmotions(emotions, search),
    [emotions, search]
  );
  const selected = model.state.emotions;
  const button = selectAllButton(filtered, selected);
  const visible = filtered.map((emotion) => emotion.safe_name);

  const onSelectAll = () => {
    if (button.action === "cancel") {
      update((next) => next.deselectEmotions(visible));
    } else if (button.action === "select") {
      setConfirm(
        selectVisibleSummary(
          filtered.length,
          (model.state.costumes ?? []).length,
          model.selectedPoseCount()
        )
      );
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search emotions"
          className="pl-8"
          onChange={(event) => setStore({ search: event.target.value })}
          placeholder="Search emotions (name or description)..."
          value={search}
        />
      </div>
      <div className="grid max-h-[32rem] grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2 overflow-y-auto rounded-lg border p-2">
        {filtered.map((emotion) => (
          <EmotionCard
            emotion={emotion}
            key={emotion.safe_name}
            selected={selected.includes(emotion.safe_name)}
          />
        ))}
      </div>
      <Button
        disabled={button.disabled}
        onClick={onSelectAll}
        variant={button.action === "cancel" ? "outline" : "default"}
      >
        {button.label}
      </Button>
      {confirm ? (
        <SelectVisibleDialog
          message={confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => update((next) => next.selectEmotions(visible))}
        />
      ) : null}
    </div>
  );
}

/** Costumes, the selected emotions and the emotion list: the widget's middle column. */
export function SelectionColumn({ model }: { model: EmotionStudioModel }) {
  const emotions = useEmotionStore((store) => store.emotions);
  return (
    <div className="flex flex-col gap-4">
      <CostumeList model={model} />
      <SelectedEmotions emotions={emotions} model={model} />
      <EmotionGrid emotions={emotions} model={model} />
    </div>
  );
}
