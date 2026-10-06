import { describe, expect, it } from "vitest";
import { downloadKey } from "../src/control-center";
import {
  type CreatorContext,
  type CreatorModel,
  type CreatorState,
  initializeCreatorState,
  isCreatorOverhaulLora,
  NO_LOCAL_ASSETS,
  normalizeOverhaulStrength,
  parseCreatorState,
  QI2_OVERHAUL_ENTRY,
  serializeCreatorState,
  updateCreatorState,
  viewCreatorState,
} from "../src/creator-state";
import { liveCatalog, QI2_UNET, VIGGLE_TURBO } from "./fixtures/catalog";

function context(overrides: Partial<CreatorContext> = {}): CreatorContext {
  const catalog = liveCatalog();
  return {
    catalog: {
      models: catalog.models,
      clip: catalog.clip,
      vae: catalog.vae,
      lora: catalog.lora,
    },
    defaultStyle: "legacy",
    downloads: {},
    local: NO_LOCAL_ASSETS,
    ...overrides,
  };
}

function load(saved: unknown, ctx: CreatorContext = context()): CreatorState {
  const { state } = parseCreatorState(JSON.stringify(saved), ctx.defaultStyle);
  return initializeCreatorState(state, ctx);
}

function save(
  state: CreatorState,
  mutate: (model: CreatorModel) => void,
  ctx: CreatorContext = context()
): CreatorState {
  return updateCreatorState(state, ctx, mutate);
}

/** gen_settings as the widget saves them today: versioned, with a profile for the active family. */
function gen(mode: string, extra: Record<string, unknown> = {}) {
  return {
    generation_mode: mode,
    generation_defaults_version: 6,
    mode_settings: { [mode]: {} },
    ...extra,
  };
}

/** Reload through the serialized form, as reopening a workflow does. */
function reload(state: CreatorState, ctx: CreatorContext = context()) {
  return load(JSON.parse(serializeCreatorState(state)), ctx);
}

function backgroundState(
  mode: string,
  background = "Blue",
  marker: string = mode
) {
  return load({
    character: "Test",
    character_info: { name: "Test", background_color: background },
    gen_settings: {
      generation_mode: mode,
      previous_background_color: "Blue",
      background_model_kind: marker,
    },
  });
}

describe("Creator background (ported widget tests)", () => {
  for (const mode of ["anima", "illustrious"]) {
    it(`does not let Alpha enter the ${mode} state`, () => {
      const state = save(backgroundState(mode), (model) =>
        model.setBackground("Transparent", true)
      );
      expect(state.character_info.background_color).toBe("Blue");
    });
  }

  it("selects Alpha for QI2 and restores the last solid colour", () => {
    let state = save(backgroundState("anima"), (model) =>
      model.setGenerationMode("qi2")
    );
    expect(state.character_info.background_color).toBe("Transparent");
    expect(state.gen_settings.previous_background_color).toBe("Blue");
    state = save(state, () => undefined);
    expect(state.character_info.background_color).toBe("Transparent");
    state = save(state, (model) => model.setBackground("Green", true));
    expect(state.character_info.background_color).toBe("Green");
    state = save(state, (model) => model.setBackground("Transparent", true));
    state = save(state, (model) => model.setGenerationMode("anima"));
    expect(state.character_info.background_color).toBe("Green");
  });

  for (const background of ["Alpha", "Transparent", "transparent"]) {
    it(`repairs a legacy ${background} saved with a matching ANIMA marker`, () => {
      const state = backgroundState("anima", background);
      expect(state.character_info.background_color).toBe("Blue");
      expect(reload(state).character_info.background_color).toBe("Blue");
    });
  }

  it("keeps an explicit solid colour through repeated QI2 saves", () => {
    let state = backgroundState("qi2", "Transparent");
    state = save(state, (model) => model.setBackground("Blue", true));
    state = save(state, () => undefined);
    expect(state.character_info.background_color).toBe("Blue");
    state = save(state, (model) => model.setBackground("Transparent", true));
    expect(state.character_info.background_color).toBe("Transparent");
  });

  it("normalizes incompatible alpha whenever the state is saved", () => {
    const state = save(backgroundState("anima"), (model) =>
      model.setInfo("background_color", "Alpha")
    );
    expect(state.character_info.background_color).toBe("Blue");
  });
});

