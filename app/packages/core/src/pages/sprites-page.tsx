"use client";

import { ConnectionGate } from "@workspace/core/components/common/connection-gate";
import { Page } from "@workspace/core/components/common/page";
import { RemoteImage } from "@workspace/core/components/common/remote-image";
import {
  closeCleanup,
  confirmCleanup,
  initSprites,
  leaveSprites,
  scanEmptyFolders,
  selectSpriteCharacter,
  selectSpriteEmotion,
} from "@workspace/core/lib/sprite-manager-actions";
import { studioHttp } from "@workspace/core/lib/studio";
import { useSpriteManagerStore } from "@workspace/core/stores/sprite-manager-store";
import { Button } from "@workspace/ui/components/button";
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import {
  cleanupTitle,
  emptyCostumesMessage,
  spriteSheetPreviewUrl,
} from "@workspace/vnccs/sprite-manager";
import { BrushCleaning, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useId, useState } from "react";

function CostumeCard({
  character,
  costume,
  emotion,
  stamp,
}: {
  character: string;
  costume: string;
  emotion: string;
  stamp: number;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="flex flex-col gap-2 rounded-lg border bg-card p-2">
      <div className="flex h-80 items-center justify-center overflow-hidden rounded-md bg-muted/40">
        <RemoteImage
          alt={`${costume} · ${emotion}`}
          className={cn(
            "max-h-full max-w-full object-contain",
            failed && "opacity-30"
          )}
          loading="lazy"
          onError={() => setFailed(true)}
          src={spriteSheetPreviewUrl(
            studioHttp(),
            character,
            costume,
            emotion,
            stamp
          )}
        />
      </div>
      <figcaption className="truncate text-center text-sm" title={costume}>
        {costume}
      </figcaption>
    </figure>
  );
}

function CleanupDialog() {
  const cleanup = useSpriteManagerStore((store) => store.cleanup);
  const deleting = useSpriteManagerStore((store) => store.deleting);
  if (!cleanup) {
    return null;
  }
  const empty = cleanup.folders.length === 0;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          closeCleanup();
        }
      }}
      open={true}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cleanupTitle(cleanup)}</DialogTitle>
          <DialogDescription>
            {empty
              ? "All folders contain images. Nothing to clean up!"
              : "Only folders without any file are removed. Your images won't be deleted."}
          </DialogDescription>
        </DialogHeader>
        {empty ? null : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
            {cleanup.folders.map((folder) => (
              <li className="flex justify-between gap-4" key={folder.path}>
                <span className="break-all">{folder.path}</span>
                <span className="shrink-0 text-muted-foreground">
                  {folder.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button disabled={deleting} onClick={closeCleanup} variant="outline">
            {empty ? "Close" : "Cancel"}
          </Button>
          {empty ? null : (
            <Button
              disabled={deleting}
              onClick={confirmCleanup}
              variant="destructive"
            >
              {deleting ? <Loader2 className="animate-spin" /> : null}
              Delete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toolbar() {
  const characters = useSpriteManagerStore((store) => store.characters);
  const character = useSpriteManagerStore((store) => store.character);
  const emotions = useSpriteManagerStore((store) => store.emotions);
  const emotion = useSpriteManagerStore((store) => store.emotion);
  const loading = useSpriteManagerStore((store) => store.loading);
  const scanning = useSpriteManagerStore((store) => store.scanning);
  const characterId = useId();
  const emotionId = useId();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex w-56 flex-col gap-2">
        <Label htmlFor={characterId}>Character</Label>
        <Select
          disabled={characters.length === 0}
          onValueChange={(value) => selectSpriteCharacter(value)}
          value={character || undefined}
        >
          <SelectTrigger className="w-full" id={characterId}>
            <SelectValue
              placeholder={
                characters.length === 0 ? "No characters" : "Select…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {characters.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex w-56 flex-col gap-2">
        <Label htmlFor={emotionId}>Emotion</Label>
        <Select
          disabled={!character}
          onValueChange={(value) => selectSpriteEmotion(value)}
          value={emotion}
        >
          <SelectTrigger className="w-full" id={emotionId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {emotions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="ml-auto flex gap-2">
        <Button
          disabled={loading}
          onClick={() => initSprites()}
          variant="outline"
        >
          <RefreshCw className={cn(loading && "animate-spin")} />
          Refresh
        </Button>
        <Button
          disabled={!character || scanning}
          onClick={scanEmptyFolders}
          title="Safe cleanup: removes only empty folders. Your images won't be deleted."
          variant="outline"
        >
          {scanning ? <Loader2 className="animate-spin" /> : <BrushCleaning />}
          Remove empty folders
        </Button>
      </div>
    </div>
  );
}

function CostumeGrid() {
  const state = useSpriteManagerStore();
  const message = emptyCostumesMessage(state);
  if (state.loading && state.costumes.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
        {["a", "b", "c"].map((key) => (
          <Skeleton className="h-88 w-full" key={key} />
        ))}
      </div>
    );
  }
  if (message) {
    return (
      <Empty className="min-h-[40vh]">
        <EmptyHeader>
          <EmptyTitle>{message}</EmptyTitle>
          <EmptyDescription>
            {state.character
              ? `${state.character} has no sprites for “${state.emotion}”. Generate sheets on the Create or Clothes page, or emotions on the Emotions page.`
              : "Create a character first."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
      {state.costumes.map((costume) => (
        <CostumeCard
          character={state.character}
          costume={costume}
          emotion={state.emotion}
          key={`${state.character}/${state.emotion}/${costume}/${state.previewStamp}`}
          stamp={state.previewStamp}
        />
      ))}
    </div>
  );
}

function SpriteBrowser() {
  const loadError = useSpriteManagerStore((store) => store.loadError);

  useEffect(() => {
    initSprites();
    return leaveSprites;
  }, []);

  if (loadError) {
    return (
      <Empty className="min-h-[40vh]">
        <EmptyHeader>
          <EmptyTitle>Could not load the Sprite Manager</EmptyTitle>
          <EmptyDescription>{loadError}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => initSprites()} variant="outline">
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <>
      <Toolbar />
      <CostumeGrid />
      <CleanupDialog />
    </>
  );
}

/** The Sprite Manager: every costume's newest sprite for one emotion. */
export function SpritesPage() {
  return (
    <ConnectionGate>
      <Page className="max-w-[96rem]">
        <SpriteBrowser />
      </Page>
    </ConnectionGate>
  );
}
