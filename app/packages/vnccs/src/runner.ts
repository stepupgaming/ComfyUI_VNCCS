import {
  type ComfyExecution,
  type ComfyHost,
  ComfyTS,
  type ExecutionPreview,
  type ExecutionProgress,
} from "comfy-ts/web";
import { DEFAULT_COMFY_URL, trimTrailingSlashes } from "./http";
import type { ApiPrompt } from "./prompt";

export type {
  ComfyExecution,
  ComfyHost,
  ExecutionPreview,
  ExecutionProgress,
} from "comfy-ts/web";

export const HOST_ID = "vnccs";
const NON_ALPHANUMERIC = /[^a-z0-9]+/gi;

/**
 * comfy-ts refuses to re-register a host id at another address, so each
 * address gets its own id.
 */
export function hostIdFor(url: string): string {
  const normalized = trimTrailingSlashes(url);
  if (normalized === DEFAULT_COMFY_URL) {
    return HOST_ID;
  }
  return `${HOST_ID}-${normalized.replace(NON_ALPHANUMERIC, "-").toLowerCase()}`;
}

/** The JSON events comfy-ts routes; it reports every other type as an error. */
const COMFY_TS_EVENTS = new Set([
  "executed",
  "executing",
  "execution_cached",
  "execution_error",
  "execution_start",
  "execution_success",
  "logs",
  "manager-terminal-feedback",
  "progress",
  "progress_state",
  "status",
]);

/** False for a JSON server event comfy-ts has no route for; binary frames pass. */
export function isComfyTsEvent(data: unknown): boolean {
  if (typeof data !== "string") {
    return true;
  }
  let type: unknown;
  try {
    type = (JSON.parse(data) as { type?: unknown } | null)?.type;
  } catch {
    return true;
  }
  return typeof type !== "string" || COMFY_TS_EVENTS.has(type);
}

const filteredHosts = new WeakSet<ComfyHost>();

/**
 * Custom nodes broadcast their own events (`vnccs.*`, `vnccs_req_pose_sync`,
 * ...) to every client, and comfy-ts logs each one as an unknown message.
 * The studio reads those on its own socket, so the host skips them.
 */
function skipForeignEvents(host: ComfyHost): ComfyHost {
  if (!filteredHosts.has(host)) {
    filteredHosts.add(host);
    const route = host.onMessage;
    host.onMessage = (event) => {
      if (isComfyTsEvent(event.data)) {
        route.call(host, event);
      }
    };
  }
  return host;
}

export function comfyHost(url: string): ComfyHost {
  const comfy = ComfyTS.create();
  return skipForeignEvents(
    comfy.host({ id: hostIdFor(url), url, sdkAutoWrite: false })
  );
}

export interface RunPromptOptions {
  onPreview?: (preview: ExecutionPreview) => void;
  onProgress?: (progress: ExecutionProgress) => void;
}

export class PromptProblemsError extends Error {
  override readonly name = "PromptProblemsError";
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`The workflow has problems:\n${problems.join("\n")}`);
    this.problems = problems;
  }
}

/** The server's reason for a failed run: `NodeType: message` when known. */
export function executionFailureMessage(
  execution: Pick<ComfyExecution, "data">
): string {
  const error = execution.data.error?.data;
  const message = error?.exception_message?.trim();
  if (!message) {
    return "The run failed";
  }
  return error?.node_type ? `${error.node_type}: ${message}` : message;
}

/**
 * Validate a prompt against the live schema and queue it. Resolves with the
 * running execution; await `execution.done` for completion.
 */
export async function startPrompt(
  host: ComfyHost,
  prompt: ApiPrompt,
  options: RunPromptOptions = {}
): Promise<ComfyExecution> {
  await host.connect();
  const workflow = host.importApiJson(prompt);
  const problems = workflow.problems.map((problem) => problem.title);
  if (problems.length > 0) {
    throw new PromptProblemsError(problems);
  }
  return workflow.start({
    onProgress: options.onProgress,
    onPreview: options.onPreview,
  });
}