describe("Creator QI2 overhaul (ported widget tests)", () => {
  const qi2 = () =>
    load({
      character: "Test",
      character_info: { name: "Test" },
      preview_valid: true,
      gen_settings: { generation_mode: "qi2", mode_settings: {} },
    });

  it("follows the Turbo card and only exists for QI2", () => {
    const ctx = context();
    const cards = viewCreatorState(qi2(), ctx).modeLoraCards("qi2");
    expect(cards.turbo.map((card) => card.entry.name)).toEqual([VIGGLE_TURBO]);
    expect(cards.overhaul).toEqual({
      entry: QI2_OVERHAUL_ENTRY,
      strength: 0.5,
    });
    const model = viewCreatorState(qi2(), ctx);
    expect(model.modeLoraCards("anima").overhaul).toBeNull();
    expect(model.modeLoraCards("illustrious").overhaul).toBeNull();
  });

  it("marks the overhaul installed from the local LoRA list", () => {
    const ctx = context({
      local: {
        ...NO_LOCAL_ASSETS,
        loras: ["QI2.1/VNCCS/VNCCS_QI2_AnimeOverhaulV1.safetensors"],
      },
    });
    const cards = viewCreatorState(qi2(), ctx).modeLoraCards("qi2");
    expect(cards.overhaul?.entry.status).toBe("installed");
    expect(viewCreatorState(qi2(), ctx).stackLoraOptions()).toEqual([]);
  });

  it("treats every versioned catalogue file as the overhaul adapter", () => {
    const ctx = context({
      local: {
        ...NO_LOCAL_ASSETS,
        loras: [
          "QI2.1\\VNCCS\\VNCCS_QI2_AnimeOverhaulV1.2.safetensors",
          "other.safetensors",
        ],
      },
    });
    expect(viewCreatorState(qi2(), ctx).stackLoraOptions()).toEqual([
      "other.safetensors",
    ]);
    expect(
      isCreatorOverhaulLora(
        "QI2.1/VNCCS/VNCCS_QI2_AnimeOverhaulV1.10.safetensors"
      )
    ).toBe(true);
    expect(
      isCreatorOverhaulLora("VNCCS_QI2_AnimeOverhaulV1.safetensors.bak")
    ).toBe(false);
  });

  it("saves every slider step, invalidates the preview and keeps it per family", () => {
    let state = qi2();
    for (const strength of [0, 0.25, 0.5, 0.75, 1, 0]) {
      state = { ...state, preview_valid: true };
      state = save(state, (model) => model.setOverhaulStrength(strength));
      expect(state.gen_settings.mode_settings.qi2?.qi2_overhaul_strength).toBe(
        strength
      );
      expect(state.preview_valid).toBe(false);
    }
    state = save(state, (model) => model.setGenerationMode("anima"));
    state = save(state, (model) => model.setGenerationMode("qi2"));
    expect(state.gen_settings.qi2_overhaul_strength).toBe(0);
    const restored = reload(state);
    expect(restored.gen_settings.qi2_overhaul_strength).toBe(0);
    expect(
      restored.gen_settings.mode_settings.anima?.qi2_overhaul_strength
    ).toBeUndefined();
  });

  it("normalizes legacy, invalid and out-of-range strengths", () => {
    expect(qi2().gen_settings.qi2_overhaul_strength).toBe(0.5);
    for (const [value, expected] of [
      [undefined, 0.5],
      [null, 0.5],
      ["", 0.5],
      ["bad", 0.5],
      [Number.NaN, 0.5],
      [Number.POSITIVE_INFINITY, 0.5],
      [-1, 0],
      [2, 1],
      [0.37, 0.25],
      [0.38, 0.5],
    ] as const) {
      expect(normalizeOverhaulStrength(value)).toBe(expected);
    }
  });

  it("drops the overhaul adapter from a saved stack, including Windows paths", () => {
    const state = load({
      character_info: {},
      gen_settings: {
        generation_mode: "qi2",
        generation_defaults_version: 6,
        mode_settings: {
          qi2: {
            qi2_overhaul_strength: 0.5,
            lora_stack: [
              {
                name: "QI2.1\\VNCCS\\VNCCS_QI2_AnimeOverhaulV1.safetensors",
                strength: 0.75,
              },
              { name: "other.safetensors", strength: 0.25 },
            ],
          },
        },
      },
    });
    const stack = (state.gen_settings.lora_stack ?? []).filter(
      (item) => item.name
    );
    expect(stack).toEqual([{ name: "other.safetensors", strength: 0.25 }]);
    expect(state.gen_settings.lora_stack).toHaveLength(5);
    expect(state.gen_settings.qi2_overhaul_strength).toBe(0.5);
  });
});

