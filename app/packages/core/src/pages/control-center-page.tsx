"use client";

import { ConnectionGate } from "@workspace/core/components/common/connection-gate";
import { Page } from "@workspace/core/components/common/page";
import {
  ClipVaeBlock,
  UtilityBlock,
} from "@workspace/core/components/control-center/asset-blocks";
import {
  ControlCenterSettingsDialog,
  DownloadAllDialog,
} from "@workspace/core/components/control-center/control-center-dialogs";
import {
  CustomLoraBlock,
  PipeLoraBlock,
} from "@workspace/core/components/control-center/lora-blocks";
import { ModelBlock } from "@workspace/core/components/control-center/model-block";
import { ModuleStrip } from "@workspace/core/components/control-center/module-strip";
import {
  useControlCenterModel,
  useDownloadPolling,
} from "@workspace/core/hooks/use-control-center";
import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import {
  type CatalogItem,
  type ControlCenterModel,
  MODEL_FAMILIES,
  type ModelKind,
} from "@workspace/vnccs/control-center-state";
import { CircleAlert, Download, RotateCw, Settings2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function FamilyTabs({ model }: { model: ControlCenterModel }) {
  const update = useControlCenterStore((state) => state.update);
  return (
    <Tabs
      onValueChange={(kind) =>
        update((next) => next.setActiveKind(kind as ModelKind))
      }
      value={model.activeKind()}
    >
      <TabsList aria-label="Model family">
        {MODEL_FAMILIES.map((family) => (
          <TabsTrigger className="px-4" key={family.kind} value={family.kind}>
            {family.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function UnsupportedKindNotice({ model }: { model: ControlCenterModel }) {
  const update = useControlCenterStore((state) => state.update);
  if (model.state.unsupported_model_kind !== "QIE2511") {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <span className="flex-1">
        QIE2511 is no longer supported. Choose QI2 to run this workflow.
      </span>
      <Button
        onClick={() => update((next) => next.dismissUnsupportedKind())}
        size="sm"
        variant="outline"
      >
        Use QI2
      </Button>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-9 w-96" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function CatalogError({ error }: { error: string }) {
  const loadCatalog = useControlCenterStore((state) => state.loadCatalog);
  const repoId = useControlCenterStore((state) => state.repoId);
  return (
    <Empty className="min-h-[40vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>Could not load the catalog</EmptyTitle>
        <EmptyDescription>
          {repoId}: {error}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => loadCatalog({ force: true })}>Retry</Button>
      </EmptyContent>
    </Empty>
  );
}

function Blocks({ model }: { model: ControlCenterModel }) {
  const type = model.selectedType();
  return (
    <div className="flex flex-col gap-4">
      <FamilyTabs model={model} />
      <UnsupportedKindNotice model={model} />
      <ModelBlock model={model} />
      {type === "custom" || type === "checkpoint" ? null : (
        <ClipVaeBlock model={model} />
      )}
      <PipeLoraBlock model={model} />
      <CustomLoraBlock model={model} />
      <UtilityBlock category="controlnet" model={model} title="ControlNet" />
      <UtilityBlock category="other" model={model} title="Other" />
    </div>
  );
}

export function ControlCenterPage() {
  useDownloadPolling();
  const catalog = useControlCenterStore((state) => state.catalog);
  const catalogError = useControlCenterStore((state) => state.catalogError);
  const loading = useControlCenterStore((state) => state.loadingCatalog);
  const loadCatalog = useControlCenterStore((state) => state.loadCatalog);
  const model = useControlCenterModel();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadItems, setDownloadItems] = useState<CatalogItem[] | null>(
    null
  );

  const openDownloadAll = () => {
    const items = model.downloadAllCandidates();
    if (items.length === 0) {
      toast.success("All selected items are installed.");
    } else {
      setDownloadItems(items);
    }
  };

  let body = <CatalogSkeleton />;
  if (catalog) {
    body = <Blocks model={model} />;
  } else if (catalogError && !loading) {
    body = <CatalogError error={catalogError} />;
  }

  return (
    <ConnectionGate>
      <Page className="max-w-6xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-semibold text-base">
              {catalog?.name || "Control Center"}
            </h2>
            <p className="text-muted-foreground text-xs">
              {catalog
                ? `Catalog from ${catalog.source === "huggingface" ? "Hugging Face" : "the installed package"}`
                : "Loading the catalog…"}
            </p>
          </div>
          <Button
            disabled={loading}
            onClick={() => loadCatalog({ force: true })}
            variant="outline"
          >
            <RotateCw className={loading ? "animate-spin" : undefined} />
            Refresh
          </Button>
          <Button
            disabled={!catalog}
            onClick={() => setSettingsOpen(true)}
            variant="outline"
          >
            <Settings2 />
            Settings
          </Button>
          <Button disabled={!catalog} onClick={openDownloadAll}>
            <Download />
            Download / Update
          </Button>
        </div>
        <ModuleStrip />
        {catalog && catalogError ? (
          <p className="text-destructive text-sm">
            Refresh failed: {catalogError}
          </p>
        ) : null}
        {body}
        {settingsOpen ? (
          <ControlCenterSettingsDialog
            model={model}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
        {downloadItems ? (
          <DownloadAllDialog
            items={downloadItems}
            onClose={() => setDownloadItems(null)}
          />
        ) : null}
      </Page>
    </ConnectionGate>
  );
}
