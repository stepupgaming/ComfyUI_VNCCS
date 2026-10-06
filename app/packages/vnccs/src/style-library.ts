import {
  allStyles,
  type CharacterStyle,
  CUSTOM_STYLE_ID,
  customStyle,
  type StyleCatalog,
} from "./character-styles";
import type { VnccsHttp } from "./http";

/**
 * Editing the user style library (`web/character_styles.mjs`,
 * `nodes/character_styles.py`): create, edit and delete user styles, and
 * render one style's portrait preview. Built-in styles are read-only.
 */

export const USER_STYLE_GROUP = "My styles";

export const STYLE_LIMITS = {
  label: 100,
  description: 240,
  reference: 500,
  prompt: 16_000,
} as const;

export type StyleTextField = keyof typeof STYLE_LIMITS;

export const STYLE_FIELDS: readonly {
  key: StyleTextField;
  label: string;
  required: boolean;
}[] = [
  { key: "label", label: "Name", required: true },
  { key: "description", label: "Short description", required: false },
  { key: "reference", label: "Reference", required: false },
  { key: "prompt", label: "Style prompt", required: true },
];

const USER_STYLE_ID = /^user_[a-f0-9]{32}$/;
const PREVIEW_ROUTE = "/vnccs/character_styles/preview?";

export interface StyleDraft {
  description: string;
  /** Absent for a new style; the server assigns the id. */
  id?: string;
  label: string;
  prompt: string;
  reference: string;
}

export function isUserStyleId(id: string): boolean {
  return USER_STYLE_ID.test(id);
}

export function isUserStyle(style: CharacterStyle): boolean {
  return style.user === true && isUserStyleId(style.id);
}

/** The editor's fields for an existing user style, or a blank new one. */
export function styleDraft(style?: CharacterStyle): StyleDraft {
  const draft: StyleDraft = {
    label: style?.label ?? "",
    description: style?.description ?? "",
    reference: style?.reference ?? "",
    prompt: style?.prompt ?? "",
  };
  if (style && isUserStyle(style)) {
    draft.id = style.id;
  }
  return draft;
}

/** The Custom card opens the editor on the character's prompt; saving it adds a user style. */
export function customStyleDraft(customPrompt: string): StyleDraft {
  return {
    label: "Custom style",
    description: "",
    reference: "Your prompt",
    prompt: customPrompt,
  };
}

/** Python measures length in code points, not UTF-16 units. */
function codePoints(text: string): number {
  return [...text].length;
}

/** The server's `validate_user_style`, so the form can explain a rejection before sending. */
export function validateStyleDraft(draft: StyleDraft): string | null {
  for (const { key } of STYLE_FIELDS) {
    const text = draft[key];
    if (codePoints(text) > STYLE_LIMITS[key] || text.includes("\0")) {
      return `Invalid ${key}; maximum length is ${STYLE_LIMITS[key]}`;
    }
  }
  if (!(draft.label.trim() && draft.prompt.trim())) {
    return "Name and style prompt are required";
  }
  if (draft.id !== undefined && !isUserStyleId(draft.id)) {
    return "Invalid user style ID";
  }
  return null;
}

export async function saveUserStyle(
  http: VnccsHttp,
  draft: StyleDraft
): Promise<CharacterStyle> {
  const body: Record<string, string> = {
    label: draft.label,
    description: draft.description,
    reference: draft.reference,
    prompt: draft.prompt,
  };
  if (draft.id) {
    body.id = draft.id;
  }
  const data = await http.post<{ style?: CharacterStyle }>(
    "/vnccs/character_styles",
    body
  );
  const style = data?.style;
  if (!(style && typeof style.id === "string" && isUserStyleId(style.id))) {
    throw new Error("Invalid style save response");
  }
  if (draft.id && style.id !== draft.id) {
    throw new Error("Invalid style save response");
  }
  return { ...style, user: true };
}

export async function deleteUserStyle(
  http: VnccsHttp,
  id: string
): Promise<void> {
  if (!isUserStyleId(id)) {
    throw new Error("Only user styles can be deleted");
  }
  const data = await http.post<{ deleted?: unknown; style_id?: unknown }>(
    "/vnccs/character_styles/delete",
    {},
    { style: id }
  );
  if (data?.deleted !== true || data.style_id !== id) {
    throw new Error("Invalid style deletion response");
  }
}

