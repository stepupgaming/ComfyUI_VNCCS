"use client";

import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  buildEmotionContext,
  useEmotionStore,
} from "@workspace/core/stores/emotion-store";
import {
  type EmotionStudioModel,
  viewEmotionStudioState,
} from "@workspace/vnccs/emotion-state";
import { useMemo } from "react";

/** A read-only Emotion Studio model over the current state; null until init ran. */
export function useEmotionModel(): EmotionStudioModel | null {
  const state = useEmotionStore((store) => store.state);
  const lists = useEmotionStore((store) => store.lists);
  const poseCount = useEmotionStore((store) => store.poseCount);
  const catalog = useControlCenterStore((store) => store.catalog);
  const downloads = useControlCenterStore((store) => store.downloads);
  return useMemo(
    () =>
      state
        ? viewEmotionStudioState(
            state,
            buildEmotionContext({ catalog, downloads, lists, poseCount })
          )
        : null,
    [state, catalog, downloads, lists, poseCount]
  );
}

export function useEmotionUpdate() {
  return useEmotionStore((store) => store.update);
}
