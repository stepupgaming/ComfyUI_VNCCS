"use client";

import {
  buildClonerContext,
  useClonerStore,
} from "@workspace/core/stores/cloner-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  type ClonerModel,
  viewClonerState,
} from "@workspace/vnccs/cloner-state";
import { useMemo } from "react";

/** A read-only Cloner model over the current state; null until init ran. */
export function useClonerModel(): ClonerModel | null {
  const state = useClonerStore((store) => store.state);
  const nodeState = useControlCenterStore((store) => store.nodeState);
  return useMemo(
    () =>
      state ? viewClonerState(state, buildClonerContext(nodeState)) : null,
    [state, nodeState]
  );
}

export function useClonerUpdate() {
  return useClonerStore((store) => store.update);
}
