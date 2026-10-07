import { describe, expect, it } from "vitest";
import { downloadKey } from "../src/control-center";
import { NO_LOCAL_ASSETS } from "../src/creator-state";
import {
  addEmotionEntry,
  type EmotionContext,
  type EmotionStudioModel,
  type EmotionStudioState,
  emotionGenerationDefaults,
  filterEmotions,
  initializeEmotionStudioState,
  parseEmotionStudioState,
  parseGenerationSettings,
  selectAllButton,
  selectedEmotionEntries,
  selectVisibleSummary,
  serializeEmotionStudioState,
  updateEmotionStudioState,
  viewEmotionStudioState,
} from "../src/emotion-state";
import type { EmotionEntry } from "../src/emotions";
import { buildEmotionPrompt, EMOTION_IDS } from "../src/graphs";
import { liveCatalog, QI2_UNET, VIGGLE_TURBO } from "./fixtures/catalog";

const QI2_MODEL = "qwen_image_2.1_int8_convrot.safetensors";
const QI2_CLIP = "qwen3vl_8b_int8_convrot.safetensors";
const QI2_VAE = "qwen_image_2.1_vae_bf16.safetensors";

function context(overrides: Partial<EmotionContext> = {}): EmotionContext {
  const catalog = liveCatalog();
  return {
    catalog: {
      models: catalog.models,
      clip: catalog.clip,
      vae: catalog.vae,
      lora: catalog.lora,
    },
    downloads: {},
    local: NO_LOCAL_ASSETS,
    poseCount: 0,
    ...overrides,
  };
}

function load(saved: unknown = null, ctx = context()): EmotionStudioState {
  const state = parseEmotionStudioState(
    saved === null ? null : JSON.stringify(saved)
  );
  return initializeEmotionStudioState(state, ctx);
}

function save(
  state: EmotionStudioState,
  mutate: (model: EmotionStudioModel) => void,
  ctx = context()
): EmotionStudioState {
  return updateEmotionStudioState(state, ctx, mutate);
}

function view(state: EmotionStudioState, ctx = context()) {
  return viewEmotionStudioState(state, ctx);
}

function emotion(safeName: string, description = ""): EmotionEntry {
  return {
    category: "Test",
    description,
    key: safeName,
    natural_prompt: "",
    safe_name: safeName,
  };
}

