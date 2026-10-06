"use client";

import { useComfyEvent } from "@workspace/core/lib/comfy-events";
import {
  ensureGenerator,
  type GeneratorSources,
  generatorScope,
  loadGeneratorSupport,
  refreshGeneratorProgress,
  syncGenerator,
} from "@workspace/core/lib/generator-actions";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import {
  type GeneratorTarget,
  targetKey,
  useGeneratorStore,
} from "@workspace/core/stores/generator-store";
import {
  type GeneratorData,
  GeneratorModel,
  type GeneratorView,
  isRunActive,
} from "@workspace/vnccs/character-generator";
import { SOCKET_OPEN } from "@workspace/vnccs/events";
import { useEffect, useMemo } from "react";

const ACTIVE_POLL_MS = 1000;
const IDLE_POLL_MS = 10_000;

export interface GeneratorHandle {
  data: GeneratorData;
  model: GeneratorModel;
  target: GeneratorTarget;
  view: GeneratorView;
}

/**
 * One generator node on a page: creates its state on first use, loads the
 * live schemas, and follows its sources. Null until the state exists.
 */
export function useGenerator(
  kind: GeneratorTarget["kind"],
  nodeId: string,
  sources: GeneratorSources
): GeneratorHandle | null {
  const target = useMemo(() => ({ kind, nodeId }), [kind, nodeId]);
  const key = targetKey(target);
  const online = useConnectionStore((state) => state.status === "online");
  const data = useGeneratorStore((state) => state.data[key]);
  const view = useGeneratorStore((state) => state.views[key]);
  const { character, emotionMode, emotionPairs, nodeState, nsfw } = sources;
  // Pairs are rebuilt on every studio change; follow them by value.
  const pairsKey = emotionPairs ? JSON.stringify(emotionPairs) : "";

  useEffect(() => ensureGenerator(target), [target]);

  useEffect(() => {
    if (online) {
      loadGeneratorSupport(target);
    }
  }, [online, target]);

  useEffect(() => {
    syncGenerator(target, {
      character,
      emotionMode,
      emotionPairs: pairsKey ? JSON.parse(pairsKey) : undefined,
      nodeState,
      nsfw,
    });
  }, [target, character, emotionMode, pairsKey, nodeState, nsfw]);

  return useMemo(
    () =>
      data && view
        ? { data, model: new GeneratorModel(data, kind), target, view }
        : null,
    [data, kind, target, view]
  );
}

/**
 * Poll the server's progress snapshot: every second while a run is queued
 * or a stage runs, every 10 s otherwise, and at once on a stage event or a
 * reconnect.
 */
export function useGeneratorProgress(
  target: GeneratorTarget,
  queued: boolean
): void {
  const key = targetKey(target);
  const online = useConnectionStore((state) => state.status === "online");
  const running = useGeneratorStore((state) => {
    const view = state.views[key];
    return view ? isRunActive(view) : false;
  });
  const fast = running || queued;

  useEffect(() => {
    if (!online) {
      return;
    }
    refreshGeneratorProgress(target);
    const timer = setInterval(
      () => refreshGeneratorProgress(target),
      fast ? ACTIVE_POLL_MS : IDLE_POLL_MS
    );
    return () => clearInterval(timer);
  }, [online, fast, target]);

  useComfyEvent(
    "vnccs.character_generator.stage",
    (event) => {
      const detail = event as { node_id?: unknown; scope?: unknown } | null;
      if (
        String(detail?.node_id ?? "") === target.nodeId &&
        (!detail?.scope || detail.scope === generatorScope(target))
      ) {
        refreshGeneratorProgress(target);
      }
    },
    online
  );
  useComfyEvent(SOCKET_OPEN, () => refreshGeneratorProgress(target), online);
}
