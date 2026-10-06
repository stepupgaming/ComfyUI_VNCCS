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

export function comfyHost(url: string): ComfyHost {
  const comfy = ComfyTS.create();
  return comfy.host({ id: hostIdFor(url), url, sdkAutoWrite: false });
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
