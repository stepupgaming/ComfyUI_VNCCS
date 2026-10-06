"use client";

import { ModeToggle } from "@workspace/core/components/common/mode-toggle";
import { findNavItem } from "@workspace/core/config/navigation";
import { Separator } from "@workspace/ui/components/separator";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";

export function AppHeader({ pathname }: { pathname: string }) {
  const item = findNavItem(pathname);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        className="mx-1 data-vertical:h-4 data-vertical:self-center"
        orientation="vertical"
      />
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate font-semibold text-sm">
          {item?.title ?? "VNCCS Studio"}
        </h1>
        {item ? (
          <p className="hidden truncate text-muted-foreground text-xs md:block">
            {item.description}
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ModeToggle />
      </div>
    </header>
  );
}
