import { type VnccsHttp, VnccsRequestError } from "./http";

/**
 * REST calls and pure helpers of the Migration Assistant
 * (`web/vnccs_migration_assistant.js`): turn legacy character sheets into
 * sprites in the current storage root, and pad sprite folders whose canvases
 * differ in size. All work runs as a background job on the server; the client
 * starts it and polls its status.
 */

export const MIGRATION_STATUSES = [
  "queued",
  "running",
  "done",
  "partial",
  "error",
] as const;

export type MigrationStatus = (typeof MIGRATION_STATUSES)[number];

export const MIGRATION_POLL_MS = 700;

export interface LegacyCharacter {
  config_exists: boolean;
  existing_sprite_count: number;
  legacy_name: string;
  missing_sprite_targets: number;
  new_name: string;
  sheet_count: number;
  status: "migrated" | "needs_migration";
}

export interface MigrationScan {
  characters: LegacyCharacter[];
  legacy_root: string;
  new_root: string;
}

/** One character's migration result; repair jobs report other shapes. */
export interface MigrationResult {
  config_copied?: boolean;
  failed_sheet_paths?: string[];
  failed_sheets?: number;
  legacy_name?: string;
  new_name?: string;
  sheet_count?: number;
  sprites_alpha_fixed?: number;
  sprites_saved?: number;
  sprites_skipped?: number;
}

export interface MigrationRun {
  current?: number;
  current_character?: string;
  current_sheet?: string;
  error?: string;
  failed_characters?: string[];
  failed_sheets?: number;
  id: string;
  log?: string[];
  message?: string;
  results?: MigrationResult[];
  status: MigrationStatus;
  total?: number;
}

export interface MigrationRequest {
  characters: string[];
  force: boolean;
  retry_sheets: Record<string, string[]>;
}

export function isMigrationStatus(value: unknown): value is MigrationStatus {
  return MIGRATION_STATUSES.includes(value as MigrationStatus);
}

export function isTerminalStatus(status: MigrationStatus): boolean {
  return status === "done" || status === "partial" || status === "error";
}

/** Done rows cannot be selected; a row with sheets and no missing target counts as done. */
export function isCharacterMigrated(character: LegacyCharacter): boolean {
  return (
    character.status === "migrated" ||
    (character.sheet_count > 0 && character.missing_sprite_targets === 0)
  );
}

/** After a scan, every character with a missing sprite target is selected. */
export function defaultSelection(scan: MigrationScan): string[] {
  return scan.characters
    .filter((character) => character.missing_sprite_targets > 0)
    .map((character) => character.legacy_name);
}

export function characterTitle(character: LegacyCharacter): string {
  return character.legacy_name === character.new_name
    ? character.legacy_name
    : `${character.legacy_name} -> ${character.new_name}`;
}

export function characterMeta(character: LegacyCharacter): string {
  const counts = `${character.sheet_count} sheet(s), ${character.existing_sprite_count} existing sprite(s)`;
  return isCharacterMigrated(character)
    ? `${counts}, migrated`
    : `${counts}, ${character.missing_sprite_targets} target(s) missing`;
}

export function characterPill(character: LegacyCharacter): string {
  if (isCharacterMigrated(character)) {
    return "migrated";
  }
  return character.config_exists ? "config" : "no config";
}

export function migrationSummary(
  scan: MigrationScan | null,
  selected: number
): string[] {
  const characters = scan?.characters ?? [];
  const sheets = characters.reduce((n, c) => n + (c.sheet_count || 0), 0);
  const missing = characters.reduce(
    (n, c) => n + (c.missing_sprite_targets || 0),
    0
  );
  return [
    `${characters.length} legacy character(s)`,
    `${selected} selected`,
    `${sheets} sheet file(s)`,
    `${missing} target(s) need sprites`,
  ];
}

export interface MigrationProgress {
  percent: number;
  text: string;
}

export function migrationProgress(run: MigrationRun | null): MigrationProgress {
  if (!run) {
    return { percent: 0, text: "Idle" };
  }
  const total = run.total || 0;
  const current = run.current || 0;
  const percent = total
    ? Math.min(100, Math.round((current / total) * 100))
    : 0;
  const failed = run.failed_sheets
    ? ` — ${run.failed_sheets} sheet(s) failed`
    : "";
  return { percent, text: `${run.status} ${current}/${total}${failed}` };
}

/** The log pane: the job log, else its message or error. */
export function migrationLog(run: MigrationRun): string {
  return (run.log ?? []).join("\n") || run.message || run.error || "";
}

/** The message a finished job adds to the log when it did not fully succeed. */
export function migrationFailureMessage(run: MigrationRun): string | null {
  if (run.status !== "error" && run.status !== "partial") {
    return null;
  }
  return run.error || run.message || "Migration job failed";
}

export interface MigrationControlState {
  /** A scan, start or status request is in flight. */
  busy: boolean;
  run: MigrationRun | null;
  /** The job being followed; set until it reaches a terminal status. */
  runId: string;
  scan: MigrationScan | null;
  selected: readonly string[];
}

