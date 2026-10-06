import { describe, expect, it } from "vitest";
import {
  autoTargetSize,
  type ClothesContext,
  type ClothesModel,
  type ClothesState,
  clothesContext,
  defaultClothesState,
  displayCostumes,
  initializeClothesState,
  isClothesCoreLora,
  isEditableCostume,
  MISSING_CLOTHES_CORE_HINT,
  normalizeCharacterAge,
  normalizeLoraPath,
  parseClothesState,
  serializeClothesState,
  updateClothesState,
  viewClothesState,
} from "../src/clothes-state";
import type { CatalogEntry } from "../src/control-center";

/** The Clothes Core rows of the live Control Center catalog. */
const CORE_LORAS: CatalogEntry[] = [
  {
    name: "VNCCS Clothes Core Klein9b",
    kind: "Klein9b",
    type: "Helper",
    local_path: "models/loras/Klein9b/VNCCS_ClothesCoreKlein9b_V1.safetensors",
    status: "missing",
  },
  {
    name: "VNCCS Clothes Core MiniMaxH3",
    kind: "minimaxh3",
    type: "Helper",
    local_path:
      "models/loras/MiniMaxH3/VNCCS/VNCCS_ClothesCoreMiniMaxH3V1.safetensors",
    status: "installed",
  },
  {
    name: "VNCCS Clothes Core QI2",
    kind: "QI2",
    type: "Helper",
    local_path:
      "models/loras/QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors",
    status: "installed",
  },
  {
    name: "Viggle Turbo",
    kind: "QI2",
    type: "TurboLora",
    local_path: "models/loras/QI2/Viggle/turbo.safetensors",
  },
];

function context(kind = "QI2", loras = CORE_LORAS): ClothesContext {
  return { kind, loras };
}

function apply(
  state: ClothesState,
  mutate: (model: ClothesModel) => void,
  ctx: ClothesContext = context()
): ClothesState {
  return updateClothesState(state, ctx, mutate);
}

describe("clothes widget data", () => {
  it("starts from the widget's defaults", () => {
    expect(parseClothesState(null)).toEqual({
      character: "",
      costume: "Naked",
      activeTab: "generate",
      clone_image: null,
      selected_preview_sprite: null,
      costume_info: { top: "", bottom: "", head: "", face: "", shoes: "" },
      character_info: { sex: "female", age: 18 },
      gen_settings: {
        background_color: "Green",
        background_model_kind: "",
        previous_background_color: "Green",
        target_size: null,
        seed: 0,
        seed_mode: "fixed",
        lora_name: "none",
        lora_strength: 1,
      },
    });
    expect(parseClothesState("not json")).toEqual(defaultClothesState());
  });

  it("merges saved sections one level deep and keeps unknown keys", () => {
    const state = parseClothesState(
      JSON.stringify({
        character: "Alice",
        costume: "Dress",
        legacy_flag: 7,
        costume_info: { top: "silk", extra: "kept" },
        character_info: { age: 30, hair: "red" },
        gen_settings: { seed: 99, sampler: "euler" },
        selected_preview_sprite: { filename: "old.png" },
      })
    );
    expect(state.legacy_flag).toBe(7);
    expect(state.costume_info).toEqual({
      top: "silk",
      bottom: "",
      head: "",
      face: "",
      shoes: "",
      extra: "kept",
    });
    expect(state.character_info).toEqual({
      sex: "female",
      age: 30,
      hair: "red",
    });
    expect(state.gen_settings.seed).toBe(99);
    expect(state.gen_settings.sampler).toBe("euler");
    expect(state.gen_settings.background_color).toBe("Green");
    expect(state.selected_preview_sprite).toEqual({ filename: "old.png" });
    expect(JSON.parse(serializeClothesState(state)).legacy_flag).toBe(7);
  });

  it("restores the clone tab and its donor image", () => {
    const state = parseClothesState({
      activeTab: "clone",
      clone_image: { name: "donor.png", type: "input", subfolder: "clothes" },
    });
    expect(state.activeTab).toBe("clone");
    expect(state.clone_image).toEqual({
      name: "donor.png",
      type: "input",
      subfolder: "clothes",
    });
    expect(parseClothesState({ activeTab: "other" }).activeTab).toBe(
      "generate"
    );
  });

  it("snaps restored sizes onto the slider and keeps Auto", () => {
    const size = (target_size: unknown) =>
      parseClothesState({ gen_settings: { target_size } }).gen_settings
        .target_size;
    expect(size(512)).toBe(1024);
    expect(size(1408)).toBe(1434);
    expect(size(1536)).toBe(1536);
    expect(size(2048)).toBe(2048);
    expect(size(null)).toBeNull();
  });
});

