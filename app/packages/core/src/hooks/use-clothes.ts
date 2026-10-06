"use client";

import { useClothesStore } from "@workspace/core/stores/clothes-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  type ClothesModel,
  clothesContext,
  viewClothesState,
} from "@workspace/vnccs/clothes-state";
import { useMemo } from "react";

/** A read-only Clothes Designer model over the current state; null until init ran. */
export function useClothesModel(): ClothesModel | null {
  const state = useClothesStore((store) => store.state);
  const nodeState = useControlCenterStore((store) => store.nodeState);
  const catalog = useControlCenterStore((store) => store.catalog);
  return useMemo(
    () =>
      state
        ? viewClothesState(state, clothesContext(nodeState, catalog))
        : null,
    [state, nodeState, catalog]
  );
}

export function useClothesUi() {
  return useClothesStore((store) => store.ui);
}
