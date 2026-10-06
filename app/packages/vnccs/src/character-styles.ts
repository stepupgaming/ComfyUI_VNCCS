import type { VnccsHttp } from "./http";

export interface CharacterStyle {
  description?: string;
  id: string;
  /** Server-relative preview URL. */
  image?: string;
  label: string;
  prompt?: string;
  reference?: string;
  /** Set by the server on styles from the user library. */
  user?: boolean;
}

export interface StyleGroup {
  label: string;
  styles: CharacterStyle[];
}

export interface StyleCatalog {
  aliases?: Record<string, string>;
  custom_preview?: string;
  default_style?: string;
  groups: StyleGroup[];
  preview_directory?: string;
}

export const CUSTOM_STYLE_ID = "custom";

/** What a character's widget data records about its style. */
export interface StyleFields {
  custom_style?: string;
  style?: string;
  style_description?: string;
  style_label?: string;
  style_prompt?: string;
  style_reference?: string;
}

export const EMPTY_STYLE_CATALOG: StyleCatalog = {
  default_style: CUSTOM_STYLE_ID,
  aliases: {},
  groups: [],
};

export async function fetchStyleCatalog(
  http: VnccsHttp
): Promise<StyleCatalog> {
  const catalog = await http.get<StyleCatalog>("/vnccs/character_styles");
  if (!Array.isArray(catalog.groups)) {
    throw new Error("Style catalog has no groups");
  }
  return catalog;
}

export function customStyle(catalog: StyleCatalog): CharacterStyle {
  return {
    id: CUSTOM_STYLE_ID,
    label: "Custom style",
    description: "Describe your own visual style",
    reference: "Your prompt",
    image: catalog.custom_preview || "",
  };
}

export function defaultStyleId(catalog: StyleCatalog): string {
  return catalog.default_style || CUSTOM_STYLE_ID;
}

export function allStyles(
  catalog: StyleCatalog
): (CharacterStyle & { group: string })[] {
  return catalog.groups.flatMap((group) =>
    group.styles.map((style) => ({ ...style, group: group.label }))
  );
}

export function resolveStyleId(
  catalog: StyleCatalog,
  value: string | null | undefined
): string {
  return (
    (value ? catalog.aliases?.[value] : undefined) ||
    value ||
    defaultStyleId(catalog)
  );
}

export function findStyle(
  catalog: StyleCatalog,
  id: string
): CharacterStyle | undefined {
  return id === CUSTOM_STYLE_ID
    ? customStyle(catalog)
    : allStyles(catalog).find((style) => style.id === id);
}

export interface StyleSummary {
  description: string;
  image: string;
  label: string;
  reference: string;
}

/** The style card text; falls back to the copy saved in widget data when the library lacks the style. */
export function styleSummary(
  catalog: StyleCatalog,
  fields: StyleFields
): StyleSummary {
  const style = findStyle(catalog, resolveStyleId(catalog, fields.style));
  return {
    label: style?.label || fields.style_label || "Unavailable style",
    description:
      style?.description ||
      fields.style_description ||
      "Saved style; restore its library to edit it",
    reference: style?.reference || fields.style_reference || "Not specified",
    image: style?.image || "",
  };
}

/**
 * Select a style and copy its text into the character, so a workflow keeps
 * rendering it even after the style leaves the library.
 */
export function applyStyle<T extends StyleFields>(
  catalog: StyleCatalog,
  fields: T,
  value: string
): T {
  const id = resolveStyleId(catalog, value);
  const style = findStyle(catalog, id);
  return {
    ...fields,
    style: id,
    style_prompt: style?.prompt || "",
    style_label: style?.label || "",
    style_description: style?.description || "",
    style_reference: style?.reference || "",
  };
}

/** Preview images are only trusted from the style preview route. */
export function stylePreviewPath(style: { image?: string }): string | null {
  return style.image?.startsWith("/vnccs/character_styles/preview?")
    ? style.image
    : null;
}
