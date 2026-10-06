import { describe, expect, it } from "vitest";
import type { StyleCatalog } from "../src/character-styles";
import { VnccsHttp } from "../src/http";
import {
  customStyleDraft,
  deleteUserStyle,
  filterStyles,
  generateStylePreview,
  isUserStyle,
  removeStyle,
  saveUserStyle,
  setStyleImage,
  styleDraft,
  stylePreviewMessage,
  stylePreviewRequest,
  stylePreviewStage,
  upsertUserStyle,
  validateStyleDraft,
} from "../src/style-library";

const BASE = "http://127.0.0.1:8188";
const USER_ID = `user_${"a".repeat(32)}`;
const OTHER_ID = `user_${"b".repeat(32)}`;

const CATALOG: StyleCatalog = {
  default_style: "anime",
  custom_preview: "",
  groups: [
    {
      label: "Illustration",
      styles: [
        {
          id: "anime",
          label: "Anime",
          description: "Cel shading",
          reference: "TV anime",
        },
        { id: "oil", label: "Oil", description: "Thick paint", reference: "" },
      ],
    },
    {
      label: "My styles",
      styles: [
        {
          id: USER_ID,
          label: "Mine",
          description: "",
          reference: "",
          prompt: "ink",
          user: true,
        },
      ],
    },
  ],
};

