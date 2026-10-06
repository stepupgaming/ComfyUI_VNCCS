import { describe, expect, it } from "vitest";
import { VnccsHttp } from "../src/http";
import {
  SpritePreviewNavigator,
  type SpritePreviewOptions,
  type SpritePreviewState,
  spriteNavLabel,
  spriteNavVisible,
} from "../src/sprite-preview";

const BASE = "http://127.0.0.1:8188";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function navigator(
  answer: (url: string) => Response | Promise<Response>,
  overrides: Partial<SpritePreviewOptions> = {}
) {
  const requests: string[] = [];
  const probes: string[] = [];
  const events: string[] = [];
  const http = new VnccsHttp(BASE, (url) => {
    requests.push(url);
    return Promise.resolve(answer(url));
  });
  const nav = new SpritePreviewNavigator({
    http: () => http,
    now: () => 100,
    random: () => 0.5,
    probe: (url) => {
      probes.push(url);
      return Promise.resolve(!url.includes("broken"));
    },
    onLoaded: (url) => events.push(`loaded ${url}`),
    onMissing: () => events.push("missing"),
    onError: () => events.push("error"),
    ...overrides,
  });
  return { events, nav, probes, requests };
}

describe("sprite preview navigator", () => {
  it("starts on a random sprite and wraps when stepping", async () => {
    const { nav, requests } = navigator(() => Response.json({ count: 4 }));
    await nav.load("Ann", { costume: "Casual" });
    expect(requests[0]).toBe(
      `${BASE}/api/vnccs/get_character_pose_preview_meta?character=Ann&t=100&costume=Casual`
    );
    expect(nav.state.index).toBe(2);
    expect(nav.state.url).toBe(
      `${BASE}/api/vnccs/get_character_pose_preview?character=Ann&index=2&v=Ann%3ACasual%3A100&costume=Casual`
    );
    expect(spriteNavVisible(nav.state)).toBe(true);
    expect(spriteNavLabel(nav.state)).toBe("3/4");
    await nav.step(2);
    expect(nav.state.index).toBe(0);
    await nav.step(-1);
    expect(nav.state.index).toBe(3);
  });

  it("hides the navigation for a single sprite", async () => {
    const { nav } = navigator(() => Response.json({ count: 1 }));
    await nav.load("Ann", { random: false });
    expect(nav.state.index).toBe(0);
    expect(spriteNavVisible(nav.state)).toBe(false);
    expect(spriteNavLabel(nav.state)).toBe("");
  });

  it("falls back when there are no sprites, then to the placeholder", async () => {
    const { events, nav } = navigator(() => Response.json({ count: 0 }));
    await nav.load("Ann", {
      fallbackUrl: "/vnccs/get_cached_preview?character=Ann",
    });
    expect(nav.state.url).toBe(
      `${BASE}/api/vnccs/get_cached_preview?character=Ann`
    );
    expect(events).toEqual([
      `loaded ${BASE}/api/vnccs/get_cached_preview?character=Ann`,
    ]);
    await nav.load("Ann", { fallbackUrl: "/vnccs/broken" });
    expect(nav.state.url).toBeNull();
    expect(events.at(-1)).toBe("missing");
  });

  it("reads an HTTP error as no sprites without reporting it", async () => {
    const { events, nav } = navigator(() =>
      Response.json({ error: "x" }, { status: 404 })
    );
    await nav.load("Ann", { fallbackUrl: "/vnccs/fallback.png" });
    expect(nav.state.url).toBe(`${BASE}/api/vnccs/fallback.png`);
    expect(events).not.toContain("error");
  });

  it("reports a network failure and shows the fallback", async () => {
    const { events, nav } = navigator(() => {
      throw new TypeError("offline");
    });
    await nav.load("Ann", { fallbackUrl: "/vnccs/fallback.png" });
    expect(events).toContain("error");
    expect(nav.state.url).toBe(`${BASE}/api/vnccs/fallback.png`);
  });

  it("shows the fallback when a sprite fails to load", async () => {
    const { events, nav } = navigator(() => Response.json({ count: 2 }), {
      probe: (url) =>
        Promise.resolve(!url.includes("get_character_pose_preview?")),
    });
    await nav.load("Ann", { fallbackUrl: "/vnccs/fallback.png" });
    expect(events).toEqual(["error", `loaded ${BASE}/api/vnccs/fallback.png`]);
    expect(spriteNavVisible(nav.state)).toBe(false);
  });

  it("clears to the placeholder without a character", async () => {
    const { events, nav, requests } = navigator(() => Response.json({}));
    await nav.load("");
    expect(requests).toEqual([]);
    expect(nav.state.url).toBeNull();
    expect(events).toEqual(["missing"]);
  });

  it("drops a slow load once a newer one started", async () => {
    const slow = deferred<Response>();
    const { nav } = navigator((url) =>
      url.includes("Bob") ? Response.json({ count: 1 }) : slow.promise
    );
    const first = nav.load("Ann");
    await nav.load("Bob", { random: false });
    slow.resolve(Response.json({ count: 3 }));
    await first;
    expect(nav.state.character).toBe("Bob");
    expect(nav.state.url).toContain("character=Bob");
  });

  it("ignores results once the selection moved or the page left", async () => {
    let selected = "Ann";
    const { nav } = navigator(() => Response.json({ count: 2 }), {
      isSelectionCurrent: (selection) => selection.character === selected,
    });
    const load = nav.load("Ann");
    selected = "Bob";
    await load;
    expect(nav.state.url).toBeNull();

    selected = "Ann";
    const states: SpritePreviewState[] = [];
    const tracked = navigator(() => Response.json({ count: 2 }), {
      onChange: (state) => states.push(state),
    });
    const pending = tracked.nav.load("Ann");
    tracked.nav.dispose();
    await pending;
    expect(tracked.nav.state.url).toBeNull();
  });

  it("prefetches the neighbouring sprites", async () => {
    const prefetched: string[] = [];
    const { nav } = navigator(() => Response.json({ count: 3 }), {
      prefetch: (url) => prefetched.push(url),
      random: () => 0,
    });
    await nav.load("Ann");
    expect(
      prefetched.map((url) => new URL(url).searchParams.get("index"))
    ).toEqual(["2", "1"]);
  });
});