describe("clothes background", () => {
  it("forces alpha for Qwen Image 2.1 once and restores the chroma key after", () => {
    let state = parseClothesState({
      gen_settings: { background_color: "Blue" },
    });
    state = initializeClothesState(state, context("QI2"));
    expect(state.gen_settings.background_color).toBe("Transparent");
    expect(state.gen_settings.previous_background_color).toBe("Blue");
    expect(state.gen_settings.background_model_kind).toBe("qi2");
    state = initializeClothesState(state, context("MiniMaxH3"));
    expect(state.gen_settings.background_color).toBe("Blue");
    expect(state.gen_settings.background_model_kind).toBe("minimaxh3");
  });

  it("falls back to Green when the remembered color is not a chroma key", () => {
    const state = initializeClothesState(
      parseClothesState({
        gen_settings: {
          background_color: "Transparent",
          background_model_kind: "qi2",
          previous_background_color: "Purple",
        },
      }),
      context("Klein9b")
    );
    expect(state.gen_settings.background_color).toBe("Green");
  });

  it("keeps background clicks after a later sync of the same model", () => {
    for (const background of ["Blue", "Green", "Transparent"]) {
      let state = parseClothesState({
        gen_settings: {
          background_color: "Transparent",
          background_model_kind: "qi2",
        },
      });
      state = apply(state, (model) => model.setBackground(background));
      expect(state.gen_settings.background_color).toBe(background);
      state = initializeClothesState(state, context("QI2"));
      expect(state.gen_settings.background_color).toBe(background);
    }
  });

  it("remembers chroma clicks under Qwen Image 2.1 only", () => {
    const base = defaultClothesState();
    const qi2 = apply(base, (model) => model.setBackground("blue"));
    expect(qi2.gen_settings.background_color).toBe("Blue");
    expect(qi2.gen_settings.previous_background_color).toBe("Blue");
    const h3 = apply(
      base,
      (model) => model.setBackground("Blue"),
      context("MiniMaxH3")
    );
    expect(h3.gen_settings.previous_background_color).toBe("Green");
  });

  it("does nothing without a connected model", () => {
    const state = initializeClothesState(defaultClothesState(), context(""));
    expect(state.gen_settings.background_model_kind).toBe("");
    expect(state.gen_settings.background_color).toBe("Green");
  });
});

describe("clothes resolution and seed", () => {
  it("follows the model in Auto and keeps a manual size", () => {
    const auto = defaultClothesState();
    expect(viewClothesState(auto, context("QI2")).resolution()).toEqual({
      auto: true,
      size: 1024,
      label: "1.0 MP · Auto",
    });
    expect(viewClothesState(auto, context("MiniMaxH3")).resolution()).toEqual({
      auto: true,
      size: 1536,
      label: "1.5 MP · Auto",
    });
    const manual = apply(auto, (model) => model.setTargetSize(1408));
    for (const kind of ["MiniMaxH3", "Klein9b"]) {
      const view = viewClothesState(manual, context(kind));
      expect(view.resolution().label).toBe("1.4 MP");
      expect(
        initializeClothesState(manual, context(kind)).gen_settings.target_size
      ).toBe(1408);
    }
    expect(autoTargetSize("H3")).toBe(1536);
    expect(autoTargetSize("mini-max h3")).toBe(1536);
    expect(autoTargetSize("")).toBe(1024);
  });

  it("toggles the dice and randomizes only in random mode", () => {
    const fixed = apply(defaultClothesState(), (model) => model.setSeed(42));
    expect(
      viewClothesState(fixed, context()).randomizeSeedIfNeeded(() => 0.5)
    ).toBe(false);
    const random = apply(fixed, (model) => model.toggleSeedMode());
    expect(random.gen_settings.seed_mode).toBe("randomize");
    const rolled = apply(random, (model) =>
      model.randomizeSeedIfNeeded(() => 0.5)
    );
    expect(rolled.gen_settings.seed).toBe(5_000_000_000_000);
    expect(
      apply(rolled, (model) => model.toggleSeedMode()).gen_settings.seed_mode
    ).toBe("fixed");
  });
});

