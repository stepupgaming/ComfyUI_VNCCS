import { describe, expect, it } from "vitest";
import { VnccsHttp } from "../src/http";
import {
  cleanupTitle,
  deleteEmptyFolders,
  emptyCostumesMessage,
  emptySpriteManagerState,
  fetchCostumesForEmotion,
  fetchSpriteCharacters,
  fetchSpriteEmotions,
  findEmptyFolders,
  normalizeEmotions,
  pickCharacter,
  pickEmotion,
  spriteSheetPreviewUrl,
} from "../src/sprite-manager";

const BASE = "http://127.0.0.1:8188";

function client(answer: (url: string, init?: RequestInit) => Response) {
  const requests: { body?: unknown; url: string }[] = [];
  const http = new VnccsHttp(BASE, (url, init) => {
    requests.push({
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return Promise.resolve(answer(url, init));
  });
  return { http, requests };
}

describe("sprite manager state", () => {
  it("falls back to the neutral emotion", () => {
    expect(normalizeEmotions([])).toEqual(["neutral"]);
    expect(normalizeEmotions(["happy", "sad"])).toEqual(["happy", "sad"]);
  });

  it("keeps the selection by name", () => {
    expect(pickEmotion("sad", ["happy", "sad"])).toBe("sad");
    expect(pickEmotion("angry", ["happy", "sad"])).toBe("happy");
    expect(pickEmotion("angry", [])).toBe("neutral");
    expect(pickCharacter(["Ann", "Bob"], "Bob")).toBe("Bob");
    expect(pickCharacter(["Ann", "Bob"], "Cid")).toBe("Ann");
    expect(pickCharacter([], "Cid")).toBe("");
  });

  it("explains an empty costume strip", () => {
    expect(emptyCostumesMessage(emptySpriteManagerState)).toBe(
      "Select a character"
    );
    expect(
      emptyCostumesMessage({ ...emptySpriteManagerState, character: "Ann" })
    ).toBe("No costumes found");
    expect(
      emptyCostumesMessage({
        ...emptySpriteManagerState,
        character: "Ann",
        costumes: ["Casual"],
      })
    ).toBeNull();
  });

  it("titles the cleanup dialog", () => {
    const folder = { path: "Sprites/Casual/happy", reason: "" };
    expect(cleanupTitle({ character: "Ann", folders: [] })).toBe(
      "No empty folders found"
    );
    expect(cleanupTitle({ character: "Ann", folders: [folder] })).toBe(
      "Delete 1 empty folder?"
    );
    expect(cleanupTitle({ character: "Ann", folders: [folder, folder] })).toBe(
      "Delete 2 empty folders?"
    );
  });
});

describe("sprite manager routes", () => {
  it("encodes the browse queries", async () => {
    const { http, requests } = client((url) =>
      Response.json(url.includes("emotions") ? [] : ["Casual", 3, ""])
    );
    await expect(fetchSpriteCharacters(http)).resolves.toEqual(["Casual"]);
    await expect(fetchSpriteEmotions(http, "Ann & Bo")).resolves.toEqual([
      "neutral",
    ]);
    await expect(
      fetchCostumesForEmotion(http, "Ann & Bo", "very happy")
    ).resolves.toEqual(["Casual"]);
    expect(requests.map((request) => request.url)).toEqual([
      `${BASE}/api/vnccs/list_characters`,
      `${BASE}/api/vnccs/get_character_emotions?character=Ann+%26+Bo`,
      `${BASE}/api/vnccs/get_costumes_by_emotion?character=Ann+%26+Bo&emotion=very+happy`,
    ]);
  });

  it("asks nothing without a character", async () => {
    const { http, requests } = client(() => Response.json([]));
    await expect(fetchSpriteEmotions(http, "")).resolves.toEqual([]);
    await expect(fetchCostumesForEmotion(http, "", "happy")).resolves.toEqual(
      []
    );
    expect(requests).toEqual([]);
  });

  it("builds the sprite preview URL", () => {
    const http = new VnccsHttp(BASE);
    expect(
      spriteSheetPreviewUrl(http, "Ann", "School Uniform", "happy", 7)
    ).toBe(
      `${BASE}/api/vnccs/get_sheet_preview?character=Ann&costume=School+Uniform&emotion=happy&ts=7`
    );
  });

  it("deletes exactly the scanned folders", async () => {
    const { http, requests } = client((url) =>
      url.includes("find_empty_folders")
        ? Response.json({
            character: "Ann",
            empty_folders: [
              { path: "Sprites\\Casual\\happy", reason: "No images in folder" },
              { path: "", reason: "ignored" },
              { reason: "ignored" },
            ],
            count: 3,
          })
        : Response.json({
            deleted: ["Ann\\Sprites\\Casual\\happy"],
            deleted_count: 1,
            errors: [],
          })
    );
    const scan = await findEmptyFolders(http, "Ann");
    expect(scan).toEqual({
      character: "Ann",
      folders: [
        { path: "Sprites\\Casual\\happy", reason: "No images in folder" },
      ],
    });
    await expect(deleteEmptyFolders(http, scan)).resolves.toEqual({
      deleted: ["Ann\\Sprites\\Casual\\happy"],
      errors: [],
    });
    expect(requests[1]).toEqual({
      url: `${BASE}/api/vnccs/delete_empty_folders`,
      body: { character: "Ann", folders: ["Sprites\\Casual\\happy"] },
    });
  });

  it("surfaces a scan error", async () => {
    const { http } = client(() =>
      Response.json(
        { error: "character may only contain letters" },
        { status: 400 }
      )
    );
    await expect(findEmptyFolders(http, "../x")).rejects.toThrow(
      "character may only contain letters"
    );
  });
});
