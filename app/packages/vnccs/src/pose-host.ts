import { trimTrailingSlashes } from "./http";

/**
 * Message protocol between the app and the Pose Studio host page that
 * ComfyUI serves (`studio_host/pose_host.mjs`). The page runs the VNCCS-Utils
 * widget, which has to stay loaded while a run executes the Pose Studio node:
 * the node waits for the browser to upload the captures it renders.
 */

export const POSE_HOST_ROUTE = "/vnccs/studio/pose_host";
export const HOST_SOURCE = "vnccs-pose-host";
export const STUDIO_SOURCE = "vnccs-studio";

/** pose_data of a Pose Studio node that never saved a pose (the node's own default). */
export const EMPTY_POSE_DATA = "{}";

/** Creator V2 values the Pose Studio mannequin follows. */
export interface PoseCharacter {
  age: number;
  sex: string;
}

export type HostMessage =
  | { nodeId: string; type: "hello" }
  | { nodeId: string; poseData: string; type: "state" }
  | { nodeId: string; ready: boolean; type: "status" }
  | { message: string; nodeId: string; type: "error" };

export type StudioMessage =
  | {
      character: PoseCharacter | null;
      poseData: string | null;
      source: typeof STUDIO_SOURCE;
      type: "init";
    }
  | {
      character: PoseCharacter | null;
      source: typeof STUDIO_SOURCE;
      type: "character";
    };

export function poseHostUrl(baseUrl: string, nodeId: string): string {
  return `${trimTrailingSlashes(baseUrl)}${POSE_HOST_ROUTE}?node=${encodeURIComponent(nodeId)}`;
}

/** Origin the host page posts from, or null for an unusable URL. */
export function hostOrigin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

export function parseHostMessage(data: unknown): HostMessage | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const message = data as Record<string, unknown>;
  const { nodeId } = message;
  if (message.source !== HOST_SOURCE || typeof nodeId !== "string") {
    return null;
  }
  switch (message.type) {
    case "hello":
      return { nodeId, type: "hello" };
    case "state":
      return typeof message.poseData === "string"
        ? { nodeId, poseData: message.poseData, type: "state" }
        : null;
    case "status":
      return { nodeId, ready: message.ready === true, type: "status" };
    case "error":
      return typeof message.message === "string"
        ? { message: message.message, nodeId, type: "error" }
        : null;
    default:
      return null;
  }
}

export function initMessage(
  poseData: string | null,
  character: PoseCharacter | null
): StudioMessage {
  return { character, poseData, source: STUDIO_SOURCE, type: "init" };
}

export function characterMessage(
  character: PoseCharacter | null
): StudioMessage {
  return { character, source: STUDIO_SOURCE, type: "character" };
}