describe("Creator generation profiles", () => {
  it("switches QI2 Turbo to 6 steps at CFG 1 and restores the previous values", () => {
    let state = load({ gen_settings: gen("qi2") });
    expect(state.gen_settings).toMatchObject({ steps: 25, cfg: 3 });
    const rel =
      "QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors";
    state = save(state, (model) => model.setCcTurboMode(true, rel));
    expect(state.gen_settings).toMatchObject({
      steps: 6,
      cfg: 1,
      turbo_enabled: true,
      dmd_lora_name: rel,
      turbo_previous_settings: { steps: 25, cfg: 3 },
    });
    const cards = viewCreatorState(state, context()).modeLoraCards();
    expect(cards.turbo[0]?.enabled).toBe(true);
    state = save(state, (model) => model.setGenerationMode("anima"));
    expect(state.gen_settings).toMatchObject({ steps: 30, cfg: 4 });
    state = save(state, (model) => model.setGenerationMode("qi2"));
    expect(state.gen_settings).toMatchObject({ steps: 6, cfg: 1 });
    state = save(state, (model) => model.setCcTurboMode(false, rel));
    expect(state.gen_settings).toMatchObject({
      steps: 25,
      cfg: 3,
      turbo_enabled: false,
      turbo_previous_settings: null,
    });
  });

  it("uses 12 steps for ANIMA Turbo", () => {
    let state = load({ gen_settings: gen("anima") });
    state = save(state, (model) => model.setTurboMode(true));
    expect(state.gen_settings).toMatchObject({ steps: 12, cfg: 1 });
    state = save(state, (model) => model.setTurboMode(false));
    expect(state.gen_settings).toMatchObject({ steps: 30, cfg: 4 });
  });

  it("uses the DMD2 LoRA at 4 steps for Illustrious", () => {
    let state = load({
      gen_settings: { generation_mode: "illustrious", dmd_lora_strength: 0 },
    });
    state = save(state, (model) =>
      model.setCcTurboMode(true, "dmd2.safetensors")
    );
    expect(state.gen_settings).toMatchObject({
      steps: 4,
      cfg: 1,
      dmd_lora_strength: 1,
      dmd_lora_name: "dmd2.safetensors",
    });
    state = save(state, (model) => model.setCcTurboMode(false, ""));
    expect(state.gen_settings).toMatchObject({
      steps: 20,
      cfg: 8,
      dmd_lora_strength: 0,
      dmd_lora_name: "",
    });
  });

  it("drops the legacy ANIMA resolution preset like the widget", () => {
    // Migration merges the family defaults first, so the preset never wins
    // over target_size; the widget behaves the same way.
    const state = load({
      gen_settings: gen("anima", {
        mode_settings: { anima: { resolution_preset: "high" } },
      }),
    });
    expect(state.gen_settings.target_size).toBe(1024);
    expect(
      state.gen_settings.mode_settings.anima?.resolution_preset
    ).toBeUndefined();
  });

  it("snaps a saved target size onto the megapixel grid", () => {
    const state = load({
      gen_settings: gen("qi2", {
        mode_settings: { qi2: { target_size: 1100 } },
      }),
    });
    expect(state.gen_settings.target_size).toBe(1126);
  });

  it("moves pre-profile flat settings into the active family", () => {
    const state = load({
      gen_settings: {
        generation_mode: "illustrious",
        steps: 33,
        ckpt_name: "mine.safetensors",
      },
    });
    expect(state.gen_settings.mode_settings.illustrious).toMatchObject({
      steps: 33,
      ckpt_name: "mine.safetensors",
    });
    expect(state.gen_settings.generation_defaults_version).toBe(6);
  });

  it("pins the family CLIP and VAE when a QI2 model is picked", () => {
    let state = load({ gen_settings: { generation_mode: "qi2" } });
    state = save(state, (model) =>
      model.selectModel("qi2", "custom/qi2.safetensors")
    );
    expect(state.gen_settings).toMatchObject({
      diffusion_model_name: "custom/qi2.safetensors",
      clip_name: "qwen3vl_8b_int8_convrot.safetensors",
      vae_name: "qwen_image_2.1_vae_bf16.safetensors",
      clip_type: "qwen_image",
    });
  });

  it("randomizes the seed only in randomize mode", () => {
    let state = load({ gen_settings: { generation_mode: "qi2", seed: 7 } });
    state = save(state, (model) => model.randomizeSeedIfNeeded(() => 0.5));
    expect(state.gen_settings.seed).toBe(7);
    state = save(state, (model) => model.toggleSeedMode());
    state = save(state, (model) => model.randomizeSeedIfNeeded(() => 0.5));
    expect(state.gen_settings.seed).toBe(5_000_000_000_000);
  });

  it("sends only filled LoRA slots in the preview payload", () => {
    const state = save(
      load({ gen_settings: { generation_mode: "qi2" } }),
      (model) => {
        model.setLoraSlot(0, { name: "a.safetensors", strength: 0.5 });
        model.setLoraSlot(1, { name: "None" });
      }
    );
    const payload = viewCreatorState(state, context()).previewPayload();
    expect(payload.gen_settings.lora_stack).toEqual([
      { name: "a.safetensors", strength: 0.5 },
    ]);
  });
});

