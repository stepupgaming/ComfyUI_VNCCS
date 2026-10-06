import type { VnccsHttp } from "./http";

/**
 * REST calls and pure state of the Sprite Manager widget
 * (`web/vnccs_sprite_manager.js`): browse a character's finished sprites by
 * emotion and costume, and clean up empty sprite folders.
 */

export const DEFAULT_EMOTION = "neutral";

export interface SpriteManagerState {
  character: string;
  characters: string[];
  costumes: string[];
  emotion: string;
  emotions: string[];
}

export const emptySpriteManagerState: SpriteManagerState = {
  character: "",
  characters: [],
  costumes: [],
  emotion: DEFAULT_EMOTION,
  emotions: [DEFAULT_EMOTION],
};

export interface EmptyFolder {
  path: string;
  reason: string;
}

export interface EmptyFolderScan {
  character: string;
  folders: EmptyFolder[];
}

export interface EmptyFolderCleanup {
  deleted: string[];
  errors: string[];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === "string" && item !== ""
      )
    : [];
}

/** A character without sprites still offers the neutral emotion. */
export function normalizeEmotions(emotions: readonly string[]): string[] {
  return emotions.length > 0 ? [...emotions] : [DEFAULT_EMOTION];
}

/**
 * Keep the selected emotion by name. The widget kept its index, so switching
 * characters could silently show a different emotion.
 */
export function pickEmotion(
  previous: string,
  emotions: readonly string[]
): string {
  return emotions.includes(previous)
    ? previous
    : (emotions[0] ?? DEFAULT_EMOTION);
}

export function pickCharacter(
  characters: readonly string[],
  previous: string
): string {
  return characters.includes(previous) ? previous : (characters[0] ?? "");
}

/** The costume strip's empty state, or null when there are cards to show. */
export function emptyCostumesMessage(state: SpriteManagerState): string | null {
  if (state.costumes.length > 0) {
    return null;
  }
  return state.character ? "No costumes found" : "Select a character";
}

export function cleanupTitle(scan: EmptyFolderScan): string {
  const count = scan.folders.length;
  if (count === 0) {
    return "No empty folders found";
  }
  return `Delete ${count} empty ${count === 1 ? "folder" : "folders"}?`;
}

export async function fetchSpriteCharacters(
  http: VnccsHttp
): Promise<string[]> {
  return strings(await http.get<unknown>("/vnccs/list_characters"));
}

export async function fetchSpriteEmotions(
  http: VnccsHttp,
  character: string
): Promise<string[]> {
  if (!character) {
    return [];
  }
  return normalizeEmotions(
    strings(
      await http.get<unknown>("/vnccs/get_character_emotions", { character })
    )
  );
}

export async function fetchCostumesForEmotion(
  http: VnccsHttp,
  character: string,
  emotion: string
): Promise<string[]> {
  if (!character) {
    return [];
  }
  return strings(
    await http.get<unknown>("/vnccs/get_costumes_by_emotion", {
      character,
      emotion,
    })
  );
}

/** The newest sprite of one costume and emotion, re-encoded as PNG. */
export function spriteSheetPreviewUrl(
  http: VnccsHttp,
  character: string,
  costume: string,
  emotion: string,
  ts: number
): string {
  return http.url("/vnccs/get_sheet_preview", {
    character,
    costume,
    emotion,
    ts,
  });
}

interface RawEmptyFolderScan {
  character?: unknown;
  empty_folders?: unknown;
}

function emptyFolder(value: unknown): EmptyFolder | null {
  const item = value as { path?: unknown; reason?: unknown } | null;
  if (typeof item?.path !== "string" || !item.path) {
    return null;
  }
  return {
    path: item.path,
    reason: typeof item.reason === "string" ? item.reason : "",
  };
}

/** Read-only scan of the character's Faces and Sprites emotion folders. */
export async function findEmptyFolders(
  http: VnccsHttp,
  character: string
): Promise<EmptyFolderScan> {
  const data = await http.get<RawEmptyFolderScan>("/vnccs/find_empty_folders", {
    character,
  });
  const folders = Array.isArray(data?.empty_folders)
    ? data.empty_folders
        .map(emptyFolder)
        .filter((item): item is EmptyFolder => item !== null)
    : [];
  return {
    character: typeof data?.character === "string" ? data.character : character,
    folders,
  };
}

/** Delete every folder of a scan; the server refuses any folder that still holds a file. */
export async function deleteEmptyFolders(
  http: VnccsHttp,
  scan: EmptyFolderScan
): Promise<EmptyFolderCleanup> {
  const data = await http.post<{ deleted?: unknown; errors?: unknown }>(
    "/vnccs/delete_empty_folders",
    {
      character: scan.character,
      folders: scan.folders.map((folder) => folder.path),
    }
  );
  return { deleted: strings(data?.deleted), errors: strings(data?.errors) };
}
