import { describe, expect, it } from "vitest";
import {
  ClothesSession,
  clothesPreviewPayload,
  clothesPreviewUrl,
  deleteCostume,
  fetchClothesCharacterInfo,
  fetchCostume,
  listCostumes,
} from "../src/clothes";
import { deleteCostumePrompt, parseClothesState } from "../src/clothes-state";
import type { CatalogEntry } from "../src/control-center";
import { wizardFailure } from "../src/creator";
import { VnccsHttp } from "../src/http";
import { SpritePreviewNavigator } from "../src/sprite-preview";

const BASE = "http://127.0.0.1:8188";
const API_PREFIX = /^\/api/;
const REPO = "MIUProject/VNCCS_v3.0";
const QI2_CORE: CatalogEntry = {
  name: "VNCCS Clothes Core QI2",
  kind: "QI2",
  type: "Helper",
  local_path: "models/loras/QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors",
};

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

async function flush() {
  for (let round = 0; round < 8; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

interface Sent {
  body: Record<string, unknown> | null;
  form: FormData | null;
  method: string;
  path: string;
  query: URLSearchParams;
  url: string;
}

type Route = (request: Sent) => Response | Promise<Response>;

/** Queue every request to a route until the test answers it. */
function held(routes: Record<string, Route>, path: string) {
  const pending: Deferred<Response>[] = [];
  routes[path] = () => {
    const task = deferred<Response>();
    pending.push(task);
    return task.promise;
  };
  return pending;
}

function fakeServer(costumeList: string[], spriteCount: number) {
  let costumes = [...costumeList];
  const requests: Sent[] = [];
  const routes: Record<string, Route> = {
    "/vnccs/context_lists": () =>
      Response.json({ characters: ["Alice", "Bob"] }),
    "/vnccs/character_info": (request) =>
      Response.json({
        name: `${request.query.get("character")} (renamed)`,
        sex: "female",
        age: 20,
      }),
    "/vnccs/list_costumes": () => Response.json(costumes),
    "/vnccs/get_costume": (request) =>
      Response.json({ top: `${request.query.get("costume")} top` }),
    "/vnccs/save_costume": (request) => {
      const name = String(request.body?.costume);
      if (!costumes.includes(name)) {
        costumes = [...costumes, name];
      }
      return Response.json({ status: "ok" });
    },
    "/vnccs/delete_costume": (request) => {
      costumes = costumes.filter((name) => name !== request.body?.costume);
      return Response.json({ status: "ok" });
    },
    "/vnccs/get_character_pose_preview_meta": () =>
      Response.json({ count: spriteCount }),
    "/vnccs/control_center/clothes_preview": () =>
      Response.json({ image: "QUJD" }),
    "/vnccs/clothes_wizard": () =>
      Response.json({ top: "red coat", head: "santa hat" }),
    "/upload/image": () =>
      Response.json({ name: "donor.png", subfolder: "clothes", type: "input" }),
  };
  const http = new VnccsHttp(BASE, (url, init) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(API_PREFIX, "");
    const sent: Sent = {
      url,
      path,
      method: init?.method ?? "GET",
      query: parsed.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      form: init?.body instanceof FormData ? init.body : null,
    };
    requests.push(sent);
    const route = routes[path];
    if (!route) {
      throw new Error(`Unexpected request: ${path}`);
    }
    return Promise.resolve(route(sent));
  });
  return { http, requests, routes };
}

interface HarnessOptions {
  costumes?: string[];
  kind?: string;
  saved?: object;
  spriteCount?: number;
}

function harness(options: HarnessOptions = {}) {
  const server = fakeServer(
    options.costumes ?? ["Naked", "Dress", "Casual"],
    options.spriteCount ?? 3
  );
  const notices: { level?: string; message: string; title: string }[] = [];
  const probes: string[] = [];
  const nodeState = {
    active_kind: options.kind ?? "QI2",
    selected_type: "UNET",
  };
  const session = new ClothesSession({
    http: () => server.http,
    controlCenter: () => ({
      context: { kind: nodeState.active_kind, loras: [QI2_CORE] },
      nodeState,
      repoId: REPO,
    }),
    createNavigator: (hooks) =>
      new SpritePreviewNavigator({
        ...hooks,
        http: () => server.http,
        now: () => 100,
        random: () => 0,
        probe: (url) => {
          probes.push(url);
          return Promise.resolve(!url.includes("broken"));
        },
      }),
    notify: (title, message, level) => notices.push({ title, message, level }),
    now: () => 100,
    random: () => 0.5,
  });
  const saved = options.saved ?? { character: "Alice", costume: "Dress" };
  const sent = (path: string) =>
    server.requests.filter((request) => request.path === path);
  return {
    ...server,
    notices,
    probes,
    session,
    sent,
    start: () => session.init(JSON.stringify(saved)),
    state: () => {
      const state = session.state;
      if (!state) {
        throw new Error("Session has no state");
      }
      return state;
    },
  };
}

function writes(requests: Sent[]) {
  return requests.filter((request) => request.method !== "GET");
}

describe("clothes routes", () => {
  it("requires a costume array and a metadata object", async () => {
    const lists = fakeServer([], 0);
    lists.routes["/vnccs/list_costumes"] = () => Response.json({});
    await expect(listCostumes(lists.http, "Alice")).rejects.toThrow(
      "Failed to load character costumes."
    );
    lists.routes["/vnccs/get_costume"] = () => Response.json([]);
    await expect(fetchCostume(lists.http, "Alice", "Dress")).rejects.toThrow(
      "Invalid costume metadata."
    );
  });

  it("reads character metadata without checking its name", async () => {
    const { http } = fakeServer([], 0);
    await expect(fetchClothesCharacterInfo(http, "Alice")).resolves.toEqual({
      name: "Alice (renamed)",
      sex: "female",
      age: 20,
    });
  });

  it("builds the costume preview URL with the cache switch", () => {
    const { http } = fakeServer([], 0);
    expect(clothesPreviewUrl(http, "Ann Lee", "Dress", 5)).toBe(
      `${BASE}/api/vnccs/get_preview?character=Ann+Lee&costume=Dress&ts=5`
    );
    expect(clothesPreviewUrl(http, "Ann", "Dress", 5, true)).toBe(
      `${BASE}/api/vnccs/get_preview?character=Ann&costume=Dress&ts=5&force_cache=true`
    );
  });

  it("returns the deletion warning, if any", async () => {
    const server = fakeServer(["Dress"], 0);
    await expect(deleteCostume(server.http, "Alice", "Dress")).resolves.toEqual(
      { warning: "" }
    );
    server.routes["/vnccs/delete_costume"] = () =>
      Response.json({ status: "ok", warning: "Cleanup pending" });
    await expect(deleteCostume(server.http, "Alice", "Dress")).resolves.toEqual(
      { warning: "Cleanup pending" }
    );
  });

  it("sends the Control Center configuration with the preview", () => {
    const state = parseClothesState({ character: "Alice", costume: "Dress" });
    const nodeState = { active_kind: "QI2", selected_type: "UNET" };
    expect(clothesPreviewPayload(state, nodeState, REPO)).toEqual({
      repo_id: REPO,
      node_state: JSON.stringify(nodeState),
      selected_type: "unet",
      control_center_id: "758",
      clothes_state: state,
    });
  });

  it("words the delete confirmation like the widget", () => {
    expect(deleteCostumePrompt("Alice", "Dress")).toBe(
      'Delete "Dress" for Alice? This removes its settings, generated images, and preview.'
    );
  });
});

describe("clothes session loading", () => {
  it("loads the saved costume, its fields and a sprite to dress without writing", async () => {
    const h = harness({ saved: { character: "Alice", costume: "Casual" } });
    await h.start();
    const state = h.state();
    expect(h.session.ui.characters).toEqual(["Alice", "Bob"]);
    expect(h.session.ui.costumes).toEqual(["Dress", "Casual"]);
    expect(state.costume).toBe("Casual");
    expect(state.costume_info.top).toBe("Casual top");
    expect(state.character_info.age).toBe(20);
    expect(state.selected_preview_sprite).toEqual({
      character: "Alice",
      costume: "Casual",
      index: 0,
      count: 3,
    });
    expect(h.sent("/vnccs/get_character_pose_preview_meta")[0]?.url).toContain(
      "costume=Casual"
    );
    expect(h.session.snapshot().sprite.url).toContain(
      "get_character_pose_preview?character=Alice&index=0"
    );
    expect(h.session.ui.loadingCostume).toBe(false);
    expect(state.gen_settings.lora_name).toBe(
      "QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors"
    );
    expect(writes(h.requests)).toEqual([]);
  });

  it("replaces Naked or a missing costume with the first one", async () => {
    const h = harness({ saved: { character: "Alice", costume: "Naked" } });
    await h.start();
    expect(h.state().costume).toBe("Dress");
  });

  it("selects nothing and previews the base body without costumes", async () => {
    const h = harness({ costumes: ["Naked", "Original"] });
    await h.start();
    expect(h.state().costume).toBe("");
    expect(h.session.ui.costumes).toEqual([]);
    expect(h.sent("/vnccs/get_costume")).toEqual([]);
    expect(h.sent("/vnccs/get_character_pose_preview_meta")[0]?.url).toContain(
      "costume=Naked"
    );
    expect(h.state().selected_preview_sprite?.costume).toBe("Naked");
  });

  it("falls back to the first character when the saved one is gone", async () => {
    const h = harness({ saved: { character: "Zed", costume: "Dress" } });
    await h.start();
    expect(h.state().character).toBe("Alice");
  });

  it("reports a failed start for a retry", async () => {
    const h = harness();
    h.routes["/vnccs/context_lists"] = () =>
      new Response("Server offline", {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    await h.start();
    expect(h.session.state).toBeNull();
    expect(h.session.ui.loadError).toBe("Server offline");
  });

  it("ignores reversed costume metadata responses", async () => {
    const h = harness();
    await h.start();
    const pending = held(h.routes, "/vnccs/get_costume");
    const older = h.session.selectCostume("Dress");
    const newer = h.session.selectCostume("Casual");
    await flush();
    expect(h.session.ui.loadingCostume).toBe(true);
    pending[1]?.resolve(Response.json({ top: "new" }));
    await newer;
    pending[0]?.resolve(Response.json({ top: "old" }));
    await older;
    expect(h.state().costume).toBe("Casual");
    expect(h.state().costume_info.top).toBe("new");
    expect(h.session.ui.loadingCostume).toBe(false);
  });

  it("ignores character metadata for an earlier selection or after removal", async () => {
    const h = harness();
    await h.start();
    const pending = held(h.routes, "/vnccs/character_info");
    const older = h.session.selectCharacter("Bob");
    const newer = h.session.selectCharacter("Alice");
    await flush();
    pending[1]?.resolve(Response.json({ age: 30 }));
    await newer;
    pending[0]?.resolve(Response.json({ age: 60 }));
    await older;
    expect(h.state().character).toBe("Alice");
    expect(h.state().character_info.age).toBe(30);
    const last = h.session.selectCharacter("Bob");
    await flush();
    h.session.dispose();
    pending[2]?.resolve(Response.json({ age: 70 }));
    await last;
    expect(h.state().character_info.age).toBe(30);
  });

  it("drops replies after leaving and keeps the state for the next visit", async () => {
    const h = harness();
    await h.start();
    const pending = held(h.routes, "/vnccs/get_costume");
    const left = h.session.selectCostume("Casual");
    await flush();
    expect(h.session.ui.loadingCostume).toBe(true);
    h.session.leave();
    expect(h.session.ui.loadingCostume).toBe(false);
    pending[0]?.resolve(Response.json({ top: "late" }));
    await left;
    expect(h.state().costume_info.top).not.toBe("late");
    h.routes["/vnccs/get_costume"] = (request) =>
      Response.json({ top: `${request.query.get("costume")} top` });
    await h.session.init(null);
    expect(h.state().costume).toBe("Casual");
    expect(h.state().costume_info.top).toBe("Casual top");
  });

  it("reads Pose Studio's age and sex from the metadata", async () => {
    const h = harness();
    h.routes["/vnccs/character_info"] = () =>
      Response.json({ gender: "Male", age: "140" });
    await h.start();
    expect(h.state().character_info).toMatchObject({ age: 100, sex: "male" });
  });
});

describe("clothes session costumes", () => {
  it("saves typed fields on change and reports failed saves", async () => {
    const h = harness();
    await h.start();
    h.session.update((model) => model.setCostumeField("top", "silk shirt"));
    expect(h.sent("/vnccs/save_costume")).toEqual([]);
    await h.session.commitCostumeFields();
    expect(h.sent("/vnccs/save_costume")[0]?.body).toEqual({
      character: "Alice",
      costume: "Dress",
      info: {
        top: "silk shirt",
        bottom: "",
        head: "",
        face: "",
        shoes: "",
      },
    });
    h.routes["/vnccs/save_costume"] = () =>
      Response.json({ error: "Disk full" }, { status: 500 });
    await h.session.commitCostumeFields();
    expect(h.notices).toEqual([
      { title: "Save Failed", message: "Disk full", level: undefined },
    ]);
  });

  it("creates an empty costume and selects it", async () => {
    const h = harness();
    await h.start();
    await h.session.createCostume("  Coat ");
    expect(h.sent("/vnccs/save_costume")[0]?.body).toEqual({
      character: "Alice",
      costume: "Coat",
      info: {},
    });
    expect(h.state().costume).toBe("Coat");
    expect(h.session.ui.costumes).toEqual(["Dress", "Casual", "Coat"]);
    expect(h.state().costume_info.top).toBe("Coat top");
  });

  it("selects an existing name instead of clearing its fields", async () => {
    const h = harness();
    await h.start();
    await h.session.createCostume("Casual");
    expect(h.sent("/vnccs/save_costume")).toEqual([]);
    expect(h.state().costume).toBe("Casual");
  });

  it("refuses base sprite set names and shows server errors", async () => {
    const h = harness();
    await h.start();
    await expect(h.session.createCostume("naked")).rejects.toThrow(
      "base sprite set"
    );
    h.routes["/vnccs/save_costume"] = () =>
      Response.json({ error: "Invalid costume name" }, { status: 400 });
    await expect(h.session.createCostume("Bad/Name")).rejects.toThrow(
      "Invalid costume name"
    );
    expect(h.state().costume).toBe("Dress");
  });
});

describe("clothes session deletion", () => {
  for (const remaining of [true, false]) {
    it(`deletes and selects ${remaining ? "the next costume" : "nothing"}`, async () => {
      const h = harness({
        costumes: remaining
          ? ["Naked", "Dress", "Casual"]
          : ["Naked", "Original", "Dress"],
      });
      await h.start();
      const ticket = h.session.openDelete();
      expect(ticket).toMatchObject({ character: "Alice", costume: "Dress" });
      if (!ticket) {
        return;
      }
      await expect(h.session.confirmDelete(ticket)).resolves.toEqual({
        status: "deleted",
        warning: "",
      });
      const [sent] = h.sent("/vnccs/delete_costume");
      expect(sent?.method).toBe("POST");
      expect(sent?.body).toEqual({ character: "Alice", costume: "Dress" });
      const state = h.state();
      expect(state.costume).toBe(remaining ? "Casual" : "");
      expect(state.costume_info.top).toBe(remaining ? "Casual top" : "");
      expect(h.session.ui.costumes).toEqual(remaining ? ["Casual"] : []);
      expect(h.session.ui.deleting).toBe(false);
      expect(state.selected_preview_sprite?.costume).toBe(
        remaining ? "Casual" : "Naked"
      );
      expect(
        h.sent("/vnccs/get_character_pose_preview_meta").at(-1)?.url
      ).toContain(remaining ? "costume=Casual" : "costume=Naked");
    });
  }

  it("keeps the selection and its data for a retry when the server refuses", async () => {
    const h = harness();
    await h.start();
    h.routes["/vnccs/delete_costume"] = () =>
      Response.json({ error: "Delete denied" }, { status: 500 });
    const original = JSON.stringify(h.state());
    const ticket = h.session.openDelete();
    if (!ticket) {
      throw new Error("No delete ticket");
    }
    const listed = h.sent("/vnccs/list_costumes").length;
    await expect(h.session.confirmDelete(ticket)).rejects.toThrow(
      "Delete denied"
    );
    expect(JSON.stringify(h.state())).toBe(original);
    expect(h.session.ui.deleting).toBe(false);
    expect(h.sent("/vnccs/delete_costume")).toHaveLength(1);
    expect(h.sent("/vnccs/list_costumes")).toHaveLength(listed);
  });

  for (const costume of ["", "Naked", "Original"]) {
    it(`refuses the protected or empty selection '${costume}'`, async () => {
      const h = harness();
      await h.start();
      h.session.update((model) => {
        model.state.costume = costume;
      });
      expect(h.session.openDelete()).toBeNull();
      expect(h.notices).toHaveLength(1);
      expect(h.notices[0]?.message).toContain(
        "Base sprite sets cannot be deleted"
      );
      expect(h.sent("/vnccs/delete_costume")).toEqual([]);
    });
  }

  it("cannot delete an earlier selection after the character changed", async () => {
    const h = harness();
    await h.start();
    const ticket = h.session.openDelete();
    await h.session.selectCharacter("Bob");
    if (!ticket) {
      throw new Error("No delete ticket");
    }
    await expect(h.session.confirmDelete(ticket)).resolves.toEqual({
      status: "stale",
    });
    expect(h.sent("/vnccs/delete_costume")).toEqual([]);
  });

  for (const change of ["selection", "removal"]) {
    it(`a deletion reply does not change the state after ${change}`, async () => {
      const h = harness();
      await h.start();
      const pending = held(h.routes, "/vnccs/delete_costume");
      const ticket = h.session.openDelete();
      if (!ticket) {
        throw new Error("No delete ticket");
      }
      const deleting = h.session.confirmDelete(ticket);
      await flush();
      if (change === "selection") {
        h.session.update((model) => {
          model.state.character = "Bob";
        });
      } else {
        h.session.dispose();
      }
      const expected = JSON.stringify(h.state());
      const listed = h.sent("/vnccs/list_costumes").length;
      pending[0]?.resolve(Response.json({ status: "ok" }));
      await expect(deleting).resolves.toEqual({ status: "stale" });
      expect(JSON.stringify(h.state())).toBe(expected);
      expect(h.sent("/vnccs/list_costumes")).toHaveLength(listed);
    });
  }

  it("waits for earlier field saves and blocks the controls meanwhile", async () => {
    const h = harness();
    await h.start();
    const saves = held(h.routes, "/vnccs/save_costume");
    const saving = h.session.commitCostumeFields();
    const ticket = h.session.openDelete();
    if (!ticket) {
      throw new Error("No delete ticket");
    }
    const deleting = h.session.confirmDelete(ticket);
    await flush();
    expect(h.sent("/vnccs/delete_costume")).toEqual([]);
    expect(h.session.ui.deleting).toBe(true);
    saves[0]?.resolve(Response.json({ status: "ok" }));
    await saving;
    await deleting;
    expect(h.sent("/vnccs/delete_costume")).toHaveLength(1);
    expect(h.session.ui.deleting).toBe(false);
  });

  it("refuses while a preview renders", async () => {
    const h = harness();
    await h.start();
    const early = h.session.openDelete();
    const previews = held(h.routes, "/vnccs/control_center/clothes_preview");
    const rendering = h.session.generatePreview();
    await flush();
    expect(h.session.openDelete()).toBeNull();
    expect(h.notices.at(-1)?.message).toContain("Wait for preview generation");
    if (!early) {
      throw new Error("No delete ticket");
    }
    await expect(h.session.confirmDelete(early)).resolves.toEqual({
      status: "busy",
    });
    previews[0]?.resolve(Response.json({ image: "QUJD" }));
    await rendering;
    expect(h.sent("/vnccs/delete_costume")).toEqual([]);
  });

  it("leaves a safe empty selection when the next costume fails to load", async () => {
    const h = harness();
    await h.start();
    let attempts = 0;
    h.routes["/vnccs/get_costume"] = () => {
      attempts += 1;
      return attempts === 1
        ? Response.json({ error: "Disk unavailable" }, { status: 500 })
        : Response.json({ top: "jacket" });
    };
    const ticket = h.session.openDelete();
    if (!ticket) {
      throw new Error("No delete ticket");
    }
    await h.session.confirmDelete(ticket);
    expect(h.state().costume).toBe("");
    expect(h.notices).toEqual([
      { title: "Error", message: "Disk unavailable", level: undefined },
    ]);
    expect(h.session.ui.loadingCostume).toBe(false);
    expect(h.sent("/vnccs/save_costume")).toEqual([]);
    await h.session.selectCostume("Casual");
    expect(h.state().costume).toBe("Casual");
    expect(h.state().costume_info.top).toBe("jacket");
  });

  it("returns the cleanup warning of a committed deletion", async () => {
    const h = harness();
    await h.start();
    h.routes["/vnccs/delete_costume"] = () =>
      Response.json({
        status: "ok",
        warning: "Cleanup pending at .vnccs-delete-example",
      });
    const ticket = h.session.openDelete();
    if (!ticket) {
      throw new Error("No delete ticket");
    }
    const result = await h.session.confirmDelete(ticket);
    expect(result).toEqual({
      status: "deleted",
      warning: "Cleanup pending at .vnccs-delete-example",
    });
    expect(h.state().costume).toBe("Dress");
  });
});

describe("clothes session wizard", () => {
  it("fills the fields and saves them", async () => {
    const h = harness();
    await h.start();
    const ticket = h.session.openWizard();
    if (!ticket) {
      throw new Error("No wizard ticket");
    }
    await expect(
      h.session.runWizard(ticket, "Santa Claus costume")
    ).resolves.toBe(true);
    expect(h.sent("/vnccs/clothes_wizard")[0]?.body).toEqual({
      description: "Santa Claus costume",
      node_id: "753",
    });
    const info = {
      top: "red coat",
      bottom: "",
      head: "santa hat",
      face: "",
      shoes: "",
    };
    expect(h.state().costume_info).toEqual(info);
    expect(h.sent("/vnccs/save_costume")[0]?.body).toEqual({
      character: "Alice",
      costume: "Dress",
      info,
    });
  });

  it("needs an editable costume", async () => {
    const h = harness({ costumes: ["Naked"] });
    await h.start();
    expect(h.session.openWizard()).toBeNull();
    expect(h.notices[0]?.title).toBe("Costume Required");
  });

  it("rethrows current failures with their error code", async () => {
    const h = harness();
    await h.start();
    h.routes["/vnccs/clothes_wizard"] = () =>
      Response.json(
        { error: "MODEL_MISSING", message: "Missing", model_name: "Qwen" },
        { status: 500 }
      );
    const ticket = h.session.openWizard();
    if (!ticket) {
      throw new Error("No wizard ticket");
    }
    const error = await h.session
      .runWizard(ticket, "coat")
      .catch((reason: unknown) => reason);
    expect(wizardFailure(error)?.code).toBe("MODEL_MISSING");
  });

  for (const change of ["delete", "selection", "close", "removal"]) {
    it(`drops a late result after ${change}`, async () => {
      const h = harness();
      await h.start();
      const pending = held(h.routes, "/vnccs/clothes_wizard");
      const ticket = h.session.openWizard();
      if (!ticket) {
        throw new Error("No wizard ticket");
      }
      const filling = h.session.runWizard(ticket, "A silk dress");
      await flush();
      if (change === "delete") {
        const deletion = h.session.openDelete();
        if (deletion) {
          await h.session.confirmDelete(deletion);
        }
      } else if (change === "selection") {
        await h.session.selectCostume("Casual");
      } else if (change === "close") {
        h.session.cancelWizard();
      } else {
        h.session.dispose();
      }
      const expected = JSON.stringify(h.state());
      pending[0]?.resolve(Response.json({ top: "silk dress" }));
      await expect(filling).resolves.toBe(false);
      expect(JSON.stringify(h.state())).toBe(expected);
      expect(h.sent("/vnccs/save_costume")).toEqual([]);
    });
  }
});

describe("clothes session preview", () => {
  it("stops a clone preview without a donor before any request", async () => {
    const h = harness();
    await h.start();
    h.session.update((model) => model.setActiveTab("clone"));
    const before = h.requests.length;
    await h.session.generatePreview();
    expect(h.requests).toHaveLength(before);
    expect(h.notices[0]?.title).toBe("Reference Required");
  });

  it("asks for a costume before rendering", async () => {
    const h = harness({ costumes: ["Naked"] });
    await h.start();
    await h.session.generatePreview();
    expect(h.notices[0]).toEqual({
      title: "Costume Required",
      message:
        "Create a new costume first, then select it before generating a preview.",
      level: "warning",
    });
    expect(writes(h.requests)).toEqual([]);
  });

  it("uploads the donor and sends it with the saved costume to the preview", async () => {
    const h = harness();
    await h.start();
    h.session.update((model) => model.setActiveTab("clone"));
    await h.session.uploadClone(
      new File(["png"], "my donor.png", { type: "image/png" })
    );
    const [upload] = h.sent("/upload/image");
    expect(upload?.form?.get("type")).toBe("input");
    expect(upload?.form?.get("overwrite")).toBe("true");
    expect((upload?.form?.get("image") as File).name).toBe(
      "clone_reference_my_donor.png"
    );
    const donor = { name: "donor.png", type: "input", subfolder: "clothes" };
    expect(h.state().clone_image).toEqual(donor);

    await h.session.generatePreview();
    const order = writes(h.requests).map((request) => request.path);
    expect(order).toEqual([
      "/upload/image",
      "/vnccs/save_costume",
      "/vnccs/control_center/clothes_preview",
    ]);
    const [preview] = h.sent("/vnccs/control_center/clothes_preview");
    expect(preview?.body).toMatchObject({
      repo_id: REPO,
      node_state: JSON.stringify({ active_kind: "QI2", selected_type: "UNET" }),
      selected_type: "unet",
      control_center_id: "758",
    });
    const sent = preview?.body?.clothes_state as Record<string, unknown>;
    expect(sent.clone_image).toEqual(donor);
    expect(sent.activeTab).toBe("clone");
    expect(h.session.ui.generatedImage).toBe("data:image/png;base64,QUJD");
    expect(h.session.ui.previewGenerated).toBe(true);
    expect(h.session.ui.previewRunning).toBe(false);
  });

  it("rolls a random seed before rendering", async () => {
    const h = harness();
    await h.start();
    h.session.update((model) => model.toggleSeedMode());
    await h.session.generatePreview();
    const sent = h.sent("/vnccs/control_center/clothes_preview")[0]?.body
      ?.clothes_state as { gen_settings: { seed: number } };
    expect(sent.gen_settings.seed).toBe(5_000_000_000_000);
    expect(h.state().gen_settings.seed).toBe(5_000_000_000_000);
  });

  it("keeps background clicks under Qwen Image 2.1 through sync and the preview", async () => {
    const h = harness({
      saved: {
        character: "Alice",
        costume: "Dress",
        gen_settings: {
          background_color: "Transparent",
          background_model_kind: "qi2",
        },
      },
    });
    await h.start();
    for (const background of ["Blue", "Green", "Transparent"]) {
      h.session.update((model) => model.setBackground(background));
      h.session.syncControlCenter();
      expect(h.state().gen_settings.background_color).toBe(background);
      await h.session.generatePreview();
      const sent = h.sent("/vnccs/control_center/clothes_preview").at(-1)?.body
        ?.clothes_state as { gen_settings: { background_color: string } };
      expect(sent.gen_settings.background_color).toBe(background);
    }
  });

  it("drops a render made for an earlier selection", async () => {
    const h = harness();
    await h.start();
    const pending = held(h.routes, "/vnccs/control_center/clothes_preview");
    const rendering = h.session.generatePreview();
    await flush();
    await h.session.selectCostume("Casual");
    pending[0]?.resolve(Response.json({ image: "QUJD" }));
    await rendering;
    expect(h.session.ui.generatedImage).toBeNull();
    expect(h.notices).toEqual([]);
  });

  it("reports a failed render", async () => {
    const h = harness();
    await h.start();
    h.routes["/vnccs/control_center/clothes_preview"] = () =>
      new Response("Missing VNCCS Clothes Core", {
        status: 500,
        headers: { "content-type": "text/plain" },
      });
    await h.session.generatePreview();
    expect(h.notices).toEqual([
      {
        title: "Preview Failed",
        message: "Missing VNCCS Clothes Core",
        level: undefined,
      },
    ]);
  });

  it("ignores a sprite load for an earlier selection", async () => {
    const h = harness();
    await h.start();
    const pending = held(h.routes, "/vnccs/get_character_pose_preview_meta");
    const probes = h.probes.length;
    const older = h.session.refreshPreview();
    h.session.update((model) => {
      model.state.character = "Bob";
      model.state.costume = "Suit";
    });
    const newer = h.session.refreshPreview();
    await flush();
    pending[1]?.resolve(Response.json({ count: 2 }));
    await newer;
    pending[0]?.resolve(Response.json({ count: 4 }));
    await older;
    const sprite = h.session.snapshot().sprite;
    expect(sprite.character).toBe("Bob");
    expect(sprite.costume).toBe("Suit");
    expect(h.state().selected_preview_sprite).toEqual({
      character: "Bob",
      costume: "Suit",
      index: 0,
      count: 2,
    });
    expect(h.probes.slice(probes).every((url) => url.includes("Bob"))).toBe(
      true
    );
  });

  it("shows a run's cached render and keeps the sprite it dressed", async () => {
    const h = harness();
    await h.start();
    const pending = held(h.routes, "/vnccs/get_character_pose_preview_meta");
    const normal = h.session.refreshPreview();
    const selected = {
      character: "Alice",
      costume: "Dress",
      index: 2,
      count: 3,
    };
    h.session.update((model) => model.setSelectedPreviewSprite(selected));
    h.session.handlePreviewUpdated({ node_id: "753", character: "Alice" });
    await flush();
    pending[0]?.resolve(Response.json({ count: 3 }));
    await normal;
    await flush();
    const sprite = h.session.snapshot().sprite;
    expect(sprite.url).toContain(
      "get_preview?character=Alice&costume=Dress&ts=100&force_cache=true"
    );
    expect(h.state().selected_preview_sprite).toEqual(selected);
  });

  it("ignores events of other nodes and characters", async () => {
    const h = harness();
    await h.start();
    const probes = h.probes.length;
    h.session.handlePreviewUpdated({ node_id: "818", character: "Alice" });
    h.session.handlePreviewUpdated({ node_id: "753", character: "Bob" });
    await flush();
    expect(h.probes).toHaveLength(probes);
  });

  it("clears the dressed sprite when the costume has none", async () => {
    const h = harness({ spriteCount: 0 });
    await h.start();
    expect(h.state().selected_preview_sprite).toBeNull();
    expect(h.session.snapshot().sprite.url).toContain(
      "get_preview?character=Alice&costume=Dress"
    );
  });

  it("reports the node's costume check", async () => {
    const h = harness();
    await h.start();
    h.session.handleValidationError({ node_id: "751", message: "x" });
    h.session.handleValidationError({ node_id: "753", message: "No costume" });
    expect(h.notices).toEqual([
      { title: "Costume Required", message: "No costume", level: undefined },
    ]);
  });

  it("reports failed uploads and keeps the donor", async () => {
    const h = harness();
    await h.start();
    h.routes["/upload/image"] = () => Response.json({ subfolder: "" });
    await expect(
      h.session.uploadClone(new File(["png"], "a.png"))
    ).resolves.toBe(false);
    expect(h.notices[0]).toMatchObject({
      title: "Upload Failed",
      message: "Upload response did not include an image name.",
    });
    expect(h.state().clone_image).toBeNull();
  });
});
