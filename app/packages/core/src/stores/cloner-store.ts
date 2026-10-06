import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import type { TraitField } from "@workspace/vnccs/character-presets";
import {
  type ClonerContext,
  type ClonerModel,
  type ClonerState,
  clonerModelKind,
  serializeClonerState,
  updateClonerState,
  viewClonerState,
} from "@workspace/vnccs/cloner-state";
import {
  emptySpritePreview,
  type SpritePreviewState,
} from "@workspace/vnccs/sprite-preview";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ClonerAnalysisPhase = "idle" | "checking" | "analyzing";

/** The "Describe Your Character" prompt after an upload; `id` tells repeated prompts apart. */
export interface DescribePrompt {
  id: number;
}

/** A request to open one trait row's inline editor (Enter Manually opens Face). */
export interface TraitEditRequest {
  field: TraitField;
  id: number;
}

interface ClonerStoreState {
  analysis: ClonerAnalysisPhase;
  characters: string[];
  describe: DescribePrompt | null;
  editRequest: TraitEditRequest | null;
  loadError: string | null;
  /** The sprite navigator's state; shown while there is no reference image. */
  preview: SpritePreviewState;
  set: (patch: Partial<ClonerStoreState>) => void;
  setState: (state: ClonerState) => void;
  /** Null until the init sequence ran against the live server. */
  state: ClonerState | null;
  update: (mutate: (model: ClonerModel) => void) => void;
  uploading: boolean;
  /** widget_data as last saved, restored on the next start. */
  widgetData: string | null;
}

export function buildClonerContext(nodeState: unknown): ClonerContext {
  return { modelKind: clonerModelKind(nodeState) };
}

/** What the Cloner model reads besides its own state: the Control Center's model kind. */
export function clonerContext(): ClonerContext {
  return buildClonerContext(useControlCenterStore.getState().nodeState);
}

export function currentClonerModel(): ClonerModel | null {
  const { state } = useClonerStore.getState();
  return state ? viewClonerState(state, clonerContext()) : null;
}

export const useClonerStore = create<ClonerStoreState>()(
  persist(
    (set, get) => ({
      analysis: "idle",
      characters: [],
      describe: null,
      editRequest: null,
      loadError: null,
      preview: emptySpritePreview(),
      state: null,
      uploading: false,
      widgetData: null,

      set: (patch) => set(patch),
      setState: (state) =>
        set({ state, widgetData: serializeClonerState(state) }),
      update(mutate) {
        const { state } = get();
        if (state) {
          get().setState(updateClonerState(state, clonerContext(), mutate));
        }
      },
    }),
    {
      name: "vnccs-studio-cloner",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ widgetData }) => ({ widgetData }),
    }
  )
);
