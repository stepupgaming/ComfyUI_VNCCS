"use client";

import { useSettingsStore } from "@workspace/core/stores/settings-store";
import {
  type ComfyEventHandler,
  ComfyEvents,
  eventsUrl,
  type SocketLike,
} from "@workspace/vnccs/events";
import { useEffect, useRef } from "react";

const clientId = `vnccs-studio-${Math.random().toString(36).slice(2, 12)}`;
let events: ComfyEvents | null = null;
let eventsBase = "";

/** The shared event socket for one ComfyUI address. */
export function comfyEvents(comfyUrl: string): ComfyEvents {
  if (!events || eventsBase !== comfyUrl) {
    events?.stop();
    events = new ComfyEvents(
      eventsUrl(comfyUrl, clientId),
      (url) => new WebSocket(url) as unknown as SocketLike
    );
    eventsBase = comfyUrl;
  }
  return events;
}

/** Subscribe to one ComfyUI event type while mounted (and while `enabled`). */
export function useComfyEvent(
  type: string,
  handler: ComfyEventHandler,
  enabled = true
): void {
  const comfyUrl = useSettingsStore((state) => state.comfyUrl);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    return comfyEvents(comfyUrl).on(type, (data) => latest.current(data));
  }, [comfyUrl, enabled, type]);
}
