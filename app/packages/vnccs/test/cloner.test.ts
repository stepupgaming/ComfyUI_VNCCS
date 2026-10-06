import { describe, expect, it } from "vitest";
import { presetSelection } from "../src/character-presets";
import {
  analysisError,
  analyzeClonerSource,
  ClonerTagLoader,
  clonerTagGroups,
  DEPENDENCY_HINT,
  uploadClonerSource,
} from "../src/cloner";
import { fetchWizardModelStatus } from "../src/creator";
import { VnccsHttp, VnccsRequestError } from "../src/http";

const BASE = "http://127.0.0.1:8188";

interface Sent {
  body: unknown;
  method: string;
  url: string;
}

function server(answer: (url: string) => Response) {
  const sent: Sent[] = [];
  const http = new VnccsHttp(BASE, (url, init) => {
    sent.push({ url, method: init?.method ?? "GET", body: init?.body });
    return Promise.resolve(answer(url));
  });
  return { http, sent };
}

const LEGACY_TAGS = {
  tags: {
    hair_color: [{ tag: "black_hair", label: "Black", synonyms: ["black"] }],
    hairstyles: [{ tag: "long_hair", label: "Long Hair" }],
    races: [{ tag: "elf", label: "Elf" }],
    breast_size: [{ tag: "medium_breasts", label: "Medium" }],
    details: [{ tag: "tattoo", label: "Tattoo" }],
    eyes: {
      colors: [{ tag: "blue_eyes", label: "Blue Eyes" }],
      features: [{ tag: "tsurime", label: "Tsurime" }],
      face_characteristics: [{ tag: "freckles", label: "Freckles" }],
    },
  },
};

const CREATOR_TAGS = {
  tags: {
    skin_color: [
      { tag: "porcelain skin", label: "Porcelain" },
      { tag: "golden tan skin", label: "Golden Tan" },
    ],
  },
};

function tagServer() {
  return server((url) =>
    Response.json(
      url.includes("catalog=creator_v2") ? CREATOR_TAGS : LEGACY_TAGS
    )
  );
}

describe("cloner upload", () => {
  it("uploads one reference under the clone_source prefix without extra fields", async () => {
    const { http, sent } = server(() =>
      Response.json({
        name: "clone_source_my_photo.png",
        type: "input",
        subfolder: "",
      })
    );
    const ref = await uploadClonerSource(
      http,
      new File(["x"], "my photo.png", { type: "image/png" })
    );
    expect(ref).toEqual({
      name: "clone_source_my_photo.png",
      type: "input",
      subfolder: "",
    });
    expect(sent[0]?.url).toBe(`${BASE}/api/upload/image`);
    expect(sent[0]?.method).toBe("POST");
    const fields = [...(sent[0]?.body as FormData).entries()];
    expect(fields).toHaveLength(1);
    expect((fields[0]?.[1] as File).name).toBe("clone_source_my_photo.png");
  });
});

describe("cloner analysis", () => {
  it("posts the selected reference object and the Cloner node id", async () => {
    const { http, sent } = server(() => Response.json({ face: "freckles" }));
    const ref = { name: "upload-1.png", type: "input", subfolder: "" };
    await expect(analyzeClonerSource(http, ref, "774")).resolves.toEqual({
      face: "freckles",
    });
    expect(sent[0]?.url).toBe(`${BASE}/api/vnccs/cloner_auto_generate`);
    expect(JSON.parse(String(sent[0]?.body))).toEqual({
      image_name: ref,
      node_id: "774",
    });
  });

  it("checks for the vision projector too", async () => {
    const { http, sent } = server(() => Response.json({ ready: true }));
    await fetchWizardModelStatus(http, { vision: true });
    expect(sent[0]?.url).toBe(`${BASE}/api/vnccs/qwen_vl_model_status`);
    expect(sent[0]?.url).not.toContain("vision=false");
  });

  it("classifies failures like the widget", async () => {
    const failing = (body: unknown, status = 500) =>
      analyzeClonerSource(
        server(() => Response.json(body, { status })).http,
        "a.png",
        "774"
      ).catch((error: unknown) => analysisError(error));

    expect(
      await failing({
        error: "DEPENDENCY_MISSING",
        message: "No module named llama_cpp",
        model_name: "llama-cpp-python",
      })
    ).toEqual({
      kind: "dependency",
      title: "Dependency Missing",
      message: "No module named llama_cpp",
      model: "llama-cpp-python",
    });
    expect(DEPENDENCY_HINT).toContain("JamePeng fork");
    for (const code of [
      "MODEL_MISSING",
      "MODEL_INVALID",
      "MMPROJ_MISSING",
      "MMPROJ_INVALID",
    ]) {
      const result = await failing({
        error: code,
        message: "m",
        model_name: "Qwen",
      });
      expect(result).toMatchObject({
        kind: "model",
        failure: { code, model: "Qwen" },
      });
    }
    expect(
      await failing({ error: "INVALID_RESPONSE", message: "Try again." }, 502)
    ).toEqual({
      kind: "other",
      title: "Error",
      message: "Auto-Gen Failed: Try again.",
    });

    const text = await analyzeClonerSource(
      server(
        () =>
          new Response("Image a.png not found", {
            status: 404,
            headers: { "content-type": "text/plain" },
          })
      ).http,
      "a.png",
      "774"
    ).catch((error: unknown) => {
      expect(error).toBeInstanceOf(VnccsRequestError);
      return analysisError(error);
    });
    expect(text).toMatchObject({
      message: "Auto-Gen Failed: Image a.png not found",
    });
    expect(analysisError(new TypeError("Failed to fetch"))).toMatchObject({
      kind: "other",
      message: "Auto-Gen Failed: Failed to fetch",
    });
  });
});