export interface MigrationControls {
  canMigrateAll: boolean;
  canMigrateSelected: boolean;
  canRepair: boolean;
  canRetry: boolean;
  canScan: boolean;
  showRetry: boolean;
}

/** Selected rows that still need work; migrated rows cannot be checked. */
export function selectedForMigration(
  state: Pick<MigrationControlState, "scan" | "selected">
): string[] {
  const open = new Set(
    (state.scan?.characters ?? [])
      .filter((character) => !isCharacterMigrated(character))
      .map((character) => character.legacy_name)
  );
  return state.selected.filter((name) => open.has(name));
}

/** The widget's `setBusy`: nothing can start while a request or a followed job is open. */
export function migrationControls(
  state: MigrationControlState
): MigrationControls {
  const blocked = state.busy || Boolean(state.runId);
  return {
    canScan: !state.busy,
    canRepair: !blocked,
    canMigrateSelected: !blocked && selectedForMigration(state).length > 0,
    canMigrateAll: !blocked && (state.scan?.characters.length ?? 0) > 0,
    canRetry: !blocked,
    showRetry: (state.run?.failed_characters?.length ?? 0) > 0,
  };
}

export function migrationRequest(characters: string[]): MigrationRequest {
  return { characters, force: false, retry_sheets: {} };
}

/** Retry Failed: rerun only the failed sheets of the failed characters. */
export function retryRequest(
  run: MigrationRun | null
): MigrationRequest | null {
  const characters = run?.failed_characters ?? [];
  if (characters.length === 0) {
    return null;
  }
  const retrySheets: Record<string, string[]> = {};
  for (const result of run?.results ?? []) {
    if (result.legacy_name && result.failed_sheet_paths?.length) {
      retrySheets[result.legacy_name] = result.failed_sheet_paths;
    }
  }
  return { characters, force: true, retry_sheets: retrySheets };
}

export async function scanLegacyCharacters(
  http: VnccsHttp
): Promise<MigrationScan> {
  const data = await http.get<Partial<MigrationScan>>(
    "/vnccs/migration/characters"
  );
  return {
    legacy_root: data?.legacy_root ?? "",
    new_root: data?.new_root ?? "",
    characters: Array.isArray(data?.characters) ? data.characters : [],
  };
}

function runId(data: { run_id?: unknown }): string {
  if (typeof data?.run_id !== "string" || !data.run_id) {
    throw new Error("The server did not return a job id.");
  }
  return data.run_id;
}

export async function startMigration(
  http: VnccsHttp,
  request: MigrationRequest
): Promise<string> {
  return runId(
    await http.post<{ run_id?: unknown }>("/vnccs/migration/start", request)
  );
}

/** Backups are always on: the repair pads sprites in place. */
export async function startSpriteRepair(http: VnccsHttp): Promise<string> {
  return runId(
    await http.post<{ run_id?: unknown }>("/vnccs/migration/repair-sprites", {
      backup: true,
    })
  );
}

export class MigrationRunMissingError extends Error {
  override readonly name = "MigrationRunMissingError";
}

function validRun(data: unknown, status: number): MigrationRun {
  const run = data as MigrationRun | null;
  if (!(run && isMigrationStatus(run.status))) {
    throw new Error(`Invalid migration status (${status})`);
  }
  return run;
}

/**
 * One status read. A job that ended in error reports `{status: "error",
 * error}`, which is a run, not a failed request. A 404 means the server no
 * longer knows the job (it restarted or pruned it).
 */
export async function fetchMigrationRun(
  http: VnccsHttp,
  id: string
): Promise<MigrationRun> {
  const route = `/vnccs/migration/status/${encodeURIComponent(id)}`;
  try {
    return validRun(await http.get<unknown>(route), 200);
  } catch (error) {
    if (!(error instanceof VnccsRequestError)) {
      throw error;
    }
    if (error.status === 404) {
      throw new MigrationRunMissingError(error.message);
    }
    const data = error.data as MigrationRun | null;
    if (error.status < 400 && data?.status === "error") {
      return validRun(data, error.status);
    }
    throw error;
  }
}

export interface MigrationPollOptions {
  /** False once a newer poll started or the page was left; the poll then stops quietly. */
  isCurrent?: () => boolean;
  onUpdate: (run: MigrationRun) => void;
  sleep?: (ms: number) => Promise<void>;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll the job until it finishes. Resolves null when the poll stopped being current. */
export async function pollMigrationRun(
  http: VnccsHttp,
  id: string,
  options: MigrationPollOptions
): Promise<MigrationRun | null> {
  const isCurrent = options.isCurrent ?? (() => true);
  const run = await fetchMigrationRun(http, id);
  if (!isCurrent()) {
    return null;
  }
  options.onUpdate(run);
  if (isTerminalStatus(run.status)) {
    return run;
  }
  await (options.sleep ?? wait)(MIGRATION_POLL_MS);
  return isCurrent() ? pollMigrationRun(http, id, options) : null;
}
