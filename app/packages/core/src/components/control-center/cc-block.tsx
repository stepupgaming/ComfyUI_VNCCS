"use client";

import { useControlCenterStore } from "@workspace/core/stores/control-center-store";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** A collapsible Control Center block. Collapse state lives in node_state, as in the widget. */
export function CcBlock({
  blockKey,
  children,
  count,
  title,
}: {
  blockKey: string;
  children: ReactNode;
  count: number;
  title: string;
}) {
  const collapsed = useControlCenterStore(
    (state) => state.nodeState.collapsed?.[blockKey] ?? false
  );
  const update = useControlCenterStore((state) => state.update);

  return (
    <Collapsible
      className="rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10"
      onOpenChange={() => update((model) => model.toggleCollapsed(blockKey))}
      open={!collapsed}
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left font-medium text-sm">
        <ChevronRight
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            !collapsed && "rotate-90"
          )}
        />
        {title}
        <span className="font-normal text-muted-foreground">({count})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EmptyEntries() {
  return <p className="text-muted-foreground text-sm">No entries</p>;
}
