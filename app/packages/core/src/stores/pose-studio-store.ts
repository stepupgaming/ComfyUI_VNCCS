import type { PoseCharacter } from "@workspace/vnccs/pose-host";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface PoseHostStatus {
  error: string | null;
  /** The page answered the handshake, so the extension is loading or loaded. */
  loaded: boolean;
  nodeId: string;
  /** The widget exists and listens for server events, so runs can capture. */
  ready: boolean;
}

interface PoseStudioState {
  /** Creator V2 values the mannequin follows, mirrored into the host. */
  character: PoseCharacter | null;
  host: PoseHostStatus | null;
  /** Latest pose_data per Pose Studio node id, exactly as the widget serialized it. */
  poseData: Record<string, string>;
  reload: () => void;
  /** Bumped to remount the host page. */
  reloadKey: number;
  request: (nodeId: string) => void;
  /** Pose Studio node the host should serve; the last request wins and stays. */
  requested: string | null;
  resetHost: (nodeId: string | null) => void;
  setCharacter: (character: PoseCharacter | null) => void;
  setPoseData: (nodeId: string, poseData: string) => void;
  setSlot: (slot: HTMLElement | null) => void;
  /** Where the visible page shows the editor; without one the host stays hidden. */
  slot: HTMLElement | null;
  updateHost: (patch: Partial<Omit<PoseHostStatus, "nodeId">>) => void;
}

export const usePoseStudioStore = create<PoseStudioState>()(
  persist(
    (set, get) => ({
      character: null,
      host: null,
      poseData: {},
      reloadKey: 0,
      requested: null,
      slot: null,

      reload: () => set({ reloadKey: get().reloadKey + 1 }),
      request: (requested) => set({ requested }),
      resetHost: (nodeId) =>
        set({
          host: nodeId
            ? { error: null, loaded: false, nodeId, ready: false }
            : null,
        }),
      setCharacter(character) {
        const current = get().character;
        if (
          current?.age !== character?.age ||
          current?.sex !== character?.sex
        ) {
          set({ character });
        }
      },
      setPoseData: (nodeId, value) =>
        set({ poseData: { ...get().poseData, [nodeId]: value } }),
      setSlot: (slot) => set({ slot }),
      updateHost(patch) {
        const { host } = get();
        if (host) {
          set({ host: { ...host, ...patch } });
        }
      },
    }),
    {
      name: "vnccs-studio-pose-studio",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ poseData }) => ({ poseData }),
    }
  )
);
