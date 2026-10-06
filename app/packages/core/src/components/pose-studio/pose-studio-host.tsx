"use client";

import { useConnectionStore } from "@workspace/core/stores/connection-store";
import { useJobStore } from "@workspace/core/stores/job-store";
import { usePoseStudioStore } from "@workspace/core/stores/pose-studio-store";
import { useSettingsStore } from "@workspace/core/stores/settings-store";
import {
  characterMessage,
  hostOrigin,
  initMessage,
  parseHostMessage,
  poseHostUrl,
} from "@workspace/vnccs/pose-host";
import { type CSSProperties, useEffect, useRef, useState } from "react";

const HIDDEN_SIZE = { width: 1280, height: 800 };
const SCROLLING = /auto|scroll|hidden/;

interface Placement {
  clip: string;
  height: number;
  left: number;
  top: number;
  width: number;
}

function clippingAncestor(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (SCROLLING.test(style.overflowY) || SCROLLING.test(style.overflowX)) {
      return node;
    }
  }
  return null;
}

/**
 * Follow the slot every frame. The frame cannot live inside the slot: moving
 * an iframe in the DOM reloads it, and the host must survive page changes.
 */
function useSlotPlacement(slot: HTMLElement | null): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);

  useEffect(() => {
    if (!slot) {
      setPlacement(null);
      return;
    }
    const clipper = clippingAncestor(slot);
    let frame = 0;
    let last = "";
    const tick = () => {
      const rect = slot.getBoundingClientRect();
      const bounds = clipper?.getBoundingClientRect();
      const clip = bounds
        ? `inset(${Math.max(0, bounds.top - rect.top)}px ${Math.max(0, rect.right - bounds.right)}px ${Math.max(0, rect.bottom - bounds.bottom)}px ${Math.max(0, bounds.left - rect.left)}px)`
        : "none";
      const key = `${rect.left},${rect.top},${rect.width},${rect.height},${clip}`;
      if (key !== last) {
        last = key;
        setPlacement({
          clip,
          height: rect.height,
          left: rect.left,
          top: rect.top,
          width: rect.width,
        });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [slot]);

  return placement;
}

function frameStyle(
  placement: Placement | null,
  hiddenSize: { height: number; width: number }
): CSSProperties {
  if (placement) {
    return {
      clipPath: placement.clip,
      height: placement.height,
      left: placement.left,
      top: placement.top,
      width: placement.width,
      zIndex: 20,
    };
  }
  // Kept laid out inside the viewport: browsers throttle hidden or
  // off-screen frames, and a run needs the widget to render its captures.
  return {
    height: hiddenSize.height,
    left: 0,
    opacity: 0,
    pointerEvents: "none",
    top: 0,
    width: hiddenSize.width,
    zIndex: -1,
  };
}

function PoseStudioFrame({
  comfyUrl,
  nodeId,
  slot,
}: {
  comfyUrl: string;
  nodeId: string;
  slot: HTMLElement | null;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = hostOrigin(comfyUrl);
  const loaded = usePoseStudioStore((state) => state.host?.loaded === true);
  const age = usePoseStudioStore((state) => state.character?.age);
  const sex = usePoseStudioStore((state) => state.character?.sex);
  const placement = useSlotPlacement(slot);
  const [hiddenSize, setHiddenSize] = useState(HIDDEN_SIZE);

  useEffect(() => {
    if (placement) {
      setHiddenSize({ height: placement.height, width: placement.width });
    }
  }, [placement]);

  useEffect(() => {
    usePoseStudioStore.getState().resetHost(nodeId);
    const onMessage = (event: MessageEvent) => {
      const target = frame.current?.contentWindow;
      if (!target || event.source !== target || event.origin !== origin) {
        return;
      }
      const message = parseHostMessage(event.data);
      if (message?.nodeId !== nodeId) {
        return;
      }
      const store = usePoseStudioStore.getState();
      if (message.type === "hello") {
        target.postMessage(
          initMessage(store.poseData[nodeId] ?? null, store.character),
          origin
        );
        store.updateHost({ loaded: true });
      } else if (message.type === "state") {
        store.setPoseData(nodeId, message.poseData);
      } else if (message.type === "status") {
        store.updateHost({ ready: message.ready });
      } else {
        store.updateHost({ error: message.message, ready: false });
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      usePoseStudioStore.getState().resetHost(null);
    };
  }, [nodeId, origin]);

  useEffect(() => {
    if (loaded && origin && age !== undefined && sex !== undefined) {
      frame.current?.contentWindow?.postMessage(
        characterMessage({ age, sex }),
        origin
      );
    }
  }, [loaded, origin, age, sex]);

  if (!origin) {
    return null;
  }
  return (
    <iframe
      className="fixed border-0 bg-[#0a0a0f]"
      inert={!placement}
      ref={frame}
      src={poseHostUrl(comfyUrl, nodeId)}
      style={frameStyle(placement, hiddenSize)}
      title="Pose Studio"
    />
  );
}

/**
 * App-wide home of the Pose Studio widget. It mounts once a page asks for a
 * Pose Studio node and stays mounted across navigation and connection blips,
 * since the node renders its captures here while a run executes. It only
 * switches to another node while ComfyUI's queue is idle.
 */
export function PoseStudioHost() {
  const online = useConnectionStore((state) => state.status === "online");
  const queueBusy = useConnectionStore(
    (state) => state.queue.running + state.queue.pending > 0
  );
  const jobActive = useJobStore(
    (state) =>
      state.current?.status === "queued" || state.current?.status === "running"
  );
  const comfyUrl = useSettingsStore((state) => state.comfyUrl);
  const requested = usePoseStudioStore((state) => state.requested);
  const slot = usePoseStudioStore((state) => state.slot);
  const reloadKey = usePoseStudioStore((state) => state.reloadKey);
  const loaded = usePoseStudioStore((state) => state.host?.loaded === true);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const busy = queueBusy || jobActive;

  useEffect(() => {
    if (online && requested && (nodeId === null || !busy)) {
      setNodeId(requested);
    }
  }, [online, requested, nodeId, busy]);

  // A page that loaded while ComfyUI was down never answers; retry once it is back.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only reconnects retry
  useEffect(() => {
    if (online && nodeId && !loaded) {
      usePoseStudioStore.getState().reload();
    }
  }, [online]);

  if (!nodeId) {
    return null;
  }
  return (
    <PoseStudioFrame
      comfyUrl={comfyUrl}
      key={`${comfyUrl}|${nodeId}|${reloadKey}`}
      nodeId={nodeId}
      slot={requested === nodeId ? slot : null}
    />
  );
}
