"use client";

import { ConnectionGate } from "@workspace/core/components/common/connection-gate";
import { Page } from "@workspace/core/components/common/page";
import { AttributesColumn } from "@workspace/core/components/create/attributes-column";
import { CharacterColumn } from "@workspace/core/components/create/character-column";
import {
  GenerationColumn,
  PromptsRow,
} from "@workspace/core/components/create/generation-column";
import { GeneratorPanel } from "@workspace/core/components/generator/generator-panel";
import { PoseStudioSlot } from "@workspace/core/components/pose-studio/pose-studio-slot";
import { useDownloadPolling } from "@workspace/core/hooks/use-control-center";
import { useCreatorModel } from "@workspace/core/hooks/use-creator";
import {
  useGenerator,
  useGeneratorProgress,
} from "@workspace/core/hooks/use-generator";
import { usePoseStudio } from "@workspace/core/hooks/use-pose-studio";
import { useComfyEvent } from "@workspace/core/lib/comfy-events";
import {
  initCreator,
  queueCharacterSheets,
  tryCachePreview,
} from "@workspace/core/lib/creator-actions";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { useCreatorStore } from "@workspace/core/stores/creator-store";
import type { GeneratorTarget } from "@workspace/core/stores/generator-store";
import { useJobStore } from "@workspace/core/stores/job-store";
import { usePoseStudioStore } from "@workspace/core/stores/pose-studio-store";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { CREATOR_IDS } from "@workspace/vnccs/graphs";
import { Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const GENERATOR: GeneratorTarget = {
  kind: "base",
  nodeId: CREATOR_IDS.generator,
};

function CreatorSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {["character", "attributes", "generation"].map((column) => (
        <div className="flex flex-col gap-3" key={column}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ))}
    </div>
  );
}

function CreatorLoadError({ error }: { error: string }) {
  return (
    <Empty className="min-h-[40vh]">
      <EmptyHeader>
        <EmptyTitle>Could not load the Creator</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => initCreator()} variant="outline">
          Retry
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Keeps the Pose Studio mannequin on the Creator's age and sex. */
function useMannequinSync(age: unknown, sex: unknown) {
  useEffect(() => {
    if (sex === undefined) {
      return;
    }
    usePoseStudioStore
      .getState()
      .setCharacter({ age: Number(age) || 18, sex: String(sex || "female") });
  }, [age, sex]);
}

function CreateWorkspace() {
  const model = useCreatorModel();
  const loadError = useCreatorStore((store) => store.loadError);
  const nodeState = useControlCenterStore((store) => store.nodeState);
  const poseHost = usePoseStudio(CREATOR_IDS.pose);
  const workflowBusy = useConnectionStore(
    (store) => store.queue.pending + store.queue.running > 0
  );
  const job = useJobStore((store) => store.current);
  const [running, setRunning] = useState(false);
  const character = model?.state.character ?? "";
  const info = model?.state.character_info;
  const sources = useMemo(
    () => ({ character, nodeState }),
    [character, nodeState]
  );
  const generator = useGenerator(GENERATOR.kind, GENERATOR.nodeId, sources);
  useGeneratorProgress(GENERATOR, running || workflowBusy);
  useMannequinSync(info?.age, info?.sex);

  useEffect(() => {
    initCreator();
  }, []);

  useComfyEvent("vnccs.preview.updated", (event) => {
    const detail = event as { character?: unknown; node_id?: unknown } | null;
    const current = useCreatorStore.getState().state?.character;
    if (
      String(detail?.node_id ?? "") === CREATOR_IDS.source &&
      current &&
      detail?.character === current
    ) {
      tryCachePreview(current);
    }
  });

  const run = async () => {
    setRunning(true);
    try {
      await queueCharacterSheets(sources);
    } finally {
      setRunning(false);
    }
  };

  let runLabel = "Generate sheets";
  if (running) {
    runLabel = job?.status === "queued" ? "Queued…" : "Generating…";
  }

  if (loadError && !model) {
    return <CreatorLoadError error={loadError} />;
  }

  return (
    <Tabs defaultValue="character">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="character">Character</TabsTrigger>
          <TabsTrigger value="pose">Pose</TabsTrigger>
          <TabsTrigger value="sheets">Sheets</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-3">
          {poseHost?.ready ? null : (
            <span className="text-muted-foreground text-xs">
              Pose Studio is loading…
            </span>
          )}
          <Button
            disabled={!(model && character) || running}
            onClick={run}
            title="Queue Step 1: Control Center, Creator, Pose Studio and the Character Generator"
          >
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {runLabel}
          </Button>
        </div>
      </div>
      <TabsContent className="mt-4" value="character">
        {model ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,1fr)]">
              <CharacterColumn model={model} />
              <AttributesColumn model={model} />
              <GenerationColumn model={model} />
            </div>
            <PromptsRow model={model} />
          </div>
        ) : (
          <CreatorSkeleton />
        )}
      </TabsContent>
      <TabsContent className="mt-4" value="pose">
        <PoseStudioSlot
          className="h-[calc(100vh-14rem)] min-h-[32rem] overflow-hidden rounded-lg border"
          nodeId={CREATOR_IDS.pose}
        />
      </TabsContent>
      <TabsContent className="mt-4" value="sheets">
        {generator ? (
          <GeneratorPanel handle={generator} sources={sources} />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </TabsContent>
    </Tabs>
  );
}

/** Step 1: Character Creator V2, Pose Studio and the Character Generator. */
export function CreatePage() {
  useDownloadPolling();
  return (
    <ConnectionGate>
      <Page className="max-w-[96rem]">
        <CreateWorkspace />
      </Page>
    </ConnectionGate>
  );
}
