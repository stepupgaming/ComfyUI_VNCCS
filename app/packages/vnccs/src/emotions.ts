import { type VnccsHttp, VnccsRequestError } from "./http";

/** One `emotions-config/emotions.json` entry, tagged with its category. */
export interface EmotionEntry {
  category: string;
  description: string;
  key: string;
  natural_prompt: string;
  safe_name: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toEntry(value: unknown, category: string): EmotionEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const safeName = text(record.safe_name);
  if (!safeName) {
    return null;
  }
  return {
    category: text(record.category) || category,
    description: text(record.description),
    key: text(record.key) || safeName,
    natural_prompt: text(record.natural_prompt),
    safe_name: safeName,
  };
}

/** `/vnccs/get_emotions` maps categories to lists; the studio shows one flat list. */
export function flattenEmotions(data: unknown): EmotionEntry[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [];
  }
  const flat: EmotionEntry[] = [];
  for (const [category, items] of Object.entries(data)) {
    if (!Array.isArray(items)) {
      continue;
    }
    for (const item of items) {
      const entry = toEntry(item, category);
      if (entry) {
        flat.push(entry);
      }
    }
  }
  return flat;
}

export async function fetchEmotions(http: VnccsHttp): Promise<EmotionEntry[]> {
  return flattenEmotions(await http.get<unknown>("/vnccs/get_emotions"));
}

/** Saved characters, as the node's `character` input accepts them. */
export async function fetchCharacters(http: VnccsHttp): Promise<string[]> {
  const data = await http.get<unknown>("/vnccs/list_characters");
  return Array.isArray(data) ? data.map(String).filter(Boolean) : [];
}

/** The node's placeholder when no character exists; it never has costumes. */
export const PLACEHOLDER_CHARACTER = "Character Name";

/** Costumes of a character that have source sprites to put emotions on. */
export async function fetchCharacterCostumes(
  http: VnccsHttp,
  character: string
): Promise<string[]> {
  if (!character || character === PLACEHOLDER_CHARACTER) {
    return [];
  }
  const data = await http.get<unknown>("/vnccs/get_character_costumes", {
    character,
  });
  return Array.isArray(data) ? data.map(String).filter(Boolean) : [];
}

export function emotionImageUrl(http: VnccsHttp, safeName: string): string {
  return http.url("/vnccs/get_emotion_image", { name: safeName, v: "webp" });
}

export interface CustomEmotionInput {
  description: string;
  /** A `data:image/...` URL, or empty for no image. */
  imageData: string;
  name: string;
  naturalPrompt: string;
}

const SAVE_FAILED = "Failed to save custom emotion.";

/**
 * Add Custom Emotion: the server appends the emotion to `emotions.json`
 * under "Custom" and returns it with its unique safe name.
 */
export async function addCustomEmotion(
  http: VnccsHttp,
  input: CustomEmotionInput
): Promise<EmotionEntry> {
  let data: { emotion?: unknown };
  try {
    data = await http.post<{ emotion?: unknown }>("/vnccs/add_custom_emotion", {
      name: input.name.trim(),
      description: input.description.trim(),
      natural_prompt: input.naturalPrompt.trim(),
      image_data: input.imageData,
    });
  } catch (error) {
    const payload =
      error instanceof VnccsRequestError
        ? (error.data as { error?: unknown } | null)
        : null;
    throw new Error(text(payload?.error) || SAVE_FAILED);
  }
  const emotion = toEntry(data?.emotion, "Custom");
  if (!emotion) {
    throw new Error("Server did not return a valid emotion.");
  }
  return emotion;
}