describe("Emotion Studio generation settings", () => {
  it("defaults to the widget's Qwen Image 2.1 profile", () => {
    const defaults = emotionGenerationDefaults();
    expect(defaults).toMatchObject({
      generation_mode: "qi2",
      diffusion_model_name: QI2_MODEL,
      clip_name: QI2_CLIP,
      vae_name: QI2_VAE,
      clip_type: "qwen_image",
      sampler: "euler",
      scheduler: "simple",
      steps: 25,
      cfg: 3,
      seed: 0,
      seed_mode: "fixed",
      turbo_enabled: false,
      dmd_lora_name:
        "QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors",
      qi2_cache: { device: "gpu", dtype: "int8" },
    });
    expect(defaults.lora_stack).toHaveLength(5);
    expect(defaults).not.toHaveProperty("mode_settings");
  });

  it("merges saved settings shallowly over the defaults", () => {
    const gen = parseGenerationSettings(
      JSON.stringify({ generation_mode: "qi2", steps: 12 })
    );
    expect(gen).toMatchObject({ generation_mode: "qi2", steps: 12, cfg: 3 });
    expect(parseGenerationSettings("{not json")).toEqual(
      emotionGenerationDefaults()
    );
  });

  it("moves settings saved under Anima to their QI2 profile", () => {
    const state = load({
      gen: {
        generation_mode: "anima",
        diffusion_model_name: "minimax_h3_fl2va_bf16.safetensors",
        clip_name: "qwen_3_06b_base.safetensors",
        vae_name: "qwen_image_vae.safetensors",
        steps: 30,
        cfg: 4,
        seed: 7,
        seed_mode: "randomize",
        selected_pose_indices: [2],
        mode_settings: {
          anima: { steps: 30 },
          qi2: {
            generation_mode: "qi2",
            diffusion_model_name: "custom/qwen_image_2.1_mine.safetensors",
            clip_name: "qwen_3_06b_base.safetensors",
            steps: 12,
            cfg: 2.5,
          },
        },
      },
    });
    expect(state.gen).toMatchObject({
      generation_mode: "qi2",
      diffusion_model_name: "custom/qwen_image_2.1_mine.safetensors",
      clip_name: QI2_CLIP,
      vae_name: QI2_VAE,
      steps: 12,
      cfg: 2.5,
      seed: 7,
      seed_mode: "randomize",
    });
    expect(state.gen).not.toHaveProperty("mode_settings");
    expect(state.poses).toEqual([2]);
  });

  it("starts from the QI2 defaults when Illustrious left no QI2 profile", () => {
    const state = load({
      gen: {
        generation_mode: "illustrious",
        ckpt_name: "Illustrious/ILFlatMix.safetensors",
        steps: 20,
        cfg: 8,
        seed: 3,
      },
    });
    expect(state.gen).toMatchObject({
      generation_mode: "qi2",
      diffusion_model_name: QI2_MODEL,
      steps: 25,
      cfg: 3,
      seed: 3,
    });
    expect(state.gen).not.toHaveProperty("ckpt_name");
  });

  it("replaces an empty or non-QI2 model with the catalog's QI2 model", () => {
    const local = {
      ...NO_LOCAL_ASSETS,
      diffusion_models: ["minimax_h3_fl2va_bf16.safetensors"],
    };
    for (const name of ["", "minimax_h3_fl2va_bf16.safetensors"]) {
      const saved = {
        gen: { generation_mode: "qi2", diffusion_model_name: name },
      };
      expect(load(saved, context({ local })).gen.diffusion_model_name).toBe(
        QI2_MODEL
      );
      expect(
        load(saved, context({ catalog: null, local })).gen.diffusion_model_name
      ).toBe(QI2_MODEL);
    }
  });

  it("lists QI2 models only, local files named like Qwen Image 2 last", () => {
    const mine = "QI2/Qwen-Image-2.1-mine.safetensors";
    const ctx = context({
      local: {
        ...NO_LOCAL_ASSETS,
        diffusion_models: [
          QI2_MODEL,
          "minimax_h3_fl2va_bf16.safetensors",
          "anima-base-v1.0.safetensors",
          mine,
        ],
      },
    });
    const model = view(load(null, ctx), ctx);
    const entries = model.modelEntries();
    expect(entries.map((entry) => entry.name)).toEqual([QI2_UNET, mine]);
    expect(entries[0]?.status).toBe("installed");
    expect(model.selectedModelEntry()?.name).toBe(QI2_UNET);
    const picked = save(load(null, ctx), (m) => m.selectModel(mine), ctx);
    expect(picked.gen).toMatchObject({
      diffusion_model_name: mine,
      clip_name: QI2_CLIP,
      vae_name: QI2_VAE,
      clip_type: "qwen_image",
    });
  });

  it("toggles the seed mode and randomizes only when asked", () => {
    let state = load();
    state = save(state, (model) => {
      expect(model.randomizeSeedIfNeeded(() => 0.5)).toBe(false);
      model.toggleSeedMode();
    });
    expect(state.gen.seed_mode).toBe("randomize");
    state = save(state, (model) => {
      expect(model.randomizeSeedIfNeeded(() => 0.5)).toBe(true);
    });
    expect(state.gen.seed).toBe(Math.floor(0.5 * 9_007_199_254_740_991));
  });

  it("edits LoRA stack rows and the QI2 cache", () => {
    const state = save(load(), (model) => {
      model.setLoraSlot(1, { name: "style.safetensors", strength: 0.5 });
      model.setQi2Cache({ device: "cpu" });
    });
    const model = view(state);
    expect(model.loraRows()[1]).toEqual({
      name: "style.safetensors",
      strength: 0.5,
    });
    expect(state.gen.qi2_cache).toEqual({ device: "cpu", dtype: "int8" });
  });
});

