"use client";

import { SpritePreviewFrame } from "@workspace/core/components/common/sprite-preview-frame";
import { useEmotionUpdate } from "@workspace/core/hooks/use-emotions";
import {
  refreshCharacterList,
  selectCharacter,
  stepSprite,
} from "@workspace/core/lib/emotion-actions";
import { useEmotionStore } from "@workspace/core/stores/emotion-store";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { cn } from "@workspace/ui/lib/utils";
import type { EmotionStudioModel } from "@workspace/vnccs/emotion-state";

/** The "Generate poses" chips: which of the character's pose sprites get emotions. */
function PoseSelection({ model }: { model: EmotionStudioModel }) {
  const update = useEmotionUpdate();
  const count = model.context.poseCount;
  const loading = useEmotionStore((store) => store.preview.loading);
  let summary = model.poseSummary();
  if (count <= 0 && loading) {
    summary = "Loading...";
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm">Generate poses</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {summary}
        </span>
      </div>
      {count > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: count }, (_, item) => item + 1).map((index) => {
            const selected = model.isPoseSelected(index);
            return (
              <button
                aria-label={`Pose ${index}`}
                aria-pressed={selected}
                className={cn(
                  "min-w-8 rounded-md border px-2 py-1 font-medium text-xs tabular-nums transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:border-primary/60 hover:text-foreground"
                )}
                key={index}
                onClick={() => update((next) => next.togglePose(index))}
                type="button"
              >
                {index}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={count <= 0}
          onClick={() => update((next) => next.selectAllPoses())}
          size="sm"
          variant="outline"
        >
          SELECT ALL
        </Button>
        <Button
          disabled={count <= 0}
          onClick={() => update((next) => next.clearAllPoses())}
          size="sm"
          variant="outline"
        >
          CLEAR ALL
        </Button>
      </div>
    </div>
  );
}

/** Character select, its preview and the pose chips: the widget's left column. */
export function CharacterColumn({ model }: { model: EmotionStudioModel }) {
  const characters = useEmotionStore((store) => store.characters);
  const preview = useEmotionStore((store) => store.preview);
  const character = model.state.character;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-sm">Character select</h3>
      <Select
        disabled={characters.length === 0}
        onOpenChange={(open) => {
          if (open) {
            refreshCharacterList();
          }
        }}
        onValueChange={selectCharacter}
        value={character || ""}
      >
        <SelectTrigger aria-label="Character" className="w-full">
          <SelectValue placeholder="No characters" />
        </SelectTrigger>
        <SelectContent>
          {characters.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SpritePreviewFrame onStep={stepSprite} state={preview} />
      <PoseSelection model={model} />
    </div>
  );
}
