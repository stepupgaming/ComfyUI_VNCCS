import { describe, expect, it } from "vitest";
import { VnccsHttp } from "../src/http";
import {
  characterMeta,
  characterPill,
  characterTitle,
  defaultSelection,
  fetchMigrationRun,
  isCharacterMigrated,
  type LegacyCharacter,
  MigrationRunMissingError,
  type MigrationScan,
  migrationControls,
  migrationFailureMessage,
  migrationLog,
  migrationProgress,
  migrationRequest,
  migrationSummary,
  pollMigrationRun,
  retryRequest,
  scanLegacyCharacters,
  selectedForMigration,
  startMigration,
  startSpriteRepair,
} from "../src/migration";

const BASE = "http://127.0.0.1:8188";

function character(overrides: Partial<LegacyCharacter>): LegacyCharacter {
  return {
    legacy_name: "Alice",
    new_name: "Alice",
    sheet_count: 2,
    existing_sprite_count: 0,
    missing_sprite_targets: 2,
    status: "needs_migration",
    config_exists: true,
    ...overrides,
  };
}

const SCAN: MigrationScan = {
  legacy_root: "F:/out/VN_CharacterCreatorSuit",
  new_root: "F:/out/VNCCS/Characters",
  characters: [
    character({}),
    character({
      legacy_name: "Bob.2",
      new_name: "Bob_2",
      missing_sprite_targets: 0,
      existing_sprite_count: 4,
      config_exists: false,
    }),
    character({
      legacy_name: "Empty",
      new_name: "Empty",
      sheet_count: 0,
      missing_sprite_targets: 0,
      config_exists: false,
    }),
  ],
};

function client(answer: (url: string) => Response) {
  const requests: { body?: unknown; method: string; url: string }[] = [];
  const http = new VnccsHttp(BASE, (url, init) => {
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return Promise.resolve(answer(url));
  });
  return { http, requests };
}

describe("migration rows", () => {
  it("marks rows with sheets and no missing target as migrated", () => {
    const [alice, bob, empty] = SCAN.characters as [
      LegacyCharacter,
      LegacyCharacter,
      LegacyCharacter,
    ];
    expect(isCharacterMigrated(alice)).toBe(false);
    expect(isCharacterMigrated(bob)).toBe(true);
    expect(isCharacterMigrated(empty)).toBe(false);
    expect(isCharacterMigrated(character({ status: "migrated" }))).toBe(true);
  });

  it("selects only characters that need sprites", () => {
    expect(defaultSelection(SCAN)).toEqual(["Alice"]);
  });

  it("describes each row like the widget", () => {
    const [alice, bob, empty] = SCAN.characters as [
      LegacyCharacter,
      LegacyCharacter,
      LegacyCharacter,
    ];
    expect(characterTitle(alice)).toBe("Alice");
    expect(characterTitle(bob)).toBe("Bob.2 -> Bob_2");
    expect(characterMeta(alice)).toBe(
      "2 sheet(s), 0 existing sprite(s), 2 target(s) missing"
    );
    expect(characterMeta(bob)).toBe(
      "2 sheet(s), 4 existing sprite(s), migrated"
    );
    expect(characterPill(alice)).toBe("config");
    expect(characterPill(bob)).toBe("migrated");
    expect(characterPill(empty)).toBe("no config");
  });

  it("summarizes the scan", () => {
    expect(migrationSummary(SCAN, 1)).toEqual([
      "3 legacy character(s)",
      "1 selected",
      "4 sheet file(s)",
      "2 target(s) need sprites",
    ]);
    expect(migrationSummary(null, 0)[0]).toBe("0 legacy character(s)");
  });
});