describe("Emotion Studio turbo", () => {
  it("runs Viggle turbo at 6 euler/simple steps, then restores", () => {
    let state = save(load(), (model) => {
      model.setValue("steps", 30);
      model.setValue("sampler", "er_sde");
    });
    const card = view(state).turboCards()[0];
    expect(card?.entry.name).toBe(VIGGLE_TURBO);
    expect(card?.fallback).toBe(false);
    state = save(state, (model) => model.setCcTurboMode(true, card?.rel ?? ""));
    expect(state.gen).toMatchObject({
      turbo_enabled: true,
      steps: 6,
      cfg: 1,
      sampler: "euler",
      scheduler: "simple",
      dmd_lora_name:
        "QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors",
      dmd_lora_strength: 1,
    });
    expect(view(state).turboCards()[0]?.enabled).toBe(true);
    state = save(state, (model) =>
      model.setCcTurboMode(false, card?.rel ?? "")
    );
    expect(state.gen).toMatchObject({
      turbo_enabled: false,
      steps: 30,
      cfg: 3,
      dmd_lora_strength: 0,
    });
  });

  it("shows a local stand-in card when the catalog has no turbo LoRA", () => {
    const ctx = context({ catalog: null });
    const state = load(null, ctx);
    const [missing] = view(state, ctx).turboCards();
    expect(missing).toMatchObject({
      fallback: true,
      rel: "QI2/Viggle/Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors",
    });
    expect(missing?.entry.status).toBe("missing");
    const installed = context({
      catalog: null,
      local: {
        ...NO_LOCAL_ASSETS,
        loras: [
          "QI2\\Viggle\\Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r128.safetensors",
        ],
      },
    });
    expect(view(state, installed).turboCards()[0]?.entry.status).toBe(
      "installed"
    );
  });

  it("reports transient download states over the catalog status", () => {
    const model = view(load());
    const entry = model.modelEntries()[0];
    expect(entry && model.resolveStatus("models", entry)).toBe("installed");
    const downloading = view(
      load(),
      context({
        downloads: {
          [downloadKey("models", QI2_UNET)]: { status: "downloading" },
        },
      })
    );
    expect(entry && downloading.resolveStatus("models", entry)).toBe(
      "downloading"
    );
  });
});

describe("Emotion Studio poses", () => {
  const three = context({ poseCount: 3 });

  it("selects every pose until a chip is clicked", () => {
    let state = load(null, three);
    let model = view(state, three);
    expect(model.selectedPoseIndexList()).toBeNull();
    expect(model.poseSummary()).toBe("3/3 selected");
    expect(state.gen.selected_pose_indices).toBeUndefined();
    state = save(state, (m) => m.togglePose(2), three);
    model = view(state, three);
    expect(model.selectedPoseIndexList()).toEqual([1, 3]);
    expect(model.isPoseSelected(2)).toBe(false);
    expect(model.poseSummary()).toBe("2/3 selected");
    expect(state.gen.selected_pose_indices).toEqual([1, 3]);
    state = save(state, (m) => m.selectAllPoses(), three);
    expect(state.gen.selected_pose_indices).toBeUndefined();
    expect(view(state, context()).poseSummary()).toBe("No poses");
  });

  it("drops chips beyond the counted sprites", () => {
    let state = save(load(null, three), (m) => m.togglePose(1), three);
    expect(state.poses).toEqual([2, 3]);
    const two = context({ poseCount: 2 });
    state = save(state, (m) => m.trimPoseSelection(), two);
    expect(state.poses).toEqual([2]);
  });

  it("restores the pose selection from the saved settings", () => {
    const state = save(load(null, three), (m) => m.togglePose(3), three);
    const reloaded = parseEmotionStudioState(
      serializeEmotionStudioState(state)
    );
    expect(reloaded.poses).toEqual([1, 2]);
    expect(reloaded.gen.selected_pose_indices).toEqual([1, 2]);
  });
});