describe("clothes core lora", () => {
  it("recognizes Clothes Core names and paths", () => {
    expect(isClothesCoreLora("VNCCS Clothes Core QI2")).toBe(true);
    expect(isClothesCoreLora("VNCCS_QI2_ClothesCoreV2.6.safetensors")).toBe(
      true
    );
    expect(isClothesCoreLora("VNCCS Overhaul QI2")).toBe(false);
  });

  it("normalizes paths relative to the loras folder", () => {
    expect(normalizeLoraPath(CORE_LORAS[2])).toBe(
      "QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors"
    );
    expect(
      normalizeLoraPath("C:\\ComfyUI\\models\\loras\\QI2.1\\core.safetensors")
    ).toBe("QI2.1/core.safetensors");
    expect(normalizeLoraPath("loras/a.safetensors")).toBe("a.safetensors");
    expect(normalizeLoraPath("QI2/a.safetensors")).toBe("QI2/a.safetensors");
    expect(normalizeLoraPath({ name: "No path" })).toBe("");
    expect(normalizeLoraPath(null)).toBe("");
  });

  it("records the active family's Clothes Core", () => {
    const qi2 = initializeClothesState(defaultClothesState(), context("QI2"));
    expect(qi2.gen_settings.lora_name).toBe(
      "QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors"
    );
    const h3 = initializeClothesState(qi2, context("MiniMaxH3"));
    expect(h3.gen_settings.lora_name).toBe(
      "MiniMaxH3/VNCCS/VNCCS_ClothesCoreMiniMaxH3V1.safetensors"
    );
    const sdxl = initializeClothesState(h3, context("SDXL"));
    expect(sdxl.gen_settings.lora_name).toBe("none");
  });

  it("matches every family without a connected model and clamps the strength", () => {
    const state = initializeClothesState(
      parseClothesState({ gen_settings: { lora_strength: 3 } }),
      context("")
    );
    expect(state.gen_settings.lora_name).toBe(
      "Klein9b/VNCCS_ClothesCoreKlein9b_V1.safetensors"
    );
    expect(state.gen_settings.lora_strength).toBe(1);
  });

  it("describes the card for present and missing cores", () => {
    const qi2 = initializeClothesState(defaultClothesState(), context("QI2"));
    expect(viewClothesState(qi2, context("QI2")).clothesCoreCard()).toEqual({
      entry: CORE_LORAS[2],
      installed: true,
      name: "VNCCS Clothes Core QI2",
      description: "QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors",
    });
    const missing = viewClothesState(
      initializeClothesState(defaultClothesState(), context("SDXL")),
      context("SDXL")
    ).clothesCoreCard();
    expect(missing).toEqual({
      entry: null,
      installed: false,
      name: "VNCCS Clothes Core",
      description: MISSING_CLOTHES_CORE_HINT,
    });
    const savedOnly = viewClothesState(
      parseClothesState({
        gen_settings: { lora_name: "QI2/My_Clothes.safetensors" },
      }),
      context("SDXL")
    ).clothesCoreCard();
    expect(savedOnly.name).toBe("My_Clothes");
    expect(savedOnly.installed).toBe(true);
  });

  it("reads the family and loras from the Control Center", () => {
    expect(
      clothesContext({ active_kind: " MiniMaxH3 " }, { lora: CORE_LORAS })
    ).toEqual({ kind: "MiniMaxH3", loras: CORE_LORAS });
    expect(clothesContext(null, null)).toEqual({ kind: "", loras: [] });
  });
});

