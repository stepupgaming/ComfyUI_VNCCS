import { type ClothesUi, emptyClothesUi } from "@workspace/vnccs/clothes";
import {
  type ClothesState,
  serializeClothesState,
} from "@workspace/vnccs/clothes-state";
import {
  emptySpritePreview,
  type SpritePreviewState,
} from "@workspace/vnccs/sprite-preview";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** A mirror of the Clothes Designer session; the session owns every change. */
interface ClothesStoreState {
  /** The sprite navigator's preview. */
  sprite: SpritePreviewState;
  /** Null until the context lists loaded. */
  state: ClothesState | null;
  ui: ClothesUi;
  /** widget_data as last saved, restored on the next start. */
  widgetData: string | null;
}

export const useClothesStore = create<ClothesStoreState>()(
  persist(
    (): ClothesStoreState => ({
      sprite: emptySpritePreview(),
      state: null,
      ui: emptyClothesUi(),
      widgetData: null,
    }),
    {
      name: "vnccs-studio-clothes",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ widgetData }) => ({ widgetData }),
    }
  )
);

export function mirrorClothesSnapshot(snapshot: {
  sprite: SpritePreviewState;
  state: ClothesState | null;
  ui: ClothesUi;
}): void {
  const current = useClothesStore.getState();
  const widgetData =
    snapshot.state && snapshot.state !== current.state
      ? serializeClothesState(snapshot.state)
      : current.widgetData;
  useClothesStore.setState({ ...snapshot, widgetData });
}
