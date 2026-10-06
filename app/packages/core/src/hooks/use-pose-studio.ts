"use client";

import {
  type PoseHostStatus,
  usePoseStudioStore,
} from "@workspace/core/stores/pose-studio-store";
import { EMPTY_POSE_DATA } from "@workspace/vnccs/pose-host";
import { useEffect } from "react";

/**
 * Ask the app-wide host to serve a Pose Studio node. Pages that queue that
 * node call this even when the editor is not on screen, so a run always
 * finds the widget. Returns the host status once it serves this node.
 */
export function usePoseStudio(nodeId: string): PoseHostStatus | null {
  useEffect(() => {
    usePoseStudioStore.getState().request(nodeId);
  }, [nodeId]);
  return usePoseStudioStore((state) =>
    state.host?.nodeId === nodeId ? state.host : null
  );
}

/** The pose_data to queue for a node: the widget's latest state. */
export function currentPoseData(nodeId: string): string {
  return usePoseStudioStore.getState().poseData[nodeId] ?? EMPTY_POSE_DATA;
}
