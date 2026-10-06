"use client";

import { RemoteImage } from "@workspace/core/components/common/remote-image";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import type { StageDef } from "@workspace/vnccs/character-generator";
import { ArrowLeft, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MIN_SCALE = 0.1;
const MAX_SCALE = 32;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const FIT: Transform = { scale: 1, x: 0, y: 0 };

/** Zoom by `factor`, keeping `point` (relative to the canvas centre) in place. */
function zoomed(
  current: Transform,
  factor: number,
  point = { x: 0, y: 0 }
): Transform {
  const scale = Math.max(
    MIN_SCALE,
    Math.min(MAX_SCALE, current.scale * factor)
  );
  const ratio = scale / current.scale;
  return {
    scale,
    x: point.x - (point.x - current.x) * ratio,
    y: point.y - (point.y - current.y) * ratio,
  };
}

/**
 * Full-window image viewer with stage tabs, wheel zoom around the pointer and
 * drag to pan. Scale 1 is the image fitted to the window.
 */
export function ImageViewer({
  index,
  onClose,
  onSelectStage,
  selectedStage,
  sources,
  stages,
}: {
  index: number;
  onClose: () => void;
  onSelectStage: (stage: string) => void;
  selectedStage: string;
  /** Media URLs of the selected stage. */
  sources: string[];
  stages: StageDef[];
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [transform, setTransform] = useState<Transform>(FIT);
  const source = sources[Math.max(0, Math.min(index, sources.length - 1))];
  const [fittedSource, setFittedSource] = useState(source);
  if (fittedSource !== source) {
    setFittedSource(source);
    setTransform(FIT);
  }

  const zoom = (factor: number) =>
    setTransform((current) => zoomed(current, factor));

  // React's wheel listener is passive, so it cannot keep the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!event.deltaY) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const point = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
      const factor = event.deltaY < 0 ? 1.12 : 0.88;
      setTransform((current) => zoomed(current, factor, point));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={true}
    >
      <DialogContent
        className="flex h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Image viewer</DialogTitle>
        <div className="flex items-center gap-2 border-b p-2">
          <Button onClick={onClose} size="sm" variant="outline">
            <ArrowLeft />
            Back
          </Button>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {stages.map((stage) => (
              <Button
                aria-pressed={stage.key === selectedStage}
                className="shrink-0"
                key={stage.key}
                onClick={() => onSelectStage(stage.key)}
                size="sm"
                variant={stage.key === selectedStage ? "secondary" : "ghost"}
              >
                {stage.label}
              </Button>
            ))}
          </div>
          <Button
            aria-label="Zoom out"
            onClick={() => zoom(0.8)}
            size="icon-sm"
            variant="outline"
          >
            <ZoomOut />
          </Button>
          <Button
            aria-label="Zoom in"
            onClick={() => zoom(1.25)}
            size="icon-sm"
            variant="outline"
          >
            <ZoomIn />
          </Button>
        </div>
        <div
          className="relative flex min-h-0 flex-1 cursor-grab touch-none items-center justify-center overflow-hidden bg-[length:24px_24px] bg-[repeating-conic-gradient(#80808018_0%_25%,transparent_0%_50%)] active:cursor-grabbing"
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              id: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            };
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.id !== event.pointerId) {
              return;
            }
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            drag.current = { ...start, x: event.clientX, y: event.clientY };
            setTransform((current) => ({
              ...current,
              x: current.x + dx,
              y: current.y + dy,
            }));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          ref={canvasRef}
        >
          {source ? (
            <RemoteImage
              className="pointer-events-none max-h-full max-w-full select-none object-contain"
              draggable={false}
              src={source}
              style={{
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No image</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
