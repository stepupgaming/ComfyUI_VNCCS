"use client";

import { Page } from "@workspace/core/components/common/page";
import { findNavItem } from "@workspace/core/config/navigation";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Hammer } from "lucide-react";

/** Stand-in for a tool that has not been ported from the ComfyUI widgets yet. */
export function PendingPage({ href }: { href: string }) {
  const item = findNavItem(href);
  return (
    <Page>
      <Empty className="min-h-[60vh]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Hammer />
          </EmptyMedia>
          <EmptyTitle>{item?.title ?? "Coming soon"}</EmptyTitle>
          <EmptyDescription>
            This tool still lives in the ComfyUI node widget. It moves here in a
            later step.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Page>
  );
}
