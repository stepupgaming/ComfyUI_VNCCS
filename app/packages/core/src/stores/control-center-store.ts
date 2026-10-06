import { studioHttp } from "@workspace/core/lib/studio";
import {
  type ControlCenterCatalog,
  type DownloadState,
  type DownloadStatusMap,
  fetchCatalog,
} from "@workspace/vnccs/control-center";
import {
  type ControlCenterModel,
  type NodeState,
  parseNodeState,
  updateNodeState,
} from "@workspace/vnccs/control-center-state";
import { DEFAULT_REPO_ID } from "@workspace/vnccs/graphs";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ControlCenterState {
  catalog: ControlCenterCatalog | null;
  catalogError: string | null;
  /** Live download phases from /vnccs/manager/status, keyed by `cc_<category>_<name>`. */
  downloads: DownloadStatusMap;
  loadCatalog: (options?: { force?: boolean }) => Promise<void>;
  loadingCatalog: boolean;
  /** The Control Center node_state every workflow the studio queues carries. */
  nodeState: NodeState;
  repoId: string;
  setDownload: (key: string, state: DownloadState) => void;
  setDownloads: (downloads: DownloadStatusMap) => void;
  setNodeState: (state: NodeState) => void;
  setRepoId: (repoId: string) => void;
  update: (mutate: (model: ControlCenterModel) => void) => void;
}

const inFlight = new Map<string, Promise<ControlCenterCatalog>>();

export const useControlCenterStore = create<ControlCenterState>()(
  persist(
    (set, get) => ({
      catalog: null,
      catalogError: null,
      downloads: {},
      loadingCatalog: false,
      nodeState: {},
      repoId: DEFAULT_REPO_ID,

      async loadCatalog(options = {}) {
        const { repoId } = get();
        const key = `${repoId}\n${options.force ? "force" : ""}`;
        set({ loadingCatalog: true });
        let request = inFlight.get(key);
        if (!request) {
          request = fetchCatalog(studioHttp(), repoId, options).finally(() =>
            inFlight.delete(key)
          );
          inFlight.set(key, request);
        }
        try {
          const catalog = await request;
          if (get().repoId === repoId) {
            set({ catalog, catalogError: null, loadingCatalog: false });
          }
        } catch (error) {
          set({
            catalogError:
              error instanceof Error ? error.message : String(error),
            loadingCatalog: false,
          });
        }
      },

      setDownload: (key, state) =>
        set({ downloads: { ...get().downloads, [key]: state } }),
      setDownloads: (downloads) => set({ downloads }),
      setNodeState: (nodeState) =>
        set({ nodeState: parseNodeState(nodeState) }),
      setRepoId(repoId) {
        const next = repoId.trim();
        if (next && next !== get().repoId) {
          set({ repoId: next, catalog: null, catalogError: null });
        }
      },
      update(mutate) {
        const { catalog, nodeState } = get();
        if (catalog) {
          set({ nodeState: updateNodeState(nodeState, catalog, mutate) });
        }
      },
    }),
    {
      name: "vnccs-studio-control-center",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ nodeState, repoId }) => ({ nodeState, repoId }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ControlCenterState>;
        return {
          ...current,
          repoId: saved.repoId || current.repoId,
          nodeState: parseNodeState(saved.nodeState ?? {}),
        };
      },
    }
  )
);
