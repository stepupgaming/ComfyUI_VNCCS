"use client";

import { CostumeColumn } from "@workspace/core/components/clothes/costume-column";
import { DesignColumn } from "@workspace/core/components/clothes/design-column";
import { ConnectionGate } from "@workspace/core/components/common/connection-gate";
import { Page } from "@workspace/core/components/common/page";
import { useQwenModelGate } from "@workspace/core/components/common/qwen-model-gate";
import { GeneratorPanel } from "@workspace/core/components/generator/generator-panel";
import { PoseStudioSlot } from "@workspace/core/components/pose-studio/pose-studio-slot";
import {
  useClothesModel,
  useClothesUi,
} from "@workspace/core/hooks/use-clothes";
import { useDownloadPolling } from "@workspace/core/hooks/use-control-center";
import {
  useGenerator,
  useGeneratorProgress,
} from "@workspace/core/hooks/use-generator";
import { usePoseStudio } from "@workspace/core/hooks/use-pose-studio";
import {
  CLOTHES_GENERATOR,
  clothesSession,
  initClothes,
  leaveClothes,
  queueClothesSheets,
  syncClothesMannequin,
  watchClothesControlCenter,
} from "@workspace/core/lib/clothes-actions";
import { useComfyEvent } from "@workspace/core/lib/comfy-events";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { useJobStore } from "@workspace/core/stores/job-store";
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
import { CLOTHES_IDS } from "@workspace/vnccs/graphs";
import { Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function ClothesSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      {["design", "costume"].map((column) => (
        <div className="flex flex-col gap-3" key={column}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ))}
    </div>
  );
}

function ClothesLoadError({ error }: { error: string }) {
  return (
    <Empty className="min-h-[40vh]">
      <EmptyHeader>
        <EmptyTitle>Could not load the Clothes Designer</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => initClothes()} variant="outline">
          Retry
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function NoCharacters() {
  return (
    <Empty className="min-h-[40vh]">
      <EmptyHeader>
        <EmptyTitle>No characters yet</EmptyTitle>
        <EmptyDescription>
          Create a character in Step 1 first; its sprites are the base the
          costumes are drawn on.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ClothesWorkspace() {
  const model = useClothesModel();
  const ui = useClothesUi();
  const nodeState = useControlCenterStore((store) => store.nodeState);
  const poseHost = usePoseStudio(CLOTHES_IDS.pose);
  const workflowBusy = useConnectionStore(
    (store) => store.queue.pending + store.queue.running > 0
  );
  const job = useJobStore((store) => store.current);
  const gate = useQwenModelGate({ vision: false });
  const [running, setRunning] = useState(false);
  const character = model?.state.character ?? "";
  const info = model?.state.character_info;
  const nsfw = Boolean(info?.nsfw);
  const sources = useMemo(
    () => ({ character, nodeState, nsfw }),
    [character, nodeState, nsfw]
  );
  const generator = useGenerator(
    CLOTHES_GENERATOR.kind,
    CLOTHES_GENERATOR.nodeId,
    sources
  );
  useGeneratorProgress(CLOTHES_GENERATOR, running || workflowBusy);

  const age = info?.age;
  const sex = info?.sex;
  useEffect(() => {
    if (sex !== undefined) {
      syncClothesMannequin(age, sex);
    }
  }, [age, sex]);

  useEffect(() => {
    initClothes();
    const unwatch = watchClothesControlCenter();
    return () => {
      unwatch();
      leaveClothes();
    };
  }, []);

  useComfyEvent("vnccs.preview.updated", (detail) =>
    clothesSession().handlePreviewUpdated(detail)
  );
  useComfyEvent("vnccs.clothes_designer.validation_error", (detail) =>
    clothesSession().handleValidationError(detail)
  );

  const run = async () => {
    setRunning(true);
    try {
      await queueClothesSheets(sources);
    } finally {
      setRunning(false);
    }
  };

  let runLabel = "Generate sheets";
  if (running) {
    runLabel = job?.status === "queued" ? "Queued…" : "Generating…";
  }

  if (ui.loadError && !model) {
    return <ClothesLoadError error={ui.loadError} />;
  }

  let design = <ClothesSkeleton />;
  if (model && !character) {
    design = <NoCharacters />;
  } else if (model) {
    design = (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <DesignColumn model={model} />
        <CostumeColumn gate={gate} model={model} />
      </div>
    );
  }

  return (
    <Tabs defaultValue="design">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="design">Design</TabsTrigger>
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
            disabled={!(model?.editable() && character) || running}
            onClick={run}
            title="Queue Step 2: Control Center, Clothes Designer, Pose Studio and the Clothes Generator"
          >
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {runLabel}
          </Button>
        </div>
      </div>
      <TabsContent className="mt-4" value="design">
        {design}
      </TabsContent>
      <TabsContent className="mt-4" value="pose">
        <PoseStudioSlot
          className="h-[calc(100vh-14rem)] min-h-[32rem] overflow-hidden rounded-lg border"
          nodeId={CLOTHES_IDS.pose}
        />
      </TabsContent>
      <TabsContent className="mt-4" value="sheets">
        {generator ? (
          <GeneratorPanel handle={generator} sources={sources} />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </TabsContent>
      {gate.dialog}
    </Tabs>
  );
}

/** Step 2: Clothes Designer, Pose Studio and the Clothes Generator. */
export function ClothesPage() {
  useDownloadPolling();
  return (
    <ConnectionGate>
      <Page className="max-w-[96rem]">
        <ClothesWorkspace />
      </Page>
    </ConnectionGate>
  );
}
