import { describe, expect, it } from "vitest";
import {
  addCustomEmotion,
  emotionImageUrl,
  fetchCharacterCostumes,
  fetchCharacters,
  fetchEmotions,
  flattenEmotions,
  PLACEHOLDER_CHARACTER,
} from "../src/emotions";
import { VnccsHttp } from "../src/http";

function httpAnswering(body: unknown, status = 200) {
  const calls: { body?: string; method: string; url: string }[] = [];
  const http = new VnccsHttp("http://127.0.0.1:8188", (input, init) => {
    calls.push({
      url: input,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return Promise.resolve(Response.json(body, { status }));
  });
  return { calls, http };
}

/** `/vnccs/get_emotions` as VNCCS 3.2.3 serves it, trimmed to two categories. */
const LIVE_EMOTIONS = {
  "\u{1F60A} Positive": [
    {
      key: "happy",
      description: "Smiling, bright eyes",
      safe_name: "happy",
      natural_prompt: "a happy face",
    },
    { key: "broken" },
  ],
  "\u{1F622} Negative": [
    {
      key: "sad",
      description: "Teary eyes",
      safe_name: "sad",
      natural_prompt: "a sad face",
    },
  ],
  Note: "not a list",
};

describe("emotion routes", () => {
  it("flattens the categories and drops entries without a safe name", () => {
    expect(flattenEmotions(LIVE_EMOTIONS)).toEqual([
      {
        category: "\u{1F60A} Positive",
        description: "Smiling, bright eyes",
        key: "happy",
        natural_prompt: "a happy face",
        safe_name: "happy",
      },
      {
        category: "\u{1F622} Negative",
        description: "Teary eyes",
        key: "sad",
        natural_prompt: "a sad face",
        safe_name: "sad",
      },
    ]);
    expect(flattenEmotions(null)).toEqual([]);
    expect(flattenEmotions([])).toEqual([]);
  });

  it("fetches emotions and characters", async () => {
    const emotions = httpAnswering(LIVE_EMOTIONS);
    await expect(fetchEmotions(emotions.http)).resolves.toHaveLength(2);
    expect(emotions.calls[0]?.url).toBe(
      "http://127.0.0.1:8188/api/vnccs/get_emotions"
    );
    const characters = httpAnswering(["StudioQA", ""]);
    await expect(fetchCharacters(characters.http)).resolves.toEqual([
      "StudioQA",
    ]);
    expect(characters.calls[0]?.url).toBe(
      "http://127.0.0.1:8188/api/vnccs/list_characters"
    );
  });

  it("asks for costumes only for a real character", async () => {
    const { calls, http } = httpAnswering(["Naked", "Simple"]);
    await expect(fetchCharacterCostumes(http, "")).resolves.toEqual([]);
    await expect(
      fetchCharacterCostumes(http, PLACEHOLDER_CHARACTER)
    ).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
    await expect(fetchCharacterCostumes(http, "Studio QA")).resolves.toEqual([
      "Naked",
      "Simple",
    ]);
    expect(calls[0]?.url).toBe(
      "http://127.0.0.1:8188/api/vnccs/get_character_costumes?character=Studio+QA"
    );
  });

  it("builds the emotion preview URL", () => {
    const { http } = httpAnswering({});
    expect(emotionImageUrl(http, "happy")).toBe(
      "http://127.0.0.1:8188/api/vnccs/get_emotion_image?name=happy&v=webp"
    );
  });

  it("posts a custom emotion and returns the saved entry", async () => {
    const { calls, http } = httpAnswering({
      emotion: {
        key: "smug",
        description: "Half smile",
        safe_name: "smug_1",
        natural_prompt: "a smug face",
      },
    });
    const saved = await addCustomEmotion(http, {
      name: " smug ",
      description: " Half smile ",
      naturalPrompt: "a smug face ",
      imageData: "",
    });
    expect(saved).toMatchObject({ category: "Custom", safe_name: "smug_1" });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(
      "http://127.0.0.1:8188/api/vnccs/add_custom_emotion"
    );
    expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
      name: "smug",
      description: "Half smile",
      natural_prompt: "a smug face",
      image_data: "",
    });
  });

  it("reports the server's reason when saving fails", async () => {
    const input = {
      name: "x",
      description: "",
      naturalPrompt: "",
      imageData: "",
    };
    const refused = httpAnswering({ error: "Name is required" }, 400);
    await expect(addCustomEmotion(refused.http, input)).rejects.toThrow(
      "Name is required"
    );
    const silent = httpAnswering({}, 500);
    await expect(addCustomEmotion(silent.http, input)).rejects.toThrow(
      "Failed to save custom emotion."
    );
    const empty = httpAnswering({ emotion: null });
    await expect(addCustomEmotion(empty.http, input)).rejects.toThrow(
      "Server did not return a valid emotion."
    );
  });
});
