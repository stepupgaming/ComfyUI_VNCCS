import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import type { PresetCatalog } from "@workspace/vnccs/character-presets";
import {
  defaultStyleId,
  EMPTY_STYLE_CATALOG,
  type StyleCatalog,
} from "@workspace/vnccs/character-styles";
import type { ContextLists } from "@workspace/vnccs/creator";
import {
  type CreatorContext,
  type CreatorModel,
  type CreatorState,
  localAssetsFrom,
  NO_LOCAL_ASSETS,
  serializeCreatorState,
  updateCreatorState,
  viewCreatorState,
} from "@workspace/vnccs/creator-state";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface CreatorPreview {
  loading: boolean;
  /** Shown instead of an image. */
  message: string;
  url: string | null;
}

interface CreatorStoreState {
  lists: ContextLists | null;
  loadError: string | null;
  patchState: (mutate: (state: CreatorState) => void) => void;
  presets: PresetCatalog | null;
  preview: CreatorPreview;
  previewRunning: boolean;
  set: (patch: Partial<CreatorStoreState>) => void;
  setPreview: (patch: Partial<CreatorPreview>) => void;
  setState: (state: CreatorState) => void;
  /** Null until the init sequence ran against the live server. */
  state: CreatorState | null;
  styles: StyleCatalog;
  update: (
    mutate: (model: CreatorModel) => void,
    options?: { previewValid?: boolean }
  ) => void;
  /** widget_data as last saved, restored on the next start. */
  widgetData: string | null;
}

export function buildCreatorContext(sources: {
  catalog: CreatorContext["catalog"];
  downloads: CreatorContext["downloads"];
  lists: ContextLists | null;
  styles: StyleCatalog;
}): CreatorContext {
  return {
    catalog: sources.catalog,
    defaultStyle: defaultStyleId(sources.styles),
    downloads: sources.downloads,
    local: sources.lists ? localAssetsFrom(sources.lists) : NO_LOCAL_ASSETS,
  };
}

/** What the Creator model reads besides its own state: catalog, downloads and local files. */
export function creatorContext(): CreatorContext {
  const { catalog, downloads } = useControlCenterStore.getState();
  const { lists, styles } = useCreatorStore.getState();
  return buildCreatorContext({ catalog, downloads, lists, styles });
}

export function currentCreatorModel(): CreatorModel | null {
  const { state } = useCreatorStore.getState();
  return state ? viewCreatorState(state, creatorContext()) : null;
}

export const useCreatorStore = create<CreatorStoreState>()(
  persist(
    (set, get) => ({
      lists: null,
      loadError: null,
      presets: null,
      preview: {
        loading: false,
        message: "Create a character to begin",
        url: null,
      },
      previewRunning: false,
      state: null,
      styles: EMPTY_STYLE_CATALOG,
      widgetData: null,

      set: (patch) => set(patch),
      setPreview: (patch) => set({ preview: { ...get().preview, ...patch } }),
      setState: (state) =>
        set({ state, widgetData: serializeCreatorState(state) }),
      // Transient fields the widget changed without saving (sprite counters).
      patchState(mutate) {
        const { state } = get();
        if (state) {
          const next = structuredClone(state);
          mutate(next);
          set({ state: next, widgetData: serializeCreatorState(next) });
        }
      },
      update(mutate, options) {
        const { state } = get();
        if (state) {
          get().setState(
            updateCreatorState(state, creatorContext(), mutate, options)
          );
        }
      },
    }),
    {
      name: "vnccs-studio-creator",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ widgetData }) => ({ widgetData }),
    }
  )
);
