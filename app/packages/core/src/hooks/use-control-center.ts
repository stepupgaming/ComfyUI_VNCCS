"use client";

import { studioHttp } from "@workspace/core/lib/studio";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import {
  type CatalogEntry,
  type DownloadCategory,
  type DownloadStatusMap,
  downloadKey,
  fetchDownloadStatus,
  fetchModuleStatus,
  fetchSamplerLists,
  type ModuleStatus,
  requestDownload,
  type SamplerLists,
} from "@workspace/vnccs/control-center";
import {
  type ControlCenterModel,
  DEFAULT_SAMPLERS,
  DEFAULT_SCHEDULERS,
  viewNodeState,
} from "@workspace/vnccs/control-center-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const DOWNLOAD_POLL_MS = 2000;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Load the catalog once ComfyUI is online, and again when the repo or address changes. */
export function useCatalog() {
  const online = useConnectionStore((state) => state.status === "online");
  const comfyUrl = useSettingsStore((state) => state.comfyUrl);
  const repoId = useControlCenterStore((state) => state.repoId);
  const loadCatalog = useControlCenterStore((state) => state.loadCatalog);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload per address and repo
  useEffect(() => {
    if (online) {
      loadCatalog();
    }
  }, [online, comfyUrl, repoId, loadCatalog]);
}

/**
 * The node_state as the widget rendered it: a private copy with the shown
 * variant pinned, so reads match what the next user action will save.
 */
export function useControlCenterModel(): ControlCenterModel {
  const nodeState = useControlCenterStore((state) => state.nodeState);
  const catalog = useControlCenterStore((state) => state.catalog);
  return useMemo(() => {
    const model = viewNodeState(nodeState, catalog);
    if (catalog) {
      model.reconcileVariant();
    }
    return model;
  }, [nodeState, catalog]);
}

function finished(previous: DownloadStatusMap, next: DownloadStatusMap) {
  return Object.entries(next).some(
    ([key, state]) =>
      state.status === "success" && previous[key]?.status !== "success"
  );
}

/**
 * Mirror the server's download queue every 2 s. A download that just
 * finished triggers a catalog refresh, since only the catalog says whether
 * the file is really installed.
 */
export function useDownloadPolling() {
  const online = useConnectionStore((state) => state.status === "online");

  useEffect(() => {
    if (!online) {
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await fetchDownloadStatus(studioHttp());
        const store = useControlCenterStore.getState();
        const refresh = finished(store.downloads, next);
        store.setDownloads(next);
        if (refresh) {
          await store.loadCatalog();
        }
      } catch {
        // The connection monitor reports outages.
      }
      if (active) {
        timer = setTimeout(tick, DOWNLOAD_POLL_MS);
      }
    };
    tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [online]);
}

/** Queue one catalog download through the guard, showing failures as toasts. */
export function useDownload() {
  return useCallback(
    async (category: DownloadCategory, entry: CatalogEntry) => {
      const { catalog, repoId, setDownload } = useControlCenterStore.getState();
      if (!catalog) {
        return false;
      }
      const key = downloadKey(category, entry.name);
      setDownload(key, { status: "queued", message: "Queued…" });
      try {
        await requestDownload(
          studioHttp(),
          repoId,
          catalog,
          category,
          entry.name
        );
        return true;
      } catch (error) {
        setDownload(key, { status: "error", message: message(error) });
        toast.error(`Could not download ${entry.name}`, {
          description: message(error),
        });
        return false;
      }
    },
    []
  );
}

let samplerCache: SamplerLists | null = null;

/** Sampler and scheduler names from the live KSampler schema, with the widget's fallbacks. */
export function useSamplerLists(): SamplerLists {
  const online = useConnectionStore((state) => state.status === "online");
  const [lists, setLists] = useState<SamplerLists>(
    samplerCache ?? {
      samplers: DEFAULT_SAMPLERS,
      schedulers: DEFAULT_SCHEDULERS,
    }
  );

  useEffect(() => {
    if (!online || samplerCache) {
      return;
    }
    let active = true;
    fetchSamplerLists(studioHttp()).then((live) => {
      if (live) {
        samplerCache = live;
        if (active) {
          setLists(live);
        }
      }
    });
    return () => {
      active = false;
    };
  }, [online]);

  return lists;
}

export function useModuleStatus() {
  const online = useConnectionStore((state) => state.status === "online");
  const [status, setStatus] = useState<ModuleStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchModuleStatus(studioHttp()));
      setError(null);
    } catch (reason) {
      setError(message(reason));
    }
  }, []);

  useEffect(() => {
    if (online) {
      refresh();
    }
  }, [online, refresh]);

  return { status, error, refresh };
}
