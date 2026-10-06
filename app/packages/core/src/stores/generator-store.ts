import {
  type GeneratorData,
  type GeneratorKind,
  type GeneratorView,
  type NodeSchemas,
  parseGeneratorData,
  type SeedvrCatalog,
  type SeedvrDownloads,
} from "@workspace/vnccs/character-generator";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** One generator node of one workflow (Step 1 uses `base` on node 798). */
export interface GeneratorTarget {
  kind: GeneratorKind;
  nodeId: string;
}

export function targetKey(target: GeneratorTarget): string {
  return `${target.kind}:${target.nodeId}`;
}

interface GeneratorStoreState {
  /** widget_data per generator, keyed by {@link targetKey}. */
  data: Record<string, GeneratorData>;
  /** Live `/object_info` for the nodes the settings read; null until loaded. */
  schemas: NodeSchemas | null;
  seedvr: SeedvrCatalog | null;
  seedvrDownloads: SeedvrDownloads;
  set: (patch: Partial<GeneratorStoreState>) => void;
  setData: (key: string, data: GeneratorData) => void;
  setView: (key: string, view: GeneratorView) => void;
  /** Stage results shown for each generator; rebuilt from server progress. */
  views: Record<string, GeneratorView>;
  /** Stands in for the graph's `extra.vnccs_workflow_id` in progress scopes. */
  workflowId: string;
}

function newWorkflowId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

export const useGeneratorStore = create<GeneratorStoreState>()(
  persist(
    (set, get) => ({
      data: {},
      schemas: null,
      seedvr: null,
      seedvrDownloads: {},
      views: {},
      workflowId: newWorkflowId(),

      set: (patch) => set(patch),
      setData: (key, data) => set({ data: { ...get().data, [key]: data } }),
      setView: (key, view) => set({ views: { ...get().views, [key]: view } }),
    }),
    {
      name: "vnccs-studio-generators",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ data, workflowId }) => ({ data, workflowId }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<GeneratorStoreState>;
        const data = Object.fromEntries(
          Object.entries(saved.data ?? {}).map(([key, value]) => [
            key,
            parseGeneratorData(value),
          ])
        );
        return {
          ...current,
          data,
          workflowId: saved.workflowId || current.workflowId,
        };
      },
    }
  )
);
