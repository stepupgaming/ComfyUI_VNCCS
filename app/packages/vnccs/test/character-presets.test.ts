import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type PresetCatalog,
  type PresetItem,
  presetGroups,
  presetSelection,
  type TraitField,
} from "../src/character-presets";
import { defaultCharacterInfo } from "../src/creator-state";

/** Ported from tests/character_presets.test.mjs against the shipped catalog. */
const catalog = JSON.parse(
  readFileSync(
    new URL(
      "../../../../character_template/character_presets_v2.json",
      import.meta.url
    ),
    "utf8"
  )
) as Required<PresetCatalog>;
const tags = catalog.tags;

function item(category: string, match: (item: PresetItem) => boolean) {
  const found = tags[category]?.find(match);
  if (!found) {
    throw new Error(`No preset in ${category}`);
  }
  return found;
}

describe("character presets", () => {
  it("assigns every catalog category to exactly one form field", () => {
    const fields: TraitField[] = [
      "race",
      "skin_color",
      "body",
      "face",
      "hair",
      "eyes",
      "additional_details",
    ];
    const visible = fields.flatMap((field) =>
      presetGroups(catalog, field).flatMap((group) => group.items)
    );
    expect(visible.length).toBe(Object.values(tags).flat().length);
    expect(new Set(visible).size).toBe(visible.length);
    expect(presetGroups(catalog, "race").length).toBe(
      new Set(tags.races?.map((entry) => entry.group)).size
    );
    expect(presetGroups(catalog, "unknown" as TraitField)).toEqual([]);
  });

  it("preselects one species from legacy aliases and keeps custom text", () => {
    const groups = presetGroups(catalog, "race");
    const selection = presetSelection(
      "cat_girl, CAT BOY, My Custom Species, no tail",
      groups
    );
    const cat = item("races", (entry) => entry.tag === "catfolk");
    expect(selection.has(cat)).toBe(true);
    expect(selection.value()).toBe("cat_girl, My Custom Species, no tail");
    selection.toggle(cat);
    expect(selection.value()).toBe("My Custom Species, no tail");
    selection.toggle(cat);
    expect(selection.value()).toBe("My Custom Species, no tail, catfolk");
    const restored = presetSelection(selection.value(), groups);
    expect(restored.has(cat)).toBe(true);
    expect(restored.value()).toBe(selection.value());
  });

  it("keeps breast tag insertion and the legacy spelling", () => {
    const groups = presetGroups(catalog, "body");
    for (const entry of tags.breast_size ?? []) {
      const selection = presetSelection("", groups);
      selection.toggle(entry);
      expect(selection.value()).toBe(entry.tag.replaceAll("_", " "));
      const restored = presetSelection(entry.tag, groups);
      expect(restored.has(entry)).toBe(true);
      expect(restored.value()).toBe(entry.tag);
    }
  });

  it("lets hybrid races coexist without serializing descriptions", () => {
    const selection = presetSelection("", presetGroups(catalog, "race"));
    for (const key of ["elf", "dragonkin"]) {
      selection.toggle(item("races", (entry) => entry.tag === key));
    }
    expect(selection.value()).toBe("elf, dragonkin");
  });

  it("selects hair patterns once and keeps face presets out of the eye picker", () => {
    const selection = presetSelection(
      "drill_hair, drills, Silver Hair",
      presetGroups(catalog, "hair")
    );
    expect(selection.value()).toBe("drill_hair, Silver Hair");
    const eyes = presetGroups(catalog, "eyes").flatMap((group) => group.items);
    expect(eyes.some((entry) => entry.tag === "oval face")).toBe(false);
  });

  it("selects both traits of the legacy default hair without rewriting it", () => {
    const groups = presetGroups(catalog, "hair");
    const black = item("hair_color", (entry) => entry.tag === "black hair");
    const long = item(
      "hair_length",
      (entry) => entry.synonyms?.includes("long_hair") ?? false
    );
    const selection = presetSelection(
      "black long hair, My Custom Trait",
      groups
    );
    expect(selection.has(black)).toBe(true);
    expect(selection.has(long)).toBe(true);
    expect(selection.value()).toBe("black long hair, My Custom Trait");
    selection.toggle(black);
    expect(selection.has(black)).toBe(false);
    expect(selection.has(long)).toBe(true);
    expect(selection.value()).toBe(`My Custom Trait, ${long.tag}`);
    selection.toggle(long);
    expect(selection.value()).toBe("My Custom Trait");
    selection.toggle(black);
    expect(selection.value()).toBe("My Custom Trait, black hair");
    expect(
      presetSelection("a black long hair ornament", groups).has(black)
    ).toBe(false);
  });

  it("resolves new character defaults and eye colours to active presets", () => {
    const hair = defaultCharacterInfo("custom").hair;
    expect(hair).toBe("black hair, waist-length hair");
    const selection = presetSelection(hair, presetGroups(catalog, "hair"));
    for (const token of hair.split(", ")) {
      const match = [
        ...(tags.hair_color ?? []),
        ...(tags.hair_length ?? []),
      ].find((entry) => entry.tag === token);
      expect(match, token).toBeDefined();
      expect(selection.has(match as PresetItem)).toBe(true);
    }
    for (const [field, value, category] of [
      ["race", "human", "races"],
      ["face", "freckles", "face_details"],
      ["body", "medium breasts", "breast_size"],
      ["eyes", "blue eyes", "eye_color"],
    ] as const) {
      const picked = presetSelection(value, presetGroups(catalog, field));
      expect(
        (tags[category] ?? []).filter((entry) => picked.has(entry)).length
      ).toBe(1);
      expect(picked.value()).toBe(value);
    }
    const eyes = presetSelection("", presetGroups(catalog, "eyes"));
    eyes.toggle(item("eye_color", (entry) => entry.label === "Blue"));
    expect(eyes.value()).toBe("blue eyes");
  });
});
