import { describe, expect, it } from "vitest";
import { VnccsHttp } from "../src/http";
import {
  type IdleLimits,
  type MemoryScope,
  ModelMemory,
  RELEASE_MEMORY_ROUTE,
  releaseModelMemory,
  WIZARD_FAMILY,
} from "../src/model-memory";

interface Timer {
  callback: () => void;
  cancelled: boolean;
  ms: number;
}

function harness(
  limits: IdleLimits = { allMinutes: 30, gpuMinutes: 5 },
  answer: (scope: MemoryScope) => Promise<boolean> = () => Promise.resolve(true)
) {
  const releases: MemoryScope[] = [];
  const timers: Timer[] = [];
  const memory = new ModelMemory({
    idleLimits: () => limits,
    release: (scope) => {
      releases.push(scope);
      return answer(scope);
    },
    schedule: (callback, ms) => {
      const timer = { callback, cancelled: false, ms };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  const pending = () => timers.filter((timer) => !timer.cancelled);
  /** Fire the live timer of that length, as if the studio stayed idle that long. */
  const elapse = async (minutes: number) => {
    const timer = pending().find((item) => item.ms === minutes * 60_000);
    expect(timer, `no ${minutes} minute timer`).toBeDefined();
    timer?.callback();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { elapse, memory, pending, releases };
}

const work = () => Promise.resolve("done");

describe("releaseModelMemory", () => {
  function server(status: number, body: unknown) {
    const calls: { body: unknown; input: string }[] = [];
    const http = new VnccsHttp("http://127.0.0.1:8188", (input, init) => {
      calls.push({ body: JSON.parse(String(init?.body)), input });
      return Promise.resolve(Response.json(body, { status }));
    });
    return { calls, http };
  }

  it("posts the scope to the release route", async () => {
    const { calls, http } = server(200, { released: "gpu" });
    await expect(releaseModelMemory(http, "gpu")).resolves.toBe(true);
    expect(calls).toEqual([
      {
        body: { scope: "gpu" },
        input: `http://127.0.0.1:8188/api${RELEASE_MEMORY_ROUTE}`,
      },
    ]);
  });

  it("answers false while a generation runs", async () => {
    const { http } = server(409, { busy: true, error: "running" });
    await expect(releaseModelMemory(http, "all")).resolves.toBe(false);
  });

  it("raises other failures", async () => {
    const { http } = server(403, { error: "cross-site" });
    await expect(releaseModelMemory(http, "all")).rejects.toThrow("cross-site");
  });
});

describe("ModelMemory", () => {
  it("keeps the models while the same family works again", async () => {
    const { memory, releases } = harness();
    await memory.run("qi2", work);
    await memory.run("qi2", work);
    expect(releases).toEqual([]);
  });

  it("frees everything before another family loads its models", async () => {
    const { memory, releases } = harness();
    const order: string[] = [];
    await memory.run("minimaxh3", work);
    await memory.run("klein9b", () => {
      order.push(`task after ${releases.join(",")}`);
      return work();
    });
    expect(releases).toEqual(["all"]);
    expect(order).toEqual(["task after all"]);
  });

  it("never releases for work of an unknown family", async () => {
    const { memory, releases } = harness();
    await memory.run("qi2", work);
    await memory.run("", work);
    await memory.run("qi2", work);
    expect(releases).toEqual([]);
  });

  it("only frees VRAM for a wizard and keeps the family's RAM copies", async () => {
    const { memory, releases } = harness();
    await memory.run("anima", work);
    await memory.run(WIZARD_FAMILY, work);
    await memory.run(WIZARD_FAMILY, work);
    await memory.run("anima", work);
    expect(releases).toEqual(["gpu"]);
  });

  it("does not release while other studio work runs", async () => {
    const { memory, releases } = harness();
    await memory.run("qi2", work);
    let finish: () => void = () => undefined;
    const running = memory.run(
      "qi2",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    await Promise.resolve();
    await memory.run("anima", work);
    await memory.run(WIZARD_FAMILY, work);
    finish();
    await running;
    expect(releases).toEqual([]);
  });

  it("frees VRAM, then everything, after the idle limits", async () => {
    const { elapse, memory, releases } = harness();
    await memory.run("qi2", work);
    await elapse(5);
    expect(releases).toEqual(["gpu"]);
    await elapse(30);
    expect(releases).toEqual(["gpu", "all"]);
  });

  it("restarts the idle timers when work begins", async () => {
    const { memory, pending } = harness();
    await memory.run("qi2", work);
    const first = pending();
    await memory.run("qi2", work);
    expect(first.every((timer) => !pending().includes(timer))).toBe(true);
    expect(pending().map((timer) => timer.ms)).toEqual([300_000, 1_800_000]);
  });

  it("arms no idle timer while work runs or for a disabled limit", async () => {
    const { memory, pending } = harness({ allMinutes: 0, gpuMinutes: 10 });
    let seen: number[] = [];
    await memory.run("qi2", () => {
      seen = pending().map((timer) => timer.ms);
      return work();
    });
    expect(seen).toEqual([]);
    expect(pending().map((timer) => timer.ms)).toEqual([600_000]);
  });

  it("idles out models loaded outside tracked work, and skips what is already free", async () => {
    const { elapse, memory, releases } = harness();
    memory.touch();
    await elapse(5);
    expect(releases).toEqual(["gpu"]);
    await elapse(30);
    expect(releases).toEqual(["gpu"]);
  });

  it("releases everything on demand and stops the idle timers", async () => {
    const { memory, pending, releases } = harness();
    await memory.run("qi2", work);
    await expect(memory.releaseAll()).resolves.toBe(true);
    expect(releases).toEqual(["all"]);
    expect(pending()).toEqual([]);
    await memory.run("anima", work);
    expect(releases).toEqual(["all"]);
  });

  it("moves on when the server refuses a family release", async () => {
    let busy = true;
    const { memory, releases } = harness(undefined, () =>
      Promise.resolve(!busy)
    );
    await memory.run("qi2", work);
    await memory.run("anima", work);
    busy = false;
    await memory.run("anima", work);
    expect(releases).toEqual(["all"]);
    await expect(memory.releaseAll()).resolves.toBe(true);
  });

  it("treats a failed release as not released and still runs the work", async () => {
    const { memory } = harness(undefined, () =>
      Promise.reject(new Error("offline"))
    );
    await memory.run("qi2", work);
    await expect(memory.run("anima", work)).resolves.toBe("done");
    await expect(memory.releaseAll()).resolves.toBe(false);
  });
});
