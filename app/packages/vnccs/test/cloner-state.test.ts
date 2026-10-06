import { describe, expect, it } from "vitest";
import {
  ALPHA_DISABLED_TITLE,
  type ClonerContext,
  type ClonerModel,
  type ClonerState,
  clonerModelKind,
  clonerQueueProblem,
  defaultClonerState,
  initializeClonerState,
  normalizeAge,
  normalizeBackground,
  parseClonerState,
  serializeClonerState,
  sourceKey,
  updateClonerState,
  viewClonerState,
} from "../src/cloner-state";
import { emptySpritePreview } from "../src/sprite-preview";
import {
  nodeOfType,
  readLegacyWorkflow,
  widgetValues,
} from "./legacy-workflow";

const ctx = (modelKind: string): ClonerContext => ({ modelKind });

function load(saved: unknown, kind = "qi2"): ClonerState {
  const { state } = parseClonerState(JSON.stringify(saved));
  return initializeClonerState(state, ctx(kind));
}

function save(
  state: ClonerState,
  mutate: (model: ClonerModel) => void,
  kind = "qi2"
): ClonerState {
  return updateClonerState(state, ctx(kind), mutate);
}

/** A state on Blue that remembers Blue, like the legacy harness' setup(). */
function blue(kind: string): ClonerState {
  return load(
    {
      character: "Alice",
      character_info: { name: "Alice", background_color: "Blue" },
      previous_background_color: "Blue",
    },
    kind
  );
}

describe("cloner widget_data", () => {
  it("emits the legacy defaults for a fresh node", () => {
    expect(
      JSON.parse(
        serializeClonerState(
          initializeClonerState(defaultClonerState(), ctx(""))
        )
      )
    ).toEqual({
      character: "",
      source_images: [],
      source_images_character: "",
      selected_preview_sprite: null,
      selected_idx: 0,
      char_preview_url: null,
      previous_background_color: "Green",
      character_info: {
        sex: "female",
        age: 18,
        race: "human",
        skin_color: "",
        hair: "",
        eyes: "",
        face: "",
        body: "",
        additional_details: "",
        nsfw: false,
        aesthetics: "masterpiece, best quality",
        negative_prompt: "bad quality, worst quality",
        lora_prompt: "",
        background_color: "Green",
      },
    });
  });

  it("migrates the reference owner and the remembered background", () => {
    const { state } = parseClonerState(
      JSON.stringify({ character: "Alice", source_images: ["old.png"] })
    );
    expect(state.source_images_character).toBe("Alice");
    expect(state.previous_background_color).toBe("Green");
    const explicit = parseClonerState(
      JSON.stringify({
        character: "Alice",
        source_images: ["old.png"],
        source_images_character: "",
        previous_background_color: "Blue",
      })
    ).state;
    expect(explicit.source_images_character).toBe("");
    expect(explicit.previous_background_color).toBe("Blue");
  });

  it("ignores empty, invalid or non-object saved data", () => {
    for (const raw of [null, "", "{}", "not json", "[1]"]) {
      const { state, restoredInfoCharacter } = parseClonerState(raw);
      expect(state).toEqual(defaultClonerState());
      expect(restoredInfoCharacter).toBeNull();
    }
  });

  it("trusts saved character_info only when it names the saved character", () => {
    const owned = parseClonerState({
      character: "Alice",
      character_info: { name: "Alice", hair: "silver hair" },
    });
    expect(owned.restoredInfoCharacter).toBe("Alice");
    expect(owned.state.character_info.hair).toBe("silver hair");
    for (const info of [{ hair: "x" }, { name: "Bob", hair: "x" }]) {
      const other = parseClonerState({
        character: "Alice",
        character_info: info,
      });
      expect(other.restoredInfoCharacter).toBeNull();
      expect(other.state.character_info.hair).toBe("");
    }
  });

  it("refetches the shipped workflow's mismatched metadata instead of forwarding it", () => {
    const workflow = readLegacyWorkflow("VNCCS_3.2_Step1_CharacterCloner.json");
    const raw = widgetValues(nodeOfType(workflow, "CharacterCloner"))
      .widget_data as string;
    const { state, restoredInfoCharacter } = parseClonerState(raw);
    expect(JSON.parse(raw).character_info.name).toBe("Clone");
    expect(state.character).toBe("H3-Chan");
    expect(restoredInfoCharacter).toBeNull();
    expect(state.character_info.name).toBeUndefined();
    // Restored sprites are reloaded by the navigator, not trusted.
    expect(state.selected_preview_sprite).toBeNull();
    expect(state.char_preview_url).toBeNull();
  });

  it("replaces character_info with defaults plus the loaded metadata", () => {
    const state = load({
      character: "Alice",
      character_info: { name: "Alice", hair: "old", extra: "only Alice" },
    });
    const next = save(state, (model) =>
      model.loadCharacterInfo("Bob", {
        hair: "Bob hair",
        background_color: "blue",
      })
    );
    expect(next.character).toBe("Bob");
    expect(next.character_info.name).toBe("Bob");
    expect(next.character_info.hair).toBe("Bob hair");
    expect(next.character_info.extra).toBeUndefined();
    expect(next.character_info.background_color).toBe("Blue");
    const none = save(next, (model) => model.loadCharacterInfo(""));
    expect(none.character_info).toMatchObject({ name: "", hair: "", age: 18 });
  });

  it("keeps free-form trait text as typed", () => {
    const next = save(load({}), (model) =>
      model.setTrait("hair", "  White Hair, My Custom Hair  ")
    );
    expect(next.character_info.hair).toBe("  White Hair, My Custom Hair  ");
  });

  it("clamps the age and accepts only male or female", () => {
    expect(normalizeAge("abc")).toBe(18);
    expect(normalizeAge(0)).toBe(1);
    expect(normalizeAge(140)).toBe(100);
    expect(normalizeAge("25.5")).toBe(25.5);
    let state = save(load({}), (model) => model.setAge(250));
    expect(state.character_info.age).toBe(100);
    state = save(state, (model) => model.setSex("MALE"));
    expect(state.character_info.sex).toBe("male");
    state = save(state, (model) => model.setSex("other"));
    expect(state.character_info.sex).toBe("male");
    expect(load({ character_info: {} }).character_info.age).toBe(18);
  });
});

