"use client";

import { ConnectionGate } from "@workspace/core/components/common/connection-gate";
import { Page } from "@workspace/core/components/common/page";
import { CharacterColumn } from "@workspace/core/components/emotions/character-column";
import { GenerationColumn } from "@workspace/core/components/emotions/generation-column";
import { SelectionColumn } from "@workspace/core/components/emotions/selection-column";
import { GeneratorPanel } from "@workspace/core/components/generator/generator-panel";
import { useDownloadPolling } from "@workspace/core/hooks/use-control-center";
import { useEmotionModel } from "@workspace/core/hooks/use-emotions";
import {
  useGenerator,
  useGeneratorProgress,
} from "@workspace/core/hooks/use-generator";
import {
  EMOTIONS_GENERATOR,
  initEmotions,
  leaveEmotions,
  queueEmotions,
  syncEmotionCatalogDefaults,
} from "@workspace/core/lib/emotion-actions";
import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { useEmotionStore } from "@workspace/core/stores/emotion-store";
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
import { Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function EmotionsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {["character", "emotions", "generation"].map((column) => (
        <div className="flex flex-col gap-3" key={column}>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmotionsLoadError({ error }: { error: string }) {
  return (
    <Empty className="min-h-[40vh]">
      <EmptyHeader>
        <EmptyTitle>Could not load the Emotion Studio</EmptyTitle>
        <EmptyDescription>{error}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => initEmotions()} variant="outline">
          Retry
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function EmotionsWorkspace() {
  const model = useEmotionModel();
  const loadError = useEmotionStore((store) => store.loadError);
  const ready = useEmotionStore((store) => store.state !== null);
  const catalog = useControlCenterStore((store) => store.catalog);
  const workflowBusy = useConnectionStore(
    (store) => store.queue.pending + store.queue.running > 0
  );
  const job = useJobStore((store) => store.current);
  const [running, setRunning] = useState(false);
  const character = model?.state.character ?? "";
  const pairs = model?.emotionPairs();
  const pairsKey = pairs ? JSON.stringify(pairs) : "";
  const sources = useMemo(
    () => ({
      character,
      emotionMode: "qi2",
      emotionPairs: pairsKey ? JSON.parse(pairsKey) : undefined,
    }),
    [character, pairsKey]
  );
  const generator = useGenerator(
    EMOTIONS_GENERATOR.kind,
    EMOTIONS_GENERATOR.nodeId,
    sources
  );
  useGeneratorProgress(EMOTIONS_GENERATOR, running || workflowBusy);

  useEffect(() => {
    initEmotions();
    return () => leaveEmotions();
  }, []);

  useEffect(() => {
    if (catalog && ready) {
      syncEmotionCatalogDefaults();
    }
  }, [catalog, ready]);

  const run = async () => {
    setRunning(true);
    try {
      await queueEmotions();
    } finally {
      setRunning(false);
    }
  };

  let runLabel = "Generate emotions";
  if (running) {
    runLabel = job?.status === "queued" ? "Queued…" : "Generating…";
  }

  if (loadError && !model) {
    return <EmotionsLoadError error={loadError} />;
  }

  return (
    <Tabs defaultValue="studio">
      <div className="flex flex-wrap items-center gap-3">
        <TabsList>
          <TabsTrigger value="studio">Studio</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
        <div className="ml-auto flex items-center gap-3">
          <Button
            disabled={!(model && character) || running}
            onClick={run}
            title="Queue Step 3: Emotion Studio and the Emotions Generator"
          >
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {runLabel}
          </Button>
        </div>
      </div>
      <TabsContent className="mt-4" value="studio">
        {model ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,22rem)]">
            <CharacterColumn model={model} />
            <SelectionColumn model={model} />
            <GenerationColumn model={model} />
          </div>
        ) : (
          <EmotionsSkeleton />
        )}
      </TabsContent>
      <TabsContent className="mt-4" value="results">
        {generator ? (
          <GeneratorPanel handle={generator} sources={sources} />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </TabsContent>
    </Tabs>
  );
}

/** Step 3: Emotion Studio and the Emotions Generator. */
export function EmotionsPage() {
  useDownloadPolling();
  return (
    <ConnectionGate>
      <Page className="max-w-[96rem]">
        <EmotionsWorkspace />
      </Page>
    </ConnectionGate>
  );
}