/** Add or replace a user style in the "My styles" group, creating the group when needed. */
export function upsertUserStyle(
  catalog: StyleCatalog,
  style: CharacterStyle
): StyleCatalog {
  const stored = { ...style, user: true };
  const groups = catalog.groups.map((group) => ({
    ...group,
    styles: group.styles.filter((item) => item.id !== style.id),
  }));
  const mine = groups.find((group) => group.label === USER_STYLE_GROUP);
  if (mine) {
    mine.styles.push(stored);
  } else {
    groups.push({ label: USER_STYLE_GROUP, styles: [stored] });
  }
  return { ...catalog, groups };
}

/** Drop a style; an emptied "My styles" group goes too. */
export function removeStyle(catalog: StyleCatalog, id: string): StyleCatalog {
  return {
    ...catalog,
    groups: catalog.groups
      .map((group) => ({
        ...group,
        styles: group.styles.filter((style) => style.id !== id),
      }))
      .filter(
        (group) => group.label !== USER_STYLE_GROUP || group.styles.length > 0
      ),
  };
}

export function setStyleImage(
  catalog: StyleCatalog,
  id: string,
  image: string
): StyleCatalog {
  if (id === CUSTOM_STYLE_ID) {
    return { ...catalog, custom_preview: image };
  }
  return {
    ...catalog,
    groups: catalog.groups.map((group) => ({
      ...group,
      styles: group.styles.map((style) =>
        style.id === id ? { ...style, image } : style
      ),
    })),
  };
}

export type LibraryStyle = CharacterStyle & { group: string };

/**
 * The grid: the Custom card first, then every style of the chosen group whose
 * label, description or reference contains the query.
 */
export function filterStyles(
  catalog: StyleCatalog,
  query: string,
  group: string
): LibraryStyle[] {
  const needle = query.trim().toLowerCase();
  return [{ ...customStyle(catalog), group: "" }, ...allStyles(catalog)].filter(
    (style) =>
      (!group || style.group === group) &&
      [style.label, style.description, style.reference]
        .join(" ")
        .toLowerCase()
        .includes(needle)
  );
}

export interface StylePreviewSource {
  character_info: object;
  gen_settings: object;
}

export interface StylePreviewRequest extends StylePreviewSource {
  node_id: string;
  request_id: string;
  style_id: string;
}

/**
 * A preview renders with seed 0 and no per-family profiles, so every style is
 * compared on the same portrait. The payload is copied so later edits to the
 * Creator cannot change a render in flight.
 */
export function stylePreviewRequest(
  styleId: string,
  source: StylePreviewSource,
  nodeId: string,
  requestId: string
): StylePreviewRequest {
  const copy = structuredClone(source);
  return {
    character_info: copy.character_info,
    gen_settings: {
      ...copy.gen_settings,
      seed: 0,
      seed_mode: "fixed",
      mode_settings: {},
    },
    node_id: nodeId,
    request_id: requestId,
    style_id: styleId,
  };
}

export interface StylePreviewImage {
  height: number;
  image: string;
  width: number;
}

/** Render and save one style preview; the server samples in-process, outside the queue. */
export async function generateStylePreview(
  http: VnccsHttp,
  request: StylePreviewRequest
): Promise<StylePreviewImage> {
  const data = await http.post<{
    height?: number;
    image?: string;
    saved?: boolean;
    style_id?: string;
    width?: number;
  }>("/vnccs/character_styles/preview", request);
  if (data?.saved !== true) {
    throw new Error("Server did not confirm saving the WebP file to disk");
  }
  if (
    data.style_id !== request.style_id ||
    !data.image?.startsWith(PREVIEW_ROUTE)
  ) {
    throw new Error("Invalid style preview response");
  }
  return {
    image: data.image,
    width: Number(data.width) || 0,
    height: Number(data.height) || 0,
  };
}

export type StylePreviewStage = "queued" | "running" | "done" | "error";

/** The `vnccs.style_preview.stage` event's status, when it belongs to this render. */
export function stylePreviewStage(
  detail: unknown,
  nodeId: string,
  requestId: string
): StylePreviewStage | null {
  const event = detail as {
    node_id?: unknown;
    request_id?: unknown;
    status?: unknown;
  } | null;
  if (
    String(event?.node_id ?? "") !== nodeId ||
    event?.request_id !== requestId
  ) {
    return null;
  }
  const status = event.status;
  return status === "queued" ||
    status === "running" ||
    status === "done" ||
    status === "error"
    ? status
    : null;
}

export function stylePreviewMessage(
  stage: StylePreviewStage,
  label: string
): string {
  switch (stage) {
    case "queued":
      return `Queued: ${label}`;
    case "running":
      return `Rendering: ${label}`;
    case "done":
      return `Saved: ${label}`;
    default:
      return `Preview failed: ${label}`;
  }
}