describe("Creator prompts", () => {
  it("keeps aesthetics per family", () => {
    let state = load({ gen_settings: { generation_mode: "qi2" } });
    state = save(state, (model) =>
      model.setPromptText("aesthetics", "soft light")
    );
    state = save(state, (model) => model.setGenerationMode("anima"));
    expect(state.character_info.aesthetics).toBe(
      "masterpiece, best quality, score_7"
    );
    state = save(state, (model) => model.setGenerationMode("qi2"));
    expect(state.character_info.aesthetics).toBe("soft light");
  });

  it("merges new family defaults into old prompts and drops the anime token", () => {
    const state = load({
      prompt_defaults_version: 1,
      prompt_modes: {
        anima: { aesthetics: "anime, cute", negative_prompt: "" },
      },
      gen_settings: { generation_mode: "anima" },
    });
    expect(state.prompt_modes.anima?.aesthetics).toBe(
      "masterpiece, best quality, score_7, cute"
    );
    expect(state.character_info.aesthetics).toBe(
      "masterpiece, best quality, score_7, cute"
    );
    expect(state.prompt_defaults_version).toBe(3);
  });
});

describe("Creator default mode", () => {
  it("opens a new Creator on QI2 when no checkpoint is installed", () => {
    const ctx = context();
    const { isNew, state } = parseCreatorState(null, ctx.defaultStyle);
    expect(isNew).toBe(true);
    const opened = initializeCreatorState(state, ctx, isNew);
    const switched = save(initializeCreatorState(state, ctx), (model) =>
      model.setGenerationMode("qi2")
    );
    expect(opened.gen_settings.generation_mode).toBe("qi2");
    expect(opened.character_info.background_color).toBe("Transparent");
    expect(opened).toEqual(switched);
  });

  it("keeps Illustrious for a new Creator when a checkpoint is installed", () => {
    const ctx = context({
      local: {
        ...NO_LOCAL_ASSETS,
        checkpoints: ["Illustrious/ILFlat.safetensors"],
      },
    });
    const { isNew, state } = parseCreatorState(null, ctx.defaultStyle);
    const opened = initializeCreatorState(state, ctx, isNew);
    expect(opened.gen_settings.generation_mode).toBe("illustrious");
    expect(opened.gen_settings.ckpt_name).toBe(
      "Illustrious/ILFlat.safetensors"
    );
  });

  it("keeps a saved Illustrious selection without checkpoints", () => {
    const loaded = parseCreatorState(
      JSON.stringify({ gen_settings: gen("illustrious") }),
      "legacy"
    );
    expect(loaded.isNew).toBe(false);
    const opened = initializeCreatorState(
      loaded.state,
      context(),
      loaded.isNew
    );
    expect(opened.gen_settings.generation_mode).toBe("illustrious");
  });
});