function client(answer: (url: string) => Response) {
  const requests: { body?: unknown; url: string }[] = [];
  const http = new VnccsHttp(BASE, (url, init) => {
    requests.push({
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return Promise.resolve(answer(url));
  });
  return { http, requests };
}

describe("style drafts", () => {
  it("edits user styles in place and copies built-ins as new styles", () => {
    const mine = CATALOG.groups[1]?.styles[0];
    const anime = CATALOG.groups[0]?.styles[0];
    expect(mine && isUserStyle(mine)).toBe(true);
    expect(anime && isUserStyle(anime)).toBe(false);
    expect(styleDraft(mine)).toEqual({
      id: USER_ID,
      label: "Mine",
      description: "",
      reference: "",
      prompt: "ink",
    });
    expect(styleDraft(anime).id).toBeUndefined();
    expect(styleDraft()).toEqual({
      label: "",
      description: "",
      reference: "",
      prompt: "",
    });
    expect(customStyleDraft("pastel")).toEqual({
      label: "Custom style",
      description: "",
      reference: "Your prompt",
      prompt: "pastel",
    });
  });

  it("mirrors the server validation", () => {
    const valid = { label: "A", description: "", reference: "", prompt: "p" };
    expect(validateStyleDraft(valid)).toBeNull();
    expect(validateStyleDraft({ ...valid, label: " " })).toBe(
      "Name and style prompt are required"
    );
    expect(validateStyleDraft({ ...valid, prompt: "" })).toBe(
      "Name and style prompt are required"
    );
    expect(validateStyleDraft({ ...valid, label: "x".repeat(101) })).toBe(
      "Invalid label; maximum length is 100"
    );
    expect(
      validateStyleDraft({ ...valid, label: "😀".repeat(100) })
    ).toBeNull();
    expect(validateStyleDraft({ ...valid, reference: "a\0b" })).toBe(
      "Invalid reference; maximum length is 500"
    );
    expect(validateStyleDraft({ ...valid, id: "anime" })).toBe(
      "Invalid user style ID"
    );
    expect(validateStyleDraft({ ...valid, id: USER_ID })).toBeNull();
  });
});

describe("style catalog edits", () => {
  it("upserts into My styles and creates the group when missing", () => {
    const edited = upsertUserStyle(CATALOG, {
      id: USER_ID,
      label: "Renamed",
    });
    expect(edited.groups[1]?.styles).toEqual([
      { id: USER_ID, label: "Renamed", user: true },
    ]);
    expect(CATALOG.groups[1]?.styles[0]?.label).toBe("Mine");

    const bare = { ...CATALOG, groups: CATALOG.groups.slice(0, 1) };
    const added = upsertUserStyle(bare, { id: OTHER_ID, label: "New" });
    expect(added.groups.map((group) => group.label)).toEqual([
      "Illustration",
      "My styles",
    ]);
  });

  it("removes the emptied My styles group", () => {
    const removed = removeStyle(CATALOG, USER_ID);
    expect(removed.groups.map((group) => group.label)).toEqual([
      "Illustration",
    ]);
    expect(removeStyle(CATALOG, "oil").groups[0]?.styles).toHaveLength(1);
  });

  it("stores a new preview image", () => {
    const image = `/vnccs/character_styles/preview?style=${USER_ID}&v=1_2`;
    expect(
      setStyleImage(CATALOG, USER_ID, image).groups[1]?.styles[0]?.image
    ).toBe(image);
    expect(setStyleImage(CATALOG, "custom", "x").custom_preview).toBe("x");
  });

  it("filters with the Custom card first", () => {
    expect(filterStyles(CATALOG, "", "").map((style) => style.id)).toEqual([
      "custom",
      "anime",
      "oil",
      USER_ID,
    ]);
    expect(filterStyles(CATALOG, " TV ", "").map((style) => style.id)).toEqual([
      "anime",
    ]);
    expect(
      filterStyles(CATALOG, "", "My styles").map((style) => style.id)
    ).toEqual([USER_ID]);
    expect(filterStyles(CATALOG, "your prompt", "")[0]?.id).toBe("custom");
  });
});

describe("style library routes", () => {
  it("creates without an id and updates with one", async () => {
    const { http, requests } = client(() =>
      Response.json({ style: { id: USER_ID, label: "A", image: "" } })
    );
    const draft = { label: "A", description: "d", reference: "r", prompt: "p" };
    await expect(saveUserStyle(http, draft)).resolves.toEqual({
      id: USER_ID,
      label: "A",
      image: "",
      user: true,
    });
    await saveUserStyle(http, { ...draft, id: USER_ID });
    expect(requests.map((request) => request.body)).toEqual([
      draft,
      { ...draft, id: USER_ID },
    ]);
    expect(requests[0]?.url).toBe(`${BASE}/api/vnccs/character_styles`);
  });

  it("rejects a save answered for another style", async () => {
    const { http } = client(() => Response.json({ style: { id: OTHER_ID } }));
    await expect(
      saveUserStyle(http, {
        id: USER_ID,
        label: "A",
        description: "",
        reference: "",
        prompt: "p",
      })
    ).rejects.toThrow("Invalid style save response");
  });

  it("surfaces the server's validation message", async () => {
    const { http } = client(() =>
      Response.json(
        { error: "User style no longer exists; save it as a new style" },
        { status: 400 }
      )
    );
    await expect(
      saveUserStyle(http, {
        id: USER_ID,
        label: "A",
        description: "",
        reference: "",
        prompt: "p",
      })
    ).rejects.toThrow("save it as a new style");
  });

  it("deletes only user styles and checks the reply", async () => {
    const { http, requests } = client(() =>
      Response.json({ deleted: true, style_id: USER_ID })
    );
    await deleteUserStyle(http, USER_ID);
    expect(requests[0]?.url).toBe(
      `${BASE}/api/vnccs/character_styles/delete?style=${USER_ID}`
    );
    await expect(deleteUserStyle(http, "anime")).rejects.toThrow(
      "Only user styles can be deleted"
    );
    const wrong = client(() =>
      Response.json({ deleted: true, style_id: OTHER_ID })
    );
    await expect(deleteUserStyle(wrong.http, USER_ID)).rejects.toThrow(
      "Invalid style deletion response"
    );
  });

  it("renders previews with seed 0 from a copied payload", async () => {
    const source = {
      character_info: { name: "Ann" },
      gen_settings: {
        seed: 42,
        seed_mode: "randomize",
        mode_settings: { qi2: { steps: 6 } },
        steps: 6,
      },
    };
    const request = stylePreviewRequest(USER_ID, source, "studio", "req-1");
    source.character_info.name = "Changed";
    expect(request).toEqual({
      character_info: { name: "Ann" },
      gen_settings: {
        seed: 0,
        seed_mode: "fixed",
        mode_settings: {},
        steps: 6,
      },
      node_id: "studio",
      request_id: "req-1",
      style_id: USER_ID,
    });

    const image = `/vnccs/character_styles/preview?style=${USER_ID}&v=1_2`;
    const { http, requests } = client(() =>
      Response.json({
        style_id: USER_ID,
        image,
        width: 1024,
        height: 1024,
        saved: true,
        path: "C:/secret/path.webp",
      })
    );
    await expect(generateStylePreview(http, request)).resolves.toEqual({
      image,
      width: 1024,
      height: 1024,
    });
    expect(requests[0]?.body).toEqual(request);
  });

  it("rejects unconfirmed or foreign previews", async () => {
    const request = stylePreviewRequest(
      USER_ID,
      { character_info: {}, gen_settings: {} },
      "studio",
      "r"
    );
    const unsaved = client(() => Response.json({ style_id: USER_ID }));
    await expect(generateStylePreview(unsaved.http, request)).rejects.toThrow(
      "did not confirm saving"
    );
    const foreign = client(() =>
      Response.json({
        style_id: USER_ID,
        saved: true,
        image: "https://evil.example/x.webp",
      })
    );
    await expect(generateStylePreview(foreign.http, request)).rejects.toThrow(
      "Invalid style preview response"
    );
    const failed = client(
      () =>
        new Response("Enter a custom style prompt", {
          status: 400,
          headers: { "content-type": "text/plain" },
        })
    );
    await expect(generateStylePreview(failed.http, request)).rejects.toThrow(
      "Enter a custom style prompt"
    );
  });

  it("matches stage events to this render", () => {
    expect(
      stylePreviewStage(
        { node_id: "studio", request_id: "r", status: "running" },
        "studio",
        "r"
      )
    ).toBe("running");
    expect(
      stylePreviewStage(
        { node_id: "studio", request_id: "old", status: "running" },
        "studio",
        "r"
      )
    ).toBeNull();
    expect(
      stylePreviewStage(
        { node_id: 5, request_id: "r", status: "odd" },
        "5",
        "r"
      )
    ).toBeNull();
    expect(stylePreviewMessage("queued", "Mine")).toBe("Queued: Mine");
    expect(stylePreviewMessage("running", "Mine")).toBe("Rendering: Mine");
  });
});