describe("cloner tag constructor", () => {
  it("maps each trait row onto the legacy catalog", () => {
    const headers = (field: Parameters<typeof clonerTagGroups>[1]) =>
      clonerTagGroups(LEGACY_TAGS, field).map((group) => group.header);
    expect(headers("hair")).toEqual(["HAIR COLOR", "HAIRSTYLES"]);
    expect(headers("eyes")).toEqual(["Eye Colors", "Eye Features"]);
    expect(headers("face")).toEqual(["Face Characteristics"]);
    expect(headers("race")).toEqual(["RACES"]);
    expect(headers("body")).toEqual(["BREAST SIZE"]);
    expect(headers("additional_details")).toEqual(["DETAILS"]);
    expect(headers("skin_color")).toEqual([]);
    expect(clonerTagGroups(null, "hair")).toEqual([]);
    expect(clonerTagGroups({ tags: { a_b_c: [] } }, "hair")).toEqual([]);
  });

  it("replaces only the first underscore of a category header", () => {
    const groups = clonerTagGroups(
      { tags: { details: [{ tag: "x" }] } },
      "additional_details"
    );
    expect(groups[0]?.header).toBe("DETAILS");
    const multi = clonerTagGroups(
      { tags: { hair_color: [], hairstyles: [] } },
      "hair"
    );
    expect(multi.map((group) => group.header)).toEqual([
      "HAIR COLOR",
      "HAIRSTYLES",
    ]);
  });

  it("presets preserve custom text and the Skin row loads the Creator skin choices once", async () => {
    const { http, sent } = tagServer();
    const loader = new ClonerTagLoader(() => http);
    const hair = await loader.groups("hair");
    expect(presetSelection("Black Hair, My Custom Hair", hair).value()).toBe(
      "Black Hair, My Custom Hair"
    );
    const skin = await loader.groups("skin_color");
    expect(skin.map((group) => group.header)).toEqual(["SKIN COLOR"]);
    const selection = presetSelection("", skin);
    const golden = skin[0]?.items.find((item) => item.label === "Golden Tan");
    expect(golden).toBeDefined();
    if (golden) {
      selection.toggle(golden);
    }
    expect(selection.value()).toBe("golden tan skin");
    await loader.groups("skin_color");
    await loader.groups("eyes");
    expect(
      sent.filter((call) => call.url.includes("catalog=creator_v2"))
    ).toHaveLength(1);
    expect(
      sent.filter((call) => call.url.endsWith("/api/vnccs/get_tags"))
    ).toHaveLength(1);
  });

  it("retries after the catalog failed to load", async () => {
    let fail = true;
    const { http, sent } = server(() =>
      fail
        ? Response.json({ error: "down" }, { status: 500 })
        : Response.json(LEGACY_TAGS)
    );
    const loader = new ClonerTagLoader(() => http);
    await expect(loader.groups("hair")).rejects.toThrow("down");
    fail = false;
    await expect(loader.groups("hair")).resolves.toHaveLength(2);
    expect(sent).toHaveLength(2);
  });
});
