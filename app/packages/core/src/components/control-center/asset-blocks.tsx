"use client";

import {
  CcBlock,
  EmptyEntries,
} from "@workspace/core/components/control-center/cc-block";
import {
  BlockedNote,
  DownloadBar,
  EntryAction,
  StatusBadge,
  useEntryView,
} from "@workspace/core/components/control-center/entry-status";
import type {
  CatalogEntry,
  DownloadCategory,
} from "@workspace/vnccs/control-center";
import type {
  CatalogItem,
  ControlCenterModel,
} from "@workspace/vnccs/control-center-state";

function AssetCard({ item }: { item: CatalogItem }) {
  const { category, entry } = item;
  const view = useEntryView(category, entry);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <span className="pt-0.5 font-medium text-muted-foreground text-xs uppercase">
          {category === "clip" ? "CLIP" : "VAE"}
        </span>
        <span className="min-w-0 flex-1 font-medium text-sm">{entry.name}</span>
        <StatusBadge view={view} />
      </div>
      {entry.description ? (
        <p className="text-muted-foreground text-xs">{entry.description}</p>
      ) : null}
      <DownloadBar view={view} />
      <EntryAction category={category} entry={entry} size="xs" view={view} />
      <BlockedNote view={view} />
    </div>
  );
}

export function ClipVaeBlock({ model }: { model: ControlCenterModel }) {
  const items = model.clipVaeEntries();
  return (
    <CcBlock blockKey="clip_vae" count={items.length} title="CLIP + VAE">
      {items.length === 0 ? (
        <EmptyEntries />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <AssetCard
              item={item}
              key={`${item.category}:${item.entry.name}`}
            />
          ))}
        </div>
      )}
    </CcBlock>
  );
}

function UtilityRow({
  category,
  entry,
}: {
  category: DownloadCategory;
  entry: CatalogEntry;
}) {
  const view = useEntryView(category, entry);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium text-sm">{entry.name}</span>
          {entry.description ? (
            <span className="text-muted-foreground text-xs">
              {entry.description}
            </span>
          ) : null}
        </div>
        <StatusBadge view={view} />
        <EntryAction category={category} entry={entry} size="xs" view={view} />
      </div>
      <DownloadBar view={view} />
    </div>
  );
}

/** ControlNet and other utility files, shown for every family. */
export function UtilityBlock({
  category,
  model,
  title,
}: {
  category: "controlnet" | "other";
  model: ControlCenterModel;
  title: string;
}) {
  const entries = model.catalog?.[category] ?? [];
  return (
    <CcBlock blockKey={category} count={entries.length} title={title}>
      {entries.length === 0 ? (
        <EmptyEntries />
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <UtilityRow category={category} entry={entry} key={entry.name} />
          ))}
        </div>
      )}
    </CcBlock>
  );
}
