"use client";

import { ConnectionGate } from "@workspace/core/components/common/connection-gate";
import { Page } from "@workspace/core/components/common/page";
import {
  closeSpriteRepair,
  confirmSpriteRepair,
  enterMigration,
  leaveMigration,
  migrateAll,
  migrateSelected,
  requestSpriteRepair,
  retryFailed,
  scanOrRetryStatus,
  toggleMigrationCharacter,
} from "@workspace/core/lib/migration-actions";
import { useMigrationStore } from "@workspace/core/stores/migration-store";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Progress } from "@workspace/ui/components/progress";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import {
  characterMeta,
  characterPill,
  characterTitle,
  isCharacterMigrated,
  type LegacyCharacter,
  migrationControls,
  migrationProgress,
  migrationSummary,
  selectedForMigration,
} from "@workspace/vnccs/migration";
import {
  Play,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Wrench,
} from "lucide-react";
import { useEffect, useId } from "react";

function useControls() {
  const busy = useMigrationStore((store) => store.busy);
  const run = useMigrationStore((store) => store.run);
  const runId = useMigrationStore((store) => store.runId);
  const scan = useMigrationStore((store) => store.scan);
  const selected = useMigrationStore((store) => store.selected);
  return migrationControls({ busy, run, runId, scan, selected });
}

function Header() {
  const scan = useMigrationStore((store) => store.scan);
  const busy = useMigrationStore((store) => store.busy);
  const runId = useMigrationStore((store) => store.runId);
  const statusFailed = useMigrationStore((store) => store.statusFailed);
  const controls = useControls();
  const retryStatus = Boolean(runId) && statusFailed;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-semibold text-lg">VNCCS Migration Assistant</h1>
        <p className="break-all font-mono text-muted-foreground text-xs">
          Legacy: {scan ? scan.legacy_root : "scanning..."}
        </p>
        <p className="break-all font-mono text-muted-foreground text-xs">
          New: {scan ? scan.new_root : "scanning..."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!controls.canScan}
          onClick={scanOrRetryStatus}
          variant="outline"
        >
          {retryStatus ? (
            <RefreshCw />
          ) : (
            <ScanSearch className={cn(busy && !runId && "animate-pulse")} />
          )}
          {retryStatus ? "Retry Status" : "Scan"}
        </Button>
        <Button
          disabled={!controls.canRepair}
          onClick={requestSpriteRepair}
          variant="outline"
        >
          <Wrench />
          Repair Sprites
        </Button>
        <Button
          disabled={!controls.canMigrateSelected}
          onClick={migrateSelected}
        >
          <Play />
          Migrate Selected
        </Button>
        <Button
          disabled={!controls.canMigrateAll}
          onClick={migrateAll}
          variant="outline"
        >
          <PlayCircle />
          Migrate All
        </Button>
        {controls.showRetry ? (
          <Button
            disabled={!controls.canRetry}
            onClick={retryFailed}
            variant="outline"
          >
            <RotateCcw />
            Retry Failed
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar() {
  const run = useMigrationStore((store) => store.run);
  const progress = migrationProgress(run);
  return (
    <div className="flex flex-col gap-2">
      <Progress value={progress.percent} />
      <p className="text-muted-foreground text-sm">{progress.text}</p>
    </div>
  );
}

function pillVariant(pill: string): "success" | "secondary" | "outline" {
  if (pill === "migrated") {
    return "success";
  }
  return pill === "config" ? "secondary" : "outline";
}

function CharacterRow({ character }: { character: LegacyCharacter }) {
  const selected = useMigrationStore((store) =>
    store.selected.includes(character.legacy_name)
  );
  const migrated = isCharacterMigrated(character);
  const pill = characterPill(character);
  const id = useId();
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card px-3 py-2",
        migrated ? "opacity-60" : "hover:bg-muted/40"
      )}
    >
      <Checkbox
        checked={!migrated && selected}
        disabled={migrated}
        id={id}
        onCheckedChange={(checked) =>
          toggleMigrationCharacter(character.legacy_name, checked === true)
        }
      />
      <label
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !migrated && "cursor-pointer"
        )}
        htmlFor={id}
      >
        <span className="truncate font-medium text-sm">
          {characterTitle(character)}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {characterMeta(character)}
        </span>
      </label>
      <Badge variant={pillVariant(pill)}>{pill}</Badge>
    </div>
  );
}

function CharacterList() {
  const scan = useMigrationStore((store) => store.scan);
  const busy = useMigrationStore((store) => store.busy);
  if (!scan) {
    if (busy) {
      return (
        <div className="flex flex-col gap-2">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton className="h-14 w-full" key={key} />
          ))}
        </div>
      );
    }
    return (
      <Empty className="min-h-[30vh] border">
        <EmptyHeader>
          <EmptyTitle>Not scanned yet</EmptyTitle>
          <EmptyDescription>
            Press Scan to look for legacy characters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (scan.characters.length === 0) {
    return (
      <Empty className="min-h-[30vh] border">
        <EmptyHeader>
          <EmptyTitle>No legacy characters found.</EmptyTitle>
          <EmptyDescription>
            Nothing under the legacy path needs migrating.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {scan.characters.map((character) => (
        <CharacterRow character={character} key={character.legacy_name} />
      ))}
    </div>
  );
}

function FailedSheets() {
  const run = useMigrationStore((store) => store.run);
  const failed = (run?.results ?? []).filter(
    (result) => result.failed_sheet_paths?.length
  );
  if (failed.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-medium text-sm">Failed sheets</h2>
      <ul className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 font-mono text-xs">
        {failed.map((result) => (
          <li className="flex flex-col gap-1" key={result.legacy_name}>
            <span className="font-semibold">{result.legacy_name}</span>
            {result.failed_sheet_paths?.map((path) => (
              <span className="break-all text-destructive" key={path}>
                {path}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Details() {
  const scan = useMigrationStore((store) => store.scan);
  const selected = useMigrationStore((store) => store.selected);
  const log = useMigrationStore((store) => store.log);
  const count = selectedForMigration({ scan, selected }).length;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {migrationSummary(scan, count).map((item) => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
      <pre className="max-h-[55vh] min-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
        {log}
      </pre>
      <FailedSheets />
    </div>
  );
}

function RepairDialog() {
  const open = useMigrationStore((store) => store.confirmRepair);
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          closeSpriteRepair();
        }
      }}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repair sprite canvases?</DialogTitle>
          <DialogDescription>
            Scans every sprite folder in the VNCCS output folder and pads
            sprites whose canvas is smaller than the largest one in their
            folder. Sprites are changed in place; the originals are first copied
            to a{" "}
            <code className="font-mono">
              .vnccs_canvas_repair_backup_&lt;timestamp&gt;/
            </code>{" "}
            folder inside each repaired sprite folder.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={closeSpriteRepair} variant="outline">
            Cancel
          </Button>
          <Button onClick={confirmSpriteRepair}>Repair Sprites</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MigrationAssistant() {
  useEffect(() => {
    enterMigration();
    return leaveMigration;
  }, []);

  return (
    <>
      <Header />
      <ProgressBar />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CharacterList />
        <Details />
      </div>
      <RepairDialog />
    </>
  );
}

/** The Migration Assistant: move legacy characters into the current storage root. */
export function MigrationPage() {
  return (
    <ConnectionGate>
      <Page className="max-w-[96rem]">
        <MigrationAssistant />
      </Page>
    </ConnectionGate>
  );
}
