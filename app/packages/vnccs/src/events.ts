/**
 * ComfyUI's `/ws` event stream for the VNCCS custom events the legacy widgets
 * listened to through `api.addEventListener` (`vnccs.preview.updated`,
 * `vnccs.character_generator.stage`, …). Those events are broadcast to every
 * client, so a second socket next to comfy-ts receives them too.
 */

export type ComfyEventHandler = (data: unknown) => void;

/** Fired (with no data) every time the socket (re)connects. */
export const SOCKET_OPEN = "studio.socket.open";

export interface SocketLike {
  close(): void;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface Timers {
  clear: (handle: ReturnType<typeof setTimeout>) => void;
  set: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 10_000;

const defaultTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle),
};

export function eventsUrl(baseUrl: string, clientId: string): string {
  const url = new URL("/ws", baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("clientId", clientId);
  return url.toString();
}

function parseFrame(data: unknown): { data: unknown; type: string } | null {
  if (typeof data !== "string") {
    return null;
  }
  try {
    const message = JSON.parse(data) as { data?: unknown; type?: unknown };
    return typeof message?.type === "string"
      ? { type: message.type, data: message.data }
      : null;
  } catch {
    return null;
  }
}

/**
 * One reconnecting socket shared by every subscriber. It opens with the first
 * subscription and closes when the last one leaves.
 */
export class ComfyEvents {
  private readonly handlers = new Map<string, Set<ComfyEventHandler>>();
  private readonly open: SocketFactory;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private socket: SocketLike | null = null;
  private readonly timers: Timers;
  readonly url: string;

  constructor(
    url: string,
    open: SocketFactory,
    timers: Timers = defaultTimers
  ) {
    this.url = url;
    this.open = open;
    this.timers = timers;
  }

  on(type: string, handler: ComfyEventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    this.start();
    return () => {
      set.delete(handler);
      if (set.size === 0) {
        this.handlers.delete(type);
      }
      if (this.handlers.size === 0) {
        this.stop();
      }
    };
  }

  get active(): boolean {
    return this.socket !== null || this.retryTimer !== null;
  }

  stop(): void {
    if (this.retryTimer !== null) {
      this.timers.clear(this.retryTimer);
      this.retryTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onclose = null;
      socket.onmessage = null;
      socket.close();
    }
  }

  private start(): void {
    if (this.active) {
      return;
    }
    let socket: SocketLike;
    try {
      socket = this.open(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.retryMs = MIN_RETRY_MS;
      this.dispatch(SOCKET_OPEN, undefined);
    };
    socket.onmessage = (event) => {
      const frame = parseFrame(event.data);
      if (frame) {
        this.dispatch(frame.type, frame.data);
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
        this.scheduleRetry();
      }
    };
  }

  private scheduleRetry(): void {
    if (this.handlers.size === 0) {
      return;
    }
    const delay = this.retryMs;
    this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs * 2);
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null;
      this.start();
    }, delay);
  }

  private dispatch(type: string, data: unknown): void {
    for (const handler of [...(this.handlers.get(type) ?? [])]) {
      try {
        handler(data);
      } catch {
        // One subscriber must not break the others.
      }
    }
  }
}
