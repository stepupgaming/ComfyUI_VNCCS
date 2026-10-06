"use client";

import { usePoseStudio } from "@workspace/core/hooks/use-pose-studio";
import { usePoseStudioStore } from "@workspace/core/stores/pose-studio-store";
import { cn } from "@workspace/ui/lib/utils";
import { useEffect, useState } from "react";

/**
 * Space the app-wide Pose Studio host covers while this is on screen. The
 * text underneath only shows while the host serves another node or is down.
 */
export function PoseStudioSlot({
  className,
  nodeId,
}: {
  className?: string;
  nodeId: string;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const host = usePoseStudio(nodeId);

  useEffect(() => {
    if (!element) {
      return;
    }
    usePoseStudioStore.getState().setSlot(element);
    return () => {
      const store = usePoseStudioStore.getState();
      if (store.slot === element) {
        store.setSlot(null);
      }
    };
  }, [element]);

  return (
    <div className={cn("relative bg-[#0a0a0f]", className)} ref={setElement}>
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-muted-foreground text-sm">
        {host
          ? "Loading Pose Studio…"
          : "Pose Studio opens here once ComfyUI is online and its queue is idle."}
      </div>
    </div>
  );
}
