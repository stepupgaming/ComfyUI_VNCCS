import { studioHttp } from "@workspace/core/lib/studio";
import { useMigrationStore } from "@workspace/core/stores/migration-store";
import {
  defaultSelection,
  type MigrationRequest,
  type MigrationRun,
  MigrationRunMissingError,
  migrationControls,
  migrationFailureMessage,
  migrationLog,
  migrationRequest,
  pollMigrationRun,
  retryRequest,
  scanLegacyCharacters,
  selectedForMigration,
  startMigration,
  startSpriteRepair,
} from "@workspace/vnccs/migration";
import { toast } from "sonner";

/**
 * The Migration Assistant widget's flows (`web/vnccs_migration_assistant.js`).
 * The followed job id is persisted, so leaving the page only stops the poll;
 * returning resumes it. A newer scan or poll supersedes an older one.
 */

let scanRequest = 0;
let pollRequest = 0;

function guard(next: number): () => boolean {
  return () => next === pollRequest;
}

function store() {
  return useMigrationStore.getState();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function controls() {
  return migrationControls(store());
}

function canStartJob(): boolean {
  const { busy, runId } = store();
  return !(busy || runId);
}

/** Re-read the character list without touching the log, e.g. after a job finished. */
async function refreshScan(): Promise<void> {
  scanRequest += 1;
  const id = scanRequest;
  try {
    const scan = await scanLegacyCharacters(studioHttp());
    if (id === scanRequest) {
      store().set({ scan, selected: defaultSelection(scan) });
    }
  } catch {
    // The finished job's log stays visible; Scan reports errors explicitly.
  }
}

export async function scanMigration(): Promise<void> {
  if (store().busy) {
    return;
  }
  scanRequest += 1;
  const id = scanRequest;
  store().set({ busy: true, log: "Scanning legacy path..." });
  try {
    const scan = await scanLegacyCharacters(studioHttp());
    if (id === scanRequest) {
      store().set({
        log: "Scan complete.",
        scan,
        selected: defaultSelection(scan),
      });
    }
  } catch (error) {
    if (id === scanRequest) {
      store().set({ log: `Scan failed: ${errorText(error)}` });
    }
  } finally {
    if (id === scanRequest) {
      store().set({ busy: false });
    }
  }
}

function finishRun(run: MigrationRun): void {
  const failure = migrationFailureMessage(run);
  const log = store().log;
  store().set({
    busy: false,
    log: failure && !log.includes(failure) ? `${log}\n${failure}` : log,
    runId: "",
  });
  if (run.status === "done") {
    toast.success(run.message || "Migration complete");
  } else if (run.status === "partial") {
    toast.warning(failure ?? "Migration incomplete");
  } else {
    toast.error(failure ?? "Job failed");
  }
  if (run.status === "done" || run.status === "partial") {
    refreshScan();
  }
}

/** Follow a job until it ends; on a failed status read, offer Retry Status. */
async function followRun(id: string): Promise<void> {
  pollRequest += 1;
  const isCurrent = guard(pollRequest);
  store().set({ busy: true, statusFailed: false });
  try {
    const run = await pollMigrationRun(studioHttp(), id, {
      isCurrent,
      onUpdate: (update) => {
        store().set({ log: migrationLog(update), run: update });
      },
    });
    if (run && isCurrent()) {
      finishRun(run);
    }
  } catch (error) {
    if (!isCurrent()) {
      return;
    }
    if (error instanceof MigrationRunMissingError) {
      store().set({ runId: "" });
    }
    const hint = store().runId
      ? "The job may still be running. Retry Status to reconnect."
      : "Scan again to refresh migration state.";
    store().set({
      busy: false,
      log: `Status request failed: ${errorText(error)}. ${hint}`,
      statusFailed: true,
    });
  }
}

/** Mounting the page: resume a followed job, otherwise scan like the widget did. */
export function enterMigration(): void {
  const { runId, scan } = store();
  if (runId) {
    if (!scan) {
      refreshScan();
    }
    followRun(runId);
    return;
  }
  scanMigration();
}

/** Leaving the page stops polling; the job keeps running on the server. */
export function leaveMigration(): void {
  scanRequest += 1;
  pollRequest += 1;
  store().set({ busy: false, confirmRepair: false });
}

/** The Scan button, relabelled Retry Status while a job's status is unknown. */
export function scanOrRetryStatus(): Promise<void> {
  const { busy, runId } = store();
  if (busy) {
    return Promise.resolve();
  }
  return runId ? followRun(runId) : scanMigration();
}

export function toggleMigrationCharacter(name: string, checked: boolean): void {
  const selected = store().selected.filter((item) => item !== name);
  store().set({ selected: checked ? [...selected, name] : selected });
}

async function startJob(
  log: string,
  failure: string,
  start: () => Promise<string>
): Promise<void> {
  if (!canStartJob()) {
    return;
  }
  const session = pollRequest;
  store().set({ busy: true, log });
  let id: string;
  try {
    id = await start();
  } catch (error) {
    store().set({ busy: false, log: `${failure}: ${errorText(error)}` });
    return;
  }
  store().set({ runId: id });
  // Leaving the page while the start request was in flight: the next visit resumes the poll.
  if (session === pollRequest) {
    await followRun(id);
  }
}

function runMigration(request: MigrationRequest): Promise<void> {
  if (request.characters.length === 0) {
    return Promise.resolve();
  }
  return startJob("Starting migration...", "Migration failed", () =>
    startMigration(studioHttp(), request)
  );
}

export function migrateSelected(): Promise<void> {
  if (!controls().canMigrateSelected) {
    return Promise.resolve();
  }
  return runMigration(migrationRequest(selectedForMigration(store())));
}

export function migrateAll(): Promise<void> {
  if (!controls().canMigrateAll) {
    return Promise.resolve();
  }
  const names = (store().scan?.characters ?? []).map(
    (character) => character.legacy_name
  );
  return runMigration(migrationRequest(names));
}

export function retryFailed(): Promise<void> {
  const request = retryRequest(store().run);
  if (!(request && controls().canRetry)) {
    return Promise.resolve();
  }
  return runMigration(request);
}

export function requestSpriteRepair(): void {
  if (controls().canRepair) {
    store().set({ confirmRepair: true });
  }
}

export function closeSpriteRepair(): void {
  store().set({ confirmRepair: false });
}

export function confirmSpriteRepair(): Promise<void> {
  store().set({ confirmRepair: false });
  return startJob(
    "Scanning current VNCCS sprites for mismatched canvases...",
    "Repair failed",
    () => startSpriteRepair(studioHttp())
  );
}
