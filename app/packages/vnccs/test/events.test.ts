import { describe, expect, it } from "vitest";
import {
  ComfyEvents,
  eventsUrl,
  SOCKET_OPEN,
  type SocketLike,
  type Timers,
} from "../src/events";

class FakeSocket implements SocketLike {
  closed = false;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;

  close() {
    this.closed = true;
  }

  emit(type: string, data?: unknown) {
    this.onmessage?.({ data: JSON.stringify({ type, data }) });
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const pending: { callback: () => void; ms: number }[] = [];
  const timers: Timers = {
    set: (callback, ms) => {
      pending.push({ callback, ms });
      return pending.length as unknown as ReturnType<typeof setTimeout>;
    },
    clear: () => {
      pending.length = 0;
    },
  };
  const events = new ComfyEvents(
    "ws://host/ws",
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    timers
  );
  return { events, pending, sockets };
}

describe("ComfyUI events", () => {
  it("builds the socket URL", () => {
    expect(eventsUrl("http://127.0.0.1:8188", "abc")).toBe(
      "ws://127.0.0.1:8188/ws?clientId=abc"
    );
    expect(eventsUrl("https://comfy.example/", "abc")).toBe(
      "wss://comfy.example/ws?clientId=abc"
    );
  });

  it("delivers JSON events by type and ignores other frames", () => {
    const { events, sockets } = harness();
    const seen: unknown[] = [];
    events.on("vnccs.preview.updated", (data) => seen.push(data));
    const socket = sockets[0] as FakeSocket;
    socket.emit("vnccs.preview.updated", { node_id: "818" });
    socket.emit("status", { sid: "x" });
    socket.onmessage?.({ data: new ArrayBuffer(4) });
    socket.onmessage?.({ data: "not json" });
    expect(seen).toEqual([{ node_id: "818" }]);
  });

  it("opens one socket and closes it with the last subscriber", () => {
    const { events, sockets } = harness();
    const off1 = events.on("a", () => undefined);
    const off2 = events.on("b", () => undefined);
    expect(sockets).toHaveLength(1);
    off1();
    expect(sockets[0]?.closed).toBe(false);
    off2();
    expect(sockets[0]?.closed).toBe(true);
    expect(events.active).toBe(false);
  });

  it("reconnects with backoff and announces each open", () => {
    const { events, pending, sockets } = harness();
    let opens = 0;
    events.on(SOCKET_OPEN, () => {
      opens += 1;
    });
    sockets[0]?.onopen?.();
    sockets[0]?.onclose?.();
    expect(pending.map((timer) => timer.ms)).toEqual([1000]);
    pending.shift()?.callback();
    expect(sockets).toHaveLength(2);
    sockets[1]?.onclose?.();
    expect(pending.map((timer) => timer.ms)).toEqual([2000]);
    pending.shift()?.callback();
    sockets[2]?.onopen?.();
    sockets[2]?.onclose?.();
    expect(pending.map((timer) => timer.ms)).toEqual([1000]);
    expect(opens).toBe(2);
  });

  it("keeps delivering when one handler throws", () => {
    const { events, sockets } = harness();
    const seen: string[] = [];
    events.on("x", () => {
      throw new Error("boom");
    });
    events.on("x", () => seen.push("second"));
    (sockets[0] as FakeSocket).emit("x");
    expect(seen).toEqual(["second"]);
  });
});
