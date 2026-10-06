"use client";

import {
  AttributesColumn,
  PromptsRow,
} from "@workspace/core/components/clone/attributes-column";
import { DescribeDialog } from "@workspace/core/components/clone/cloner-dialogs";
import { SourceColumn } from "@workspace/core/components/clone/source-column";
import { ConnectionGate } from "@workspace/core/components/common/connection-gate";
import { Page } from "@workspace/core/components/common/page";
import { useQwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import { GeneratorPanel } from "@workspace/core/components/generator/generator-panel";
import { PoseStudioSlot } from "@workspace/core/components/pose-studio/pose-studio-slot";
import { useClonerModel } from "@workspace/core/hooks/use-cloner";
import { useDownloadPolling } from "@workspace/core/hooks/use-control-center";
import {
  useGenerator,
  useGeneratorProgress,
} from "@workspace/core/hooks/use-generator";
import { usePoseStudio } from "@workspace/core/hooks/use-pose-studio";
import {
  handleValidationError,
  initCloner,
  leaveCloner,
  queueCloneSheets,
  watchClonerBackground,
} from "@workspace/core/lib/cloner-actions";
import { useComfyEvent } from "@workspace/core/lib/comfy-events";
import { useClonerStore } from "@workspace/core/stores/cloner-store";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
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
import { CLONER_IDS } from "@workspace/vnccs/graphs";
import { Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const GENERATOR: GeneratorTarget = {
  kind: "clone",
  nodeId: CLONER_IDS.generator,
};

function ClonerSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {["source", "attributes"].map((column) => (
        <div className="flex flex-col gap-3" key={column}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ))}
    </div>
  );
}

function ClonerLoadError({ error }: { error: string }) {
  return (
    <Empty className="min-h-[40vh]">
      <EmptyHeader>
        <EmptyTitle>Could not load the Character Cloner</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => initCloner()} variant="outline">
          Retry
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Keeps the Pose Studio mannequin on the Cloner's age and sex. */
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

function CloneWorkspace() {
  const model = useClonerModel();
  const loadError = useClonerStore((store) => store.loadError);
  const nodeState = useControlCenterStore((store) => store.nodeState);
  const poseHost = usePoseStudio(CLONER_IDS.pose);
  const workflowBusy = useConnectionStore(
    (store) => store.queue.pending + store.queue.running > 0
  );
  const job = useJobStore((store) => store.current);
  const gate = useQwenModelGate({ vision: true });
  const [running, setRunning] = useState(false);
  const character = model?.state.character ?? "";
  const info = model?.state.character_info;
  const nsfw = Boolean(info?.nsfw);
  const sources = useMemo(
    () => ({ character, nodeState, nsfw }),
    [character, nodeState, nsfw]
  );
  const generator = useGenerator(GENERATOR.kind, GENERATOR.nodeId, sources);
  useGeneratorProgress(GENERATOR, running || workflowBusy);
  useMannequinSync(info?.age, info?.sex);

  useEffect(() => {
    initCloner();
    const unwatch = watchClonerBackground();
    return () => {
      unwatch();
      leaveCloner();
    };
  }, []);

  useComfyEvent(
    "vnccs.character_cloner.validation_error",
    handleValidationError
  );

  const run = async () => {
    setRunning(true);
    try {
      await queueCloneSheets(sources);
    } finally {
      setRunning(false);
    }
  };

  let runLabel = "Generate sheets";
  if (running) {
    runLabel = job?.status === "queued" ? "Queued…" : "Generating…";
  }

  if (loadError && !model) {
    return <ClonerLoadError error={loadError} />;
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
            title="Queue Step 1.1: Control Center, Character Cloner, Pose Studio and the Clone Generator"
          >
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {runLabel}
          </Button>
        </div>
      </div>
      <TabsContent className="mt-4" value="character">
        {model ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <SourceColumn model={model} />
              <AttributesColumn gate={gate} model={model} />
            </div>
            <PromptsRow model={model} />
          </div>
        ) : (
          <ClonerSkeleton />
        )}
      </TabsContent>
      <TabsContent className="mt-4" value="pose">
        <PoseStudioSlot
          className="h-[calc(100vh-14rem)] min-h-[32rem] overflow-hidden rounded-lg border"
          nodeId={CLONER_IDS.pose}
        />
      </TabsContent>
      <TabsContent className="mt-4" value="sheets">
        {generator ? (
          <GeneratorPanel handle={generator} sources={sources} />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </TabsContent>
      <DescribeDialog gate={gate} />
      {gate.dialog}
    </Tabs>
  );
}

/** Step 1.1: Character Cloner, Pose Studio and the Clone Generator. */
export function ClonePage() {
  useDownloadPolling();
  return (
    <ConnectionGate>
      <Page className="max-w-[96rem]">
        <CloneWorkspace />
      </Page>
    </ConnectionGate>
  );
}
