import type { MigrationRun, MigrationScan } from "@workspace/vnccs/migration";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface MigrationStore {
  /** A scan, start or status request is in flight, or a job is being followed. */
  busy: boolean;
  /** The Repair Sprites confirmation is open. */
  confirmRepair: boolean;
  /** The log pane text. */
  log: string;
  run: MigrationRun | null;
  /** The job being followed; persisted so leaving and returning resumes polling. */
  runId: string;
  scan: MigrationScan | null;
  selected: string[];
  set: (patch: Partial<MigrationStore>) => void;
  /** The last status request failed while a job may still be running. */
  statusFailed: boolean;
}

export const useMigrationStore = create<MigrationStore>()(
  persist(
    (set) => ({
      busy: false,
      confirmRepair: false,
      log: "Ready.",
      run: null,
      runId: "",
      scan: null,
      selected: [],
      set: (patch) => set(patch),
      statusFailed: false,
    }),
    {
      name: "vnccs-studio-migration",
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ runId }) => ({ runId }),
    }
  )
);
