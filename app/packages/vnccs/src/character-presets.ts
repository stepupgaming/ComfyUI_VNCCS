import type { VnccsHttp } from "./http";

/** One chip in the Creator's preset picker (`/vnccs/get_tags?catalog=creator_v2`). */
export interface PresetItem {
  group?: string;
  label?: string;
  prompt?: string;
  synonyms?: string[];
  tag: string;
}

export interface PresetCatalog {
  tags?: Record<string, PresetItem[]>;
}

export interface PresetGroup {
  header: string;
  items: PresetItem[];
}

export type TraitField =
  | "race"
  | "skin_color"
  | "body"
  | "face"
  | "hair"
  | "eyes"
  | "additional_details";

const FIELD_CATEGORIES: Record<TraitField, string[]> = {
  race: ["races"],
  skin_color: ["skin_color"],
  body: ["body_type", "breast_size"],
  face: ["face_shape", "face_details"],
  hair: [
    "hair_color",
    "hair_pattern",
    "hair_length",
    "hair_texture",
    "hairstyles",
    "hair_framing",
  ],
  eyes: ["eye_color", "eye_features"],
  additional_details: ["details"],
};

export function fetchPresetCatalog(http: VnccsHttp): Promise<PresetCatalog> {
  return http.get<PresetCatalog>("/vnccs/get_tags", { catalog: "creator_v2" });
}

export function presetGroups(
  catalog: PresetCatalog | null | undefined,
  field: TraitField
): PresetGroup[] {
  const groups: PresetGroup[] = [];
  for (const category of FIELD_CATEGORIES[field] ?? []) {
    const byGroup = new Map<string, PresetItem[]>();
    for (const item of catalog?.tags?.[category] ?? []) {
      const header = item.group || category.replaceAll("_", " ");
      let items = byGroup.get(header);
      if (!items) {
        items = [];
        byGroup.set(header, items);
      }
      items.push(item);
    }
    for (const [header, items] of byGroup) {
      groups.push({ header, items });
    }
  }
  return groups;
}

const WHITESPACE = /\s+/g;

function presetKey(value: string): string {
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .trim()
    .replace(WHITESPACE, " ");
}

export interface PresetSelection {
  has: (item: PresetItem) => boolean;
  toggle: (item: PresetItem) => void;
  value: () => string;
}

/**
 * Selection state over a comma-separated trait field. Tokens match presets by
 * tag, label or synonym; anything else is kept as custom text.
 */
export function presetSelection(
  value: string | null | undefined,
  groups: PresetGroup[]
): PresetSelection {
  const aliases = new Map<string, string>();
  for (const { items } of groups) {
    for (const item of items) {
      for (const alias of [item.tag, item.label, ...(item.synonyms ?? [])]) {
        if (alias !== undefined) {
          aliases.set(presetKey(alias), presetKey(item.tag));
        }
      }
    }
  }
  // Preserve custom text and legacy spelling until the user toggles that choice.
  const selected = new Map<string, string>();
  for (const token of String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)) {
    const key = aliases.get(presetKey(token)) || presetKey(token);
    if (!selected.has(key)) {
      selected.set(key, token);
    }
  }
  // The old creation route stored both default hair traits in one token.
  const legacyHair = [
    aliases.get("black hair"),
    aliases.get("long hair"),
  ].filter((key): key is string => Boolean(key));
  const hasLegacyHair = (key: string) =>
    legacyHair.length === 2 &&
    selected.has("black long hair") &&
    legacyHair.includes(key);
  return {
    has: (item) =>
      selected.has(presetKey(item.tag)) || hasLegacyHair(presetKey(item.tag)),
    toggle(item) {
      const key = presetKey(item.tag);
      if (hasLegacyHair(key)) {
        selected.delete("black long hair");
        for (const trait of legacyHair) {
          if (!selected.has(trait)) {
            selected.set(trait, trait);
          }
        }
      }
      if (selected.has(key)) {
        selected.delete(key);
      } else {
        selected.set(key, item.tag.replaceAll("_", " "));
      }
    },
    value: () => Array.from(selected.values()).join(", "),
  };
}
