import type { RuntimeStatus } from "@workspace/core/lib/tauri";
import type { QueueCounts, SystemStats } from "@workspace/vnccs/system";
import { create } from "zustand";

export type ConnectionStatus = "checking" | "online" | "offline";

interface ConnectionState {
  error: string | null;
  queue: QueueCounts;
  /** Runtime launched by the desktop app; null outside Tauri. */
  runtime: RuntimeStatus | null;
  status: ConnectionStatus;
  system: SystemStats | null;
}

export const useConnectionStore = create<ConnectionState>()(() => ({
  error: null,
  queue: { pending: 0, running: 0 },
  runtime: null,
  status: "checking",
  system: null,
}));