describe("clothes costumes", () => {
  it("only edits named costumes that are not base sprite sets", () => {
    expect(isEditableCostume("Dress")).toBe(true);
    for (const name of ["", " ", "Naked", "Original", null]) {
      expect(isEditableCostume(name)).toBe(false);
    }
    expect(displayCostumes(["Naked", "Original", "Dress", "Casual"])).toEqual([
      "Dress",
      "Casual",
    ]);
  });

  it("keeps a listed costume and replaces Naked or a missing one", () => {
    const choose = (costume: string, list: string[]) =>
      apply(parseClothesState({ costume }), (model) =>
        model.chooseCostume(list)
      ).costume;
    expect(choose("Casual", ["Dress", "Casual"])).toBe("Casual");
    expect(choose("Naked", ["Dress", "Casual"])).toBe("Dress");
    expect(choose("Gone", ["Dress"])).toBe("Dress");
    expect(choose("Dress", [])).toBe("");
  });

  it("applies costume metadata and wizard fields", () => {
    const loaded = apply(defaultClothesState(), (model) =>
      model.applyCostumeInfo({ top: "shirt", shoes: "boots", other: 1 })
    );
    expect(loaded.costume_info).toEqual({
      top: "shirt",
      bottom: "",
      head: "",
      face: "",
      shoes: "boots",
    });
    const filled = apply(loaded, (model) =>
      model.applyWizardData({ top: "coat", head: "hat" })
    );
    expect(filled.costume_info).toEqual({
      top: "coat",
      bottom: "",
      head: "hat",
      face: "",
      shoes: "",
    });
  });

  it("reads age and sex for Pose Studio from the character metadata", () => {
    const state = apply(defaultClothesState(), (model) =>
      model.applyCharacterInfo({ age: "150", gender: "Male", hair: "red" })
    );
    expect(state.character_info).toEqual({
      age: 100,
      sex: "male",
      gender: "Male",
      hair: "red",
    });
    expect(normalizeCharacterAge("x")).toBe(18);
    expect(normalizeCharacterAge(0)).toBe(1);
    expect(normalizeCharacterAge("24.5")).toBe(24.5);
  });

  it("reports why a run or deletion cannot start", () => {
    const problem = (saved: object) =>
      viewClothesState(parseClothesState(saved), context()).runProblem()?.title;
    expect(problem({})).toBe("Select Character");
    expect(problem({ character: "Alice", costume: "Naked" })).toBe(
      "Costume Required"
    );
    expect(
      problem({ character: "Alice", costume: "Dress", activeTab: "clone" })
    ).toBe("Reference Required");
    expect(
      problem({
        character: "Alice",
        costume: "Dress",
        activeTab: "clone",
        clone_image: { name: "donor.png" },
      })
    ).toBeUndefined();
    const dress = viewClothesState(
      parseClothesState({ character: "Alice", costume: "Dress" }),
      context()
    );
    expect(dress.deleteProblem(false)).toBeNull();
    expect(dress.deleteProblem(true)).toContain("Wait for preview generation");
    expect(
      viewClothesState(
        parseClothesState({ character: "Alice", costume: "Original" }),
        context()
      ).deleteProblem(false)
    ).toContain("Base sprite sets cannot be deleted");
  });

  it("clears the costume, its fields and the sprite on reset", () => {
    const state = apply(
      parseClothesState({
        costume: "Dress",
        costume_info: { top: "silk" },
        selected_preview_sprite: { character: "A", costume: "Dress" },
      }),
      (model) => model.resetCostumeSelection()
    );
    expect(state.costume).toBe("");
    expect(state.costume_info.top).toBe("");
    expect(state.selected_preview_sprite).toBeNull();
  });

  it("stores uploaded donors as input images", () => {
    const state = apply(defaultClothesState(), (model) =>
      model.setCloneImage({ name: "d.png", type: "temp", subfolder: "x" })
    );
    expect(state.clone_image).toEqual({
      name: "d.png",
      type: "input",
      subfolder: "x",
    });
  });
});
