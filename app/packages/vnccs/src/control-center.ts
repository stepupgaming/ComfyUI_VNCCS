import {
  assertDownloadAllowed,
  DownloadBlockedError,
  type DownloadCategory,
  downloadBlockReason,
} from "./download-guard";
import type { VnccsHttp } from "./http";

export type { DownloadCategory } from "./download-guard";

export const DOWNLOAD_CATEGORIES: readonly DownloadCategory[] = [
  "models",
  "clip",
  "vae",
  "lora",
  "controlnet",
  "other",
];

export type EntryStatus = "installed" | "missing" | "outdated";

/** One row of the Control Center catalog, enriched with install state by the server. */
export interface CatalogEntry {
  active_version?: string;
  clip_type?: string;
  custom?: boolean;
  description?: string;
  hf_path?: string;
  hf_repo?: string;
  kind?: string;
  local_path?: string;
  name: string;
  status?: EntryStatus;
  type?: string;
  version?: string;
  [key: string]: unknown;
}

export interface ControlCenterCatalog {
  available_types: string[];
  clip: CatalogEntry[];
  controlnet: CatalogEntry[];
  lora: CatalogEntry[];
  models: CatalogEntry[];
  name: string;
  other: CatalogEntry[];
  source: string;
  vae: CatalogEntry[];
}

export type DownloadPhase =
  | "queued"
  | "downloading"
  | "success"
  | "error"
  | "auth_required";

export interface DownloadState {
  message?: string;
  progress?: number;
  status: DownloadPhase;
}

/** Keyed by {@link downloadKey}. */
export type DownloadStatusMap = Record<string, DownloadState>;

export function downloadKey(category: DownloadCategory, name: string): string {
  return `cc_${category}_${name}`;
}

export function fetchCatalog(
  http: VnccsHttp,
  repoId: string,
  options: { force?: boolean } = {}
): Promise<ControlCenterCatalog> {
  return http.get<ControlCenterCatalog>("/vnccs/control_center/check", {
    repo_id: repoId,
    force_refresh: options.force ? "true" : undefined,
  });
}

export function fetchDownloadStatus(
  http: VnccsHttp
): Promise<DownloadStatusMap> {
  return http.get<DownloadStatusMap>("/vnccs/manager/status");
}

/**
 * Queue a catalog download. The entry is resolved from the catalog the user
 * is looking at, so the guard sees the same repo and paths the server will
 * use; names that are not in it are refused.
 */
export async function requestDownload(
  http: VnccsHttp,
  repoId: string,
  catalog: ControlCenterCatalog,
  category: DownloadCategory,
  name: string
): Promise<{ message?: string; status: string }> {
  const entry = catalog[category].find((item) => item.name === name);
  if (!entry) {
    throw new DownloadBlockedError(
      `${name} is not in the ${category} catalog. Refresh the Control Center and try again.`
    );
  }
  assertDownloadAllowed(category, entry);
  return await http.post("/vnccs/control_center/download", {
    repo_id: repoId,
    category,
    name,
  });
}

export function isDownloadBlocked(
  category: DownloadCategory,
  entry: CatalogEntry
): boolean {
  return downloadBlockReason(category, entry) !== null;
}

export interface LoraFile {
  already_added: boolean;
  label: string;
  path: string;
}

export async function fetchLoraFiles(
  http: VnccsHttp,
  repoId: string
): Promise<LoraFile[]> {
  const data = await http.get<{ items?: LoraFile[] }>(
    "/vnccs/control_center/lora_files",
    { repo_id: repoId }
  );
  return data.items ?? [];
}

export type CustomLoraKind = "Custom" | "QI2" | "Klein9b" | "MiniMaxH3";

export function addCustomLora(
  http: VnccsHttp,
  input: { kind: CustomLoraKind; path: string; repoId: string }
): Promise<{ entry: CatalogEntry; status: string }> {
  return http.post("/vnccs/control_center/custom_lora", {
    repo_id: input.repoId,
    path: input.path,
    kind: input.kind,
  });
}

export function deleteCustomLora(
  http: VnccsHttp,
  input: { localPath?: string; name: string; repoId: string }
): Promise<{ status: string }> {
  return http.post("/vnccs/control_center/custom_lora/delete", {
    repo_id: input.repoId,
    name: input.name,
    local_path: input.localPath,
  });
}

export interface ModuleInfo {
  duplicate?: boolean;
  duplicate_folders?: string[];
  error?: string;
  folder?: string;
  version?: string;
}

export type DependencyStatus =
  | "ok"
  | "warning"
  | "partial"
  | "missing"
  | "unsupported";

