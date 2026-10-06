import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import type { ContextLists } from "@workspace/vnccs/creator";
import {
  localAssetsFrom,
  NO_LOCAL_ASSETS,
} from "@workspace/vnccs/creator-state";
import {
  type EmotionContext,
  type EmotionStudioModel,
  type EmotionStudioState,
  serializeEmotionStudioState,
  updateEmotionStudioState,
  viewEmotionStudioState,
} from "@workspace/vnccs/emotion-state";
import type { EmotionEntry } from "@workspace/vnccs/emotions";
import {
  emptySpritePreview,
  type SpritePreviewState,
} from "@workspace/vnccs/sprite-preview";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface EmotionStoreState {
  /** `/vnccs/list_characters`. */
  characters: string[];
  /** Costumes of the current character with source sprites. */
  costumes: string[];
  /** The flat `/vnccs/get_emotions` list plus custom emotions saved here. */
  emotions: EmotionEntry[];
  lists: ContextLists | null;
  loadError: string | null;
  /** Pose sprites the preview counted for the character. */
  poseCount: number;
  preview: SpritePreviewState;
  search: string;
  set: (patch: Partial<EmotionStoreState>) => void;
  setState: (state: EmotionStudioState) => void;
  /** Null until the init sequence ran against the live server. */
  state: EmotionStudioState | null;
  update: (mutate: (model: EmotionStudioModel) => void) => void;
  /** The serialized studio state as last saved, restored on the next start. */
  widgetData: string | null;
}

export function buildEmotionContext(sources: {
  catalog: EmotionContext["catalog"];
  downloads: EmotionContext["downloads"];
  lists: ContextLists | null;
  poseCount: number;
}): EmotionContext {
  return {
    catalog: sources.catalog,
    downloads: sources.downloads,
    local: sources.lists ? localAssetsFrom(sources.lists) : NO_LOCAL_ASSETS,
    poseCount: sources.poseCount,
  };
}

/** What the studio model reads besides its own state: catalog, downloads, local files and poses. */
export function emotionContext(): EmotionContext {
  const { catalog, downloads } = useControlCenterStore.getState();
  const { lists, poseCount } = useEmotionStore.getState();
  return buildEmotionContext({ catalog, downloads, lists, poseCount });
}

export function currentEmotionModel(): EmotionStudioModel | null {
  const { state } = useEmotionStore.getState();
  return state ? viewEmotionStudioState(state, emotionContext()) : null;
}

export const useEmotionStore = create<EmotionStoreState>()(
  persist(
    (set, get) => ({
      characters: [],
      costumes: [],
      emotions: [],
      lists: null,
      loadError: null,
      poseCount: 0,
      preview: emptySpritePreview(),
      search: "",
      state: null,
      widgetData: null,

      set: (patch) => set(patch),
      setState: (state) =>
        set({ state, widgetData: serializeEmotionStudioState(state) }),
      update(mutate) {
        const { state } = get();
        if (state) {
          get().setState(
            updateEmotionStudioState(state, emotionContext(), mutate)
          );
        }
      },
    }),
    {
      name: "vnccs-studio-emotions",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ widgetData }) => ({ widgetData }),
    }
  )
);