describe("cloner background", () => {
  it("normalizes saved spellings", () => {
    expect(normalizeBackground("alpha")).toBe("Transparent");
    expect(normalizeBackground(" TRANSPARENT ")).toBe("Transparent");
    expect(normalizeBackground("blue")).toBe("Blue");
    expect(normalizeBackground("White")).toBe("Green");
    expect(normalizeBackground(undefined)).toBe("Green");
    expect(clonerModelKind({ active_kind: " QI2 " })).toBe("qi2");
    expect(clonerModelKind({})).toBe("");
    expect(clonerModelKind(null)).toBe("");
  });

  it("only QI2 permits Alpha", () => {
    for (const kind of ["anima", "illustrious", "", "qi2"]) {
      const state = blue(kind);
      const model = viewClonerState(state, ctx(kind));
      expect(model.alphaAllowed()).toBe(kind === "qi2");
      const next = save(state, (m) => m.chooseBackground("Transparent"), kind);
      expect(next.character_info.background_color).toBe(
        kind === "qi2" ? "Transparent" : "Blue"
      );
    }
    expect(ALPHA_DISABLED_TITLE).toContain("requires Qwen Image 2.1");
  });

  it("model changes restore the last solid color", () => {
    let state = save(blue("qi2"), (m) => m.chooseBackground("Transparent"));
    expect(state.character_info.background_color).toBe("Transparent");
    expect(state.previous_background_color).toBe("Blue");
    state = save(state, () => undefined, "anima");
    expect(state.character_info.background_color).toBe("Blue");
    state = save(state, (m) => m.chooseBackground("Green"), "qi2");
    state = save(state, (m) => m.chooseBackground("Transparent"), "qi2");
    state = save(state, () => undefined, "illustrious");
    expect(state.character_info.background_color).toBe("Green");
  });

  it("never selects Alpha on its own", () => {
    const state = save(blue("anima"), () => undefined, "qi2");
    expect(state.character_info.background_color).toBe("Blue");
  });

  it("keeps a restored Alpha while the Control Center kind is unknown", () => {
    const saved = {
      character: "Clone",
      character_info: { name: "Clone", background_color: "alpha" },
      previous_background_color: "Blue",
    };
    let state = load(saved, "");
    expect(state.character_info.background_color).toBe("Transparent");
    state = save(state, () => undefined, "");
    expect(state.character_info.background_color).toBe("Transparent");
    state = save(state, () => undefined, "qi2");
    expect(state.character_info.background_color).toBe("Transparent");
    const restored = load(JSON.parse(serializeClonerState(state)), "qi2");
    expect(restored.character_info.background_color).toBe("Transparent");
    expect(restored.previous_background_color).toBe("Blue");
    const solid = save(restored, (m) => m.chooseBackground("Blue"));
    expect(solid.character_info.background_color).toBe("Blue");
  });

  it("rejects a saved Alpha once a non-QI2 kind is known", () => {
    for (const background of ["Transparent", "Alpha"]) {
      const state = load(
        {
          character: "Alice",
          character_info: { name: "Alice", background_color: background },
          previous_background_color: "Blue",
        },
        "anima"
      );
      expect(state.character_info.background_color).toBe("Blue");
    }
    const fallback = load(
      {
        character_info: { background_color: "Transparent" },
        previous_background_color: "Red",
      },
      "anima"
    );
    expect(fallback.character_info.background_color).toBe("Green");
  });
});