export interface DependencyInfo {
  compatibility_note?: string | null;
  folder?: string;
  github_url?: string;
  label?: string;
  loader?: { file?: string; folder?: string; module?: string };
  manager_id?: string;
  missing_nodes?: string[];
  status?: DependencyStatus;
  warning?: string;
}

export interface ModuleStatus {
  dependencies?: Record<string, DependencyInfo>;
  main?: ModuleInfo;
  utils?: ModuleInfo;
}

export function fetchModuleStatus(http: VnccsHttp): Promise<ModuleStatus> {
  return http.get<ModuleStatus>("/vnccs/module_status");
}

export type PillState = "ok" | "warning" | "partial" | "error" | "dup";

export interface ModulePill {
  detail: string;
  githubUrl?: string;
  key: string;
  label: string;
  /** Needs installing: shown in the missing custom nodes list. */
  missing: boolean;
  state: PillState;
  version?: string;
}

const MODULE_LABELS = { main: "VNCCS", utils: "Utils" } as const;

function modulePill(key: "main" | "utils", info: ModuleInfo = {}): ModulePill {
  const label = MODULE_LABELS[key];
  if (info.error === "not_found") {
    return {
      key,
      label,
      state: "error",
      detail: "not installed",
      missing: false,
    };
  }
  if (info.duplicate) {
    return {
      key,
      label,
      state: "dup",
      version: info.version,
      detail: info.duplicate_folders?.join(" & ") ?? "",
      missing: false,
    };
  }
  if (!info.version) {
    return {
      key,
      label,
      state: "error",
      detail: "version unknown",
      missing: false,
    };
  }
  return {
    key,
    label,
    state: "ok",
    version: info.version,
    detail: "",
    missing: false,
  };
}

function dependencyDetail(info: DependencyInfo): string {
  const missing = info.missing_nodes ?? [];
  if (missing.length > 0) {
    return `missing: ${missing.join(", ")}`;
  }
  const loader = info.loader ?? {};
  const loaderDetail = loader.folder || loader.module || loader.file || "";
  if (info.warning) {
    return info.warning;
  }
  if (loaderDetail) {
    return `loader: ${loaderDetail}`;
  }
  return info.folder ? `folder: ${info.folder}` : "";
}

function dependencyPill(key: string, info: DependencyInfo): ModulePill {
  const label = info.label || key;
  const detail = dependencyDetail(info);
  const base = { key, label, githubUrl: info.github_url };
  switch (info.status) {
    case "ok":
      return {
        ...base,
        state: "ok",
        detail: detail || "Installed",
        missing: false,
      };
    case "warning":
      return {
        ...base,
        state: "warning",
        detail: detail || "Installed with warnings",
        missing: false,
      };
    case "partial":
      return {
        ...base,
        state: "partial",
        detail: detail || "installed but not loaded",
        missing: true,
      };
    case "unsupported":
      return {
        ...base,
        state: "warning",
        detail: info.compatibility_note || "Unsupported on this platform",
        missing: false,
      };
    default:
      return {
        ...base,
        state: "error",
        detail: detail || "not installed",
        missing: true,
      };
  }
}

/** Status pills and update notices, classified the way the legacy widget did. */
export function describeModules(status: ModuleStatus): {
  notices: string[];
  pills: ModulePill[];
} {
  const pills: ModulePill[] = [];
  const notices: string[] = [];
  for (const key of ["main", "utils"] as const) {
    const info = status[key] ?? {};
    pills.push(modulePill(key, info));
    if (info.duplicate) {
      notices.push(
        `${MODULE_LABELS[key]}: duplicate folders (${info.duplicate_folders?.join(", ") ?? ""})`
      );
    }
  }
  for (const [key, info] of Object.entries(status.dependencies ?? {})) {
    const pill = dependencyPill(key, info);
    pills.push(pill);
    if (info.status === "warning") {
      notices.push(
        `${pill.label}: ${info.warning || "installed with warnings"}`
      );
    } else if (info.status === "unsupported") {
      notices.push(`${pill.label}: unsupported on this platform`);
    }
  }
  return { pills, notices };
}

export interface SamplerLists {
  samplers: string[];
  schedulers: string[];
}

/** Sampler and scheduler names from the live KSampler schema, or null if unavailable. */
export async function fetchSamplerLists(
  http: VnccsHttp
): Promise<SamplerLists | null> {
  try {
    const data = await http.get<{
      KSampler?: {
        input?: {
          required?: { sampler_name?: [string[]]; scheduler?: [string[]] };
        };
      };
    }>("/object_info/KSampler");
    const required = data.KSampler?.input?.required;
    const samplers = required?.sampler_name?.[0];
    const schedulers = required?.scheduler?.[0];
    if (!(samplers && schedulers)) {
      return null;
    }
    return { samplers, schedulers };
  } catch {
    return null;
  }
}