describe("migration jobs", () => {
  it("reports progress and failures", () => {
    expect(migrationProgress(null)).toEqual({ percent: 0, text: "Idle" });
    expect(
      migrationProgress({ id: "r", status: "running", current: 1, total: 3 })
    ).toEqual({ percent: 33, text: "running 1/3" });
    expect(
      migrationProgress({
        id: "r",
        status: "partial",
        current: 3,
        total: 3,
        failed_sheets: 2,
      }).text
    ).toBe("partial 3/3 — 2 sheet(s) failed");
    expect(migrationLog({ id: "r", status: "done", log: ["a", "b"] })).toBe(
      "a\nb"
    );
    expect(migrationLog({ id: "r", status: "error", error: "boom" })).toBe(
      "boom"
    );
    expect(migrationFailureMessage({ id: "r", status: "done" })).toBeNull();
    expect(
      migrationFailureMessage({
        id: "r",
        status: "partial",
        message: "Migration incomplete: 1 sheet(s) failed",
      })
    ).toBe("Migration incomplete: 1 sheet(s) failed");
    expect(migrationFailureMessage({ id: "r", status: "error" })).toBe(
      "Migration job failed"
    );
  });

  it("blocks every start while a request or a job is open", () => {
    const idle = {
      busy: false,
      run: null,
      runId: "",
      scan: SCAN,
      selected: ["Alice"],
    };
    expect(migrationControls(idle)).toEqual({
      canScan: true,
      canRepair: true,
      canMigrateSelected: true,
      canMigrateAll: true,
      canRetry: true,
      showRetry: false,
    });
    expect(migrationControls({ ...idle, runId: "abc" })).toMatchObject({
      canScan: true,
      canRepair: false,
      canMigrateSelected: false,
      canMigrateAll: false,
      canRetry: false,
    });
    expect(migrationControls({ ...idle, busy: true }).canScan).toBe(false);
    expect(
      migrationControls({ ...idle, selected: ["Bob.2"] }).canMigrateSelected
    ).toBe(false);
    expect(
      migrationControls({ ...idle, scan: { ...SCAN, characters: [] } })
        .canMigrateAll
    ).toBe(false);
    expect(
      migrationControls({
        ...idle,
        run: { id: "r", status: "partial", failed_characters: ["Alice"] },
      }).showRetry
    ).toBe(true);
    expect(
      selectedForMigration({ scan: SCAN, selected: ["Bob.2", "Alice", "Zed"] })
    ).toEqual(["Alice"]);
  });

  it("retries only the failed sheets", () => {
    expect(retryRequest(null)).toBeNull();
    expect(
      retryRequest({ id: "r", status: "done", failed_characters: [] })
    ).toBeNull();
    expect(
      retryRequest({
        id: "r",
        status: "partial",
        failed_characters: ["Alice"],
        results: [
          { legacy_name: "Alice", failed_sheet_paths: ["B/neutral/sheet.png"] },
          { legacy_name: "Bob", failed_sheet_paths: [] },
        ],
      })
    ).toEqual({
      characters: ["Alice"],
      force: true,
      retry_sheets: { Alice: ["B/neutral/sheet.png"] },
    });
  });

  it("scans and starts jobs", async () => {
    const { http, requests } = client((url) =>
      url.endsWith("/characters")
        ? Response.json(SCAN)
        : Response.json({ run_id: "abc" })
    );
    await expect(scanLegacyCharacters(http)).resolves.toEqual(SCAN);
    await expect(
      startMigration(http, migrationRequest(["Alice"]))
    ).resolves.toBe("abc");
    await expect(startSpriteRepair(http)).resolves.toBe("abc");
    expect(requests.slice(1)).toEqual([
      {
        url: `${BASE}/api/vnccs/migration/start`,
        method: "POST",
        body: { characters: ["Alice"], force: false, retry_sheets: {} },
      },
      {
        url: `${BASE}/api/vnccs/migration/repair-sprites`,
        method: "POST",
        body: { backup: true },
      },
    ]);
  });

  it("surfaces a busy server and a missing job id", async () => {
    const busy = client(() =>
      Response.json(
        { error: "A migration or repair job is already running" },
        { status: 409 }
      )
    );
    await expect(
      startMigration(busy.http, migrationRequest(["Alice"]))
    ).rejects.toThrow("already running");
    const empty = client(() => Response.json({}));
    await expect(startSpriteRepair(empty.http)).rejects.toThrow(
      "did not return a job id"
    );
  });

  it("reads a failed job as a run and a pruned job as missing", async () => {
    const failed = client(() =>
      Response.json({ id: "r", status: "error", error: "disk full" })
    );
    await expect(fetchMigrationRun(failed.http, "r")).resolves.toMatchObject({
      status: "error",
      error: "disk full",
    });
    const missing = client(() =>
      Response.json({ error: "Run not found" }, { status: 404 })
    );
    await expect(fetchMigrationRun(missing.http, "r")).rejects.toBeInstanceOf(
      MigrationRunMissingError
    );
    const broken = client(() => Response.json({ id: "r", status: "odd" }));
    await expect(fetchMigrationRun(broken.http, "r")).rejects.toThrow(
      "Invalid migration status (200)"
    );
    const down = client(
      () => new Response("Service Unavailable", { status: 503 })
    );
    await expect(fetchMigrationRun(down.http, "r")).rejects.toThrow();
  });

  it("polls until the job finishes", async () => {
    const statuses = ["queued", "running", "done"];
    const { http, requests } = client(() =>
      Response.json({ id: "r", status: statuses.shift(), current: 1, total: 1 })
    );
    const seen: string[] = [];
    const sleeps: number[] = [];
    const run = await pollMigrationRun(http, "r", {
      onUpdate: (update) => seen.push(update.status),
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    });
    expect(run?.status).toBe("done");
    expect(seen).toEqual(["queued", "running", "done"]);
    expect(sleeps).toEqual([700, 700]);
    expect(requests[0]?.url).toBe(`${BASE}/api/vnccs/migration/status/r`);
  });

  it("stops quietly once the poll is no longer current", async () => {
    let current = true;
    const { http, requests } = client(() =>
      Response.json({ id: "r", status: "running" })
    );
    const seen: string[] = [];
    const run = await pollMigrationRun(http, "r", {
      isCurrent: () => current,
      onUpdate: (update) => seen.push(update.status),
      sleep: () => {
        current = false;
        return Promise.resolve();
      },
    });
    expect(run).toBeNull();
    expect(seen).toEqual(["running"]);
    expect(requests).toHaveLength(1);
  });
});