describe("Emotion Studio selection", () => {
  it("selects every costume of the first list, then keeps saved choices", () => {
    let state = save(load(), (m) => m.applyCostumeList([]));
    expect(state.costumes).toBeNull();
    state = save(state, (m) => m.applyCostumeList(["Naked", "Simple"]));
    expect(state.costumes).toEqual(["Naked", "Simple"]);
    state = save(state, (m) => m.setCostume("Naked", false));
    state = save(state, (m) =>
      m.applyCostumeList(["Naked", "Simple", "Armor"])
    );
    expect(state.costumes).toEqual(["Simple"]);
    state = save(state, (m) => m.applyCostumeList(["Naked"]));
    expect(state.costumes).toEqual([]);
  });

  it("clears emotions and poses when the character changes", () => {
    const three = context({ poseCount: 3 });
    let state = save(load(), (m) => {
      m.selectCharacter("StudioQA");
      m.toggleEmotion("happy");
    });
    state = save(state, (m) => m.togglePose(1), three);
    state = save(state, (m) => m.selectCharacter("StudioQA"), three);
    expect(state.emotions).toEqual(["happy"]);
    expect(state.poses).toEqual([2, 3]);
    state = save(state, (m) => m.selectCharacter("Other"), three);
    expect(state.emotions).toEqual([]);
    expect(state.poses).toBeNull();
  });

  it("keeps emotions in pick order", () => {
    let state = save(load(), (m) => {
      m.toggleEmotion("sad");
      m.toggleEmotion("happy");
      m.selectEmotions(["happy", "angry"]);
    });
    expect(state.emotions).toEqual(["sad", "happy", "angry"]);
    state = save(state, (m) => {
      m.toggleEmotion("sad");
      m.deselectEmotions(["angry"]);
    });
    expect(state.emotions).toEqual(["happy"]);
  });

  it("explains what is missing before a run", () => {
    const three = context({ poseCount: 3 });
    let state = load(null, three);
    expect(view(state, three).queueProblem()).toEqual({
      title: "Nothing selected",
      message:
        "Please select at least one costume and one emotion before running.",
    });
    state = save(state, (m) => m.toggleEmotion("happy"), three);
    expect(view(state, three).queueProblem()?.message).toBe(
      "Please enable at least one costume."
    );
    state = save(
      state,
      (m) => {
        m.applyCostumeList(["Naked"]);
        m.toggleEmotion("happy");
      },
      three
    );
    expect(view(state, three).queueProblem()?.message).toBe(
      "Please select at least one emotion."
    );
    state = save(
      state,
      (m) => {
        m.toggleEmotion("happy");
        m.clearAllPoses();
      },
      three
    );
    expect(view(state, three).queueProblem()?.message).toBe(
      "Select at least one pose in Generate poses."
    );
    state = save(state, (m) => m.selectAllPoses(), three);
    expect(view(state, three).queueProblem()).toBeNull();
  });

  it("builds costume-major pairs and the node inputs", () => {
    const state = save(load(), (m) => {
      m.selectCharacter("StudioQA");
      m.applyCostumeList(["Naked", "Simple"]);
      m.toggleEmotion("angry");
      m.toggleEmotion("happy");
    });
    const model = view(state);
    expect(model.generatorSources()).toEqual({
      character: "StudioQA",
      emotionMode: "qi2",
      emotionPairs: [
        { costume: "Naked", emotion: "angry" },
        { costume: "Naked", emotion: "happy" },
        { costume: "Simple", emotion: "angry" },
        { costume: "Simple", emotion: "happy" },
      ],
    });
    const prompt = buildEmotionPrompt({
      source: model.sourceInputs(),
      generator: { widgetData: {} },
    });
    const inputs = prompt[EMOTION_IDS.source]?.inputs ?? {};
    expect(inputs).toMatchObject({
      character: "StudioQA",
      costumes_data: '["Naked","Simple"]',
      emotions_data: '["angry","happy"]',
      generation_model: "QI2",
      prompt_style: "SDXL Style",
    });
    expect(JSON.parse(String(inputs.generation_settings))).toMatchObject({
      generation_mode: "qi2",
      diffusion_model_name: QI2_MODEL,
      clip_name: QI2_CLIP,
      vae_name: QI2_VAE,
    });
  });
});

describe("Emotion Studio emotion list", () => {
  const list = [
    emotion("happy", "Smiling"),
    emotion("sad", "Teary eyes"),
    emotion("angry", "Furrowed brows"),
  ];

  it("filters by safe name or description", () => {
    expect(filterEmotions(list, "")).toHaveLength(3);
    expect(filterEmotions(list, "TEAR").map((e) => e.safe_name)).toEqual([
      "sad",
    ]);
    expect(filterEmotions(list, "ang").map((e) => e.safe_name)).toEqual([
      "angry",
    ]);
  });

  it("flips Select ALL to Cancel Selection once all visible are picked", () => {
    expect(selectAllButton([], [])).toEqual({
      action: "none",
      disabled: true,
      label: "No Emotions Found",
    });
    expect(selectAllButton(list, ["happy"]).label).toBe("Select ALL");
    expect(selectAllButton(list, ["happy", "sad", "angry"]).action).toBe(
      "cancel"
    );
  });

  it("summarizes the images a select-all would queue", () => {
    expect(selectVisibleSummary(3, 2, 4)).toBe(
      "Emotions: 3\nCostumes: 2\nPoses: 4\nTotal: 24 images."
    );
  });

  it("shows selected names the list does not know", () => {
    expect(
      selectedEmotionEntries(list, ["sad", "custom_1"]).map((e) => [
        e.safe_name,
        e.description,
      ])
    ).toEqual([
      ["sad", "Teary eyes"],
      ["custom_1", ""],
    ]);
  });

  it("replaces an emotion with the same safe name", () => {
    const next = addEmotionEntry(list, emotion("sad", "New"));
    expect(next.map((e) => e.safe_name)).toEqual(["happy", "angry", "sad"]);
    expect(next.at(-1)?.description).toBe("New");
  });
});