describe("Creator character data", () => {
  it("restores character_info only for the character that owns it", () => {
    const foreign = parseCreatorState(
      JSON.stringify({
        character: "Alice",
        character_info: { name: "Bob", hair: "red hair" },
      }),
      "legacy"
    );
    expect(foreign.restoredInfoCharacter).toBeNull();
    expect(foreign.state.character_info.hair).toBe(
      "black hair, waist-length hair"
    );
    const own = parseCreatorState(
      {
        character: "Alice",
        character_info: { name: "Alice", hair: "red hair" },
      },
      "legacy"
    );
    expect(own.restoredInfoCharacter).toBe("Alice");
    expect(own.state.character_info.hair).toBe("red hair");
    expect(parseCreatorState("{bad", "legacy").state.character).toBe("");
  });

  it("applies wizard output with clamped age and cleared missing traits", () => {
    let state = load({
      character: "A",
      character_info: { name: "A", face: "x" },
    });
    state = save(state, (model) =>
      model.applyWizardData({ sex: "Male", age: "200", hair: "silver hair" })
    );
    expect(state.character_info).toMatchObject({
      sex: "male",
      age: 100,
      hair: "silver hair",
      face: "",
    });
    state = save(state, (model) => model.applyWizardData({ age: "abc" }));
    expect(state.character_info.age).toBe(18);
  });

  it("stamps the owner and loads metadata with fresh prompt families", () => {
    let state = load({ gen_settings: { generation_mode: "qi2" } });
    state = save(state, (model) =>
      model.loadCharacterInfo("Mia", { hair: "pink hair", aesthetics: "glow" })
    );
    expect(state.character).toBe("Mia");
    expect(state.character_info.name).toBe("Mia");
    expect(state.character_info.hair).toBe("pink hair");
    expect(state.character_info.background_color).toBe("Transparent");
    expect(state.prompt_modes.illustrious?.aesthetics).toBe("glow");
    expect(state.character_info.aesthetics).toBe("");
  });
});

describe("Creator preview checks", () => {
  const installed = context({
    local: {
      ...NO_LOCAL_ASSETS,
      diffusion_models: ["qwen_image_2.1_int8_convrot.safetensors"],
    },
  });

  it("requires a character", () => {
    const state = load({ gen_settings: { generation_mode: "qi2" } });
    expect(viewCreatorState(state, installed).previewProblem()?.title).toBe(
      "No Character"
    );
  });

  it("accepts installed QI2 models", () => {
    const state = load(
      { character: "A", gen_settings: { generation_mode: "qi2" } },
      installed
    );
    expect(viewCreatorState(state, installed).previewProblem()).toBeNull();
  });

  it("names the missing family asset", () => {
    const anima = load({
      character: "A",
      gen_settings: { generation_mode: "anima" },
    });
    expect(viewCreatorState(anima, context()).previewProblem()).toEqual({
      title: "Model Missing",
      message: "Download and select an installed Anima Diffusion Model",
    });
    const illustrious = load({
      character: "A",
      gen_settings: { generation_mode: "illustrious" },
    });
    expect(
      viewCreatorState(illustrious, context()).previewProblem()?.message
    ).toBe("Download and select an installed Illustrious checkpoint");
    const offline = context({ catalog: null });
    const bare = load(
      { character: "A", gen_settings: { generation_mode: "illustrious" } },
      offline
    );
    expect(viewCreatorState(bare, offline).previewProblem()?.title).toBe(
      "Missing Checkpoint"
    );
  });

  it("treats a transient download as not installed", () => {
    const ctx = context({
      downloads: {
        [downloadKey("models", QI2_UNET)]: { status: "downloading" },
      },
    });
    const state = load(
      { character: "A", gen_settings: { generation_mode: "qi2" } },
      ctx
    );
    expect(viewCreatorState(state, ctx).previewProblem()?.message).toBe(
      "Download and select an installed Qwen Image 2.1 Diffusion Model"
    );
  });
});
