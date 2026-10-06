"use client";

import { RemoteImage } from "@workspace/core/components/common/remote-image";
import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import {
  type SpritePreviewState,
  spriteNavLabel,
  spriteNavVisible,
} from "@workspace/vnccs/sprite-preview";
import { ChevronLeft, ChevronRight, Loader2, UserRound } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A character preview on a checkerboard with the sprite navigator's
 * previous/next controls, which only show for more than one sprite.
 */
export function SpritePreviewFrame({
  children,
  className,
  emptyLabel = "No Preview",
  onStep,
  state,
  url,
}: {
  /** Overlays inside the frame (upload buttons, busy states). */
  children?: ReactNode;
  className?: string;
  emptyLabel?: string;
  onStep: (delta: number) => void;
  state: SpritePreviewState;
  /** Shown instead of the navigator's image (an uploaded reference, a fresh render). */
  url?: string | null;
}) {
  const shown = url === undefined ? state.url : url;
  const nav = url ? false : spriteNavVisible(state);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-lg border bg-[length:24px_24px] bg-[repeating-conic-gradient(#80808018_0%_25%,transparent_0%_50%)]">
        {shown ? (
          <RemoteImage className="size-full object-contain" src={shown} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
            <UserRound className="size-10" />
            {emptyLabel}
          </div>
        )}
        {state.loading && !url ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {children}
      </div>
      {nav ? (
        <div className="flex items-center justify-center gap-3">
          <Button
            aria-label="Previous sprite"
            disabled={state.loading}
            onClick={() => onStep(-1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {spriteNavLabel(state)}
          </span>
          <Button
            aria-label="Next sprite"
            disabled={state.loading}
            onClick={() => onStep(1)}
            size="icon-sm"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