describe("cloner reference image", () => {
  const ref = { name: "upload-1.png", type: "input", subfolder: "" };

  it("an upload replaces the reference and stamps its character", () => {
    const state = load({
      character: "Alice",
      character_info: { name: "Alice" },
      source_images: ["old.png"],
      selected_idx: 3,
    });
    expect(state.selected_idx).toBe(0);
    const next = save(state, (m) => m.setUploadedSource(ref));
    expect(next.source_images).toEqual([ref]);
    expect(next.selected_idx).toBe(0);
    expect(next.source_images_character).toBe("Alice");
    expect(viewClonerState(next, ctx("qi2")).selectedSource()).toEqual(ref);
  });

  it("reads legacy string references", () => {
    const state = load({ source_images: ["old.png"] });
    expect(viewClonerState(state, ctx("qi2")).selectedSource()).toEqual({
      name: "old.png",
      type: "input",
      subfolder: "",
    });
  });

  it("removing or clearing keeps the selection in range", () => {
    let state = load({
      character: "Alice",
      source_images: ["a.png", "b.png"],
      selected_idx: 1,
    });
    state = save(state, (m) => m.removeSource(1));
    expect(state.source_images).toEqual(["a.png"]);
    expect(state.selected_idx).toBe(0);
    state = save(state, (m) => {
      m.setPreviewSprite("url", {
        ...emptySpritePreview(),
        character: "Alice",
        count: 2,
        index: 1,
      });
    });
    expect(state.selected_preview_sprite).toEqual({
      character: "Alice",
      costume: "",
      index: 1,
      count: 2,
    });
    state = save(state, (m) => m.clearSources());
    expect(state).toMatchObject({
      source_images: [],
      selected_idx: 0,
      source_images_character: "Alice",
      char_preview_url: null,
      selected_preview_sprite: null,
    });
  });

  it("identifies the reference for stale-reply checks", () => {
    const state = load({ source_images: ["a.png"] });
    expect(sourceKey(state)).toBe(
      sourceKey(save(state, (m) => m.setTrait("hair", "x")))
    );
    expect(sourceKey(state)).not.toBe(
      sourceKey(save(state, (m) => m.setUploadedSource(ref)))
    );
  });

  it("requires a character and exactly one reference before queueing", () => {
    expect(clonerQueueProblem(load({}))?.title).toBe("No character");
    expect(clonerQueueProblem(load({ character: "Alice" }))?.title).toBe(
      "Source Image Required"
    );
    expect(
      clonerQueueProblem(
        load({ character: "Alice", source_images: ["a.png", "b.png"] })
      )?.title
    ).toBe("One Image Only");
    expect(
      clonerQueueProblem(load({ character: "Alice", source_images: [ref] }))
    ).toBeNull();
  });
});

describe("cloner analysis", () => {
  it("merges the reply into the character fields", () => {
    const state = load({
      character: "Alice",
      character_info: { name: "Alice", lora_prompt: "keep" },
    });
    const next = save(state, (m) =>
      m.applyAnalysis({
        sex: "Female",
        age: "24",
        hair: "blue hair, long hair",
        eyes: ["blue eyes", "tsurime"],
        face: "freckles",
        skin_color: null,
        aesthetics: "anime style",
        nsfw: "false",
        name: "Someone else",
        extra_key: 1,
      })
    );
    expect(next.character_info).toMatchObject({
      name: "Alice",
      sex: "female",
      age: 24,
      hair: "blue hair, long hair",
      eyes: "blue eyes, tsurime",
      face: "freckles",
      skin_color: "",
      aesthetics: "anime style",
      nsfw: false,
      lora_prompt: "keep",
      extra_key: 1,
    });
    const male = save(next, (m) =>
      m.applyAnalysis({ sex: "MALE", nsfw: true })
    );
    expect(male.character_info.sex).toBe("male");
    expect(male.character_info.nsfw).toBe(true);
  });
});
