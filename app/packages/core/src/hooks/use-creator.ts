"use client";

import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  buildCreatorContext,
  useCreatorStore,
} from "@workspace/core/stores/creator-store";
import {
  type CreatorModel,
  viewCreatorState,
} from "@workspace/vnccs/creator-state";
import { useMemo } from "react";

/** A read-only Creator model over the current state; null until init ran. */
export function useCreatorModel(): CreatorModel | null {
  const state = useCreatorStore((store) => store.state);
  const lists = useCreatorStore((store) => store.lists);
  const styles = useCreatorStore((store) => store.styles);
  const catalog = useControlCenterStore((store) => store.catalog);
  const downloads = useControlCenterStore((store) => store.downloads);
  return useMemo(
    () =>
      state
        ? viewCreatorState(
            state,
            buildCreatorContext({ catalog, downloads, lists, styles })
          )
        : null,
    [state, catalog, downloads, lists, styles]
  );
}

export function useCreatorUpdate() {
  return useCreatorStore((store) => store.update);
}
