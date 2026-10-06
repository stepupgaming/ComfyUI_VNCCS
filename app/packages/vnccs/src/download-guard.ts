/**
 * The studio never downloads Qwen Image 2.1, MiniMax H3 or Flux weights. Their
 * diffusion models, text encoders and VAEs are tens of gigabytes and are
 * provisioned outside the app, so every Control Center download goes through
 * this check before the request leaves the client.
 */

export type DownloadCategory =
  | "models"
  | "clip"
  | "vae"
  | "lora"
  | "controlnet"
  | "other";

export interface GuardedEntry {
  hf_path?: string;
  hf_repo?: string;
  kind?: string;
  local_path?: string;
  name: string;
}

const BASE_WEIGHT_CATEGORIES = new Set<DownloadCategory>([
  "models",
  "clip",
  "vae",
]);

const PROTECTED_FAMILIES: Record<string, string> = {
  qi2: "Qwen Image 2.1",
  minimaxh3: "MiniMax H3",
  klein9b: "Flux Klein9b",
};

const PROTECTED_REPOS: Record<string, string> = {
  "comfy-org/qwen-image-2.1": "Qwen Image 2.1",
  "comfy-org/minimax-h3": "MiniMax H3",
  "miuproject/flux.2-klein-9b-fp8": "Flux Klein9b",
  "comfy-org/vae-text-encorder-for-flux-klein-9b": "Flux Klein9b",
};

const PROTECTED_NAME_PATTERNS: [RegExp, string][] = [
  [/qwen[\s_.-]*image[\s_.-]*2[._]1/i, "Qwen Image 2.1"],
  [/minimax[\s_.-]*h3/i, "MiniMax H3"],
  [/flux|klein/i, "Flux"],
];

const NON_ALPHANUMERIC = /[^a-z0-9]/g;

/** Same normalization as the server's `_normalize_model_kind`. */
export function normalizeKind(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  const compact = normalized.replace(NON_ALPHANUMERIC, "");
  return compact === "h3" || compact === "minimaxh3" ? "minimaxh3" : normalized;
}

function familyFromName(entry: GuardedEntry): string | null {
  const identity = [entry.name, entry.hf_path, entry.local_path].join(" ");
  for (const [pattern, family] of PROTECTED_NAME_PATTERNS) {
    if (pattern.test(identity)) {
      return family;
    }
  }
  return null;
}

/** Why a catalog entry may not be downloaded, or null when it may. */
export function downloadBlockReason(
  category: DownloadCategory,
  entry: GuardedEntry
): string | null {
  const repoFamily =
    PROTECTED_REPOS[
      String(entry.hf_repo ?? "")
        .trim()
        .toLowerCase()
    ];
  if (repoFamily) {
    return `${entry.name} comes from the ${repoFamily} weights repository, which VNCCS Studio never downloads.`;
  }

  const kind = normalizeKind(entry.kind);
  const kindFamily = PROTECTED_FAMILIES[kind];
  if (BASE_WEIGHT_CATEGORIES.has(category) && kindFamily) {
    return `${entry.name} is a ${kindFamily} weight file. VNCCS Studio never downloads it; install it outside the app.`;
  }
  if (category === "lora" && kind === "klein9b") {
    return `${entry.name} needs the Flux Klein9b base model, which VNCCS Studio does not install.`;
  }

  const nameFamily = familyFromName(entry);
  if (nameFamily && (category !== "lora" || nameFamily === "Flux")) {
    return `${entry.name} looks like ${nameFamily} weights, which VNCCS Studio never downloads.`;
  }
  return null;
}

/** Split download candidates into what the guard allows and what it refuses, with the reason. */
export function partitionDownloads<
  T extends { category: DownloadCategory; entry: GuardedEntry },
>(items: readonly T[]): { allowed: T[]; blocked: (T & { reason: string })[] } {
  const allowed: T[] = [];
  const blocked: (T & { reason: string })[] = [];
  for (const item of items) {
    const reason = downloadBlockReason(item.category, item.entry);
    if (reason) {
      blocked.push({ ...item, reason });
    } else {
      allowed.push(item);
    }
  }
  return { allowed, blocked };
}

export class DownloadBlockedError extends Error {
  override readonly name = "DownloadBlockedError";
}

export function assertDownloadAllowed(
  category: DownloadCategory,
  entry: GuardedEntry
): void {
  const reason = downloadBlockReason(category, entry);
  if (reason) {
    throw new DownloadBlockedError(reason);
  }
}
