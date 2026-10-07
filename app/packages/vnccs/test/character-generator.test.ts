import { describe, expect, it } from "vitest";
import {
  applyProgressSnapshot,
  beginRegenerate,
  beginRun,
  formatStageStatus,
  type GeneratorData,
  type GeneratorKind,
  GeneratorModel,
  type GeneratorView,
  initialGeneratorView,
  isRunActive,
  missingNativeSeedvrNodes,
  type NodeSchemas,
  nativeSeedvrProblem,
  type ProgressSnapshot,
  parseGeneratorData,
  progressScope,
  regenerateData,
  resetDraftToDefaults,
  schemaInputOptions,
  schemaNodeNames,
  selectPreview,
  serializeGeneratorData,
  settingsFieldOptions,
  updateGeneratorData,
} from "../src/character-generator";

/**
 * A generator wired to a Control Center, like the widget harness in
 * tests/character_generator_resolution.test.mjs: `switchTo` is a model
 * change, `poll` the periodic re-read of the same Control Center state.
 */
function harness(
  options: {
    kind?: GeneratorKind;
    family?: string;
    saved?: Record<string, unknown>;
  } = {}
) {
  const kind = options.kind ?? "base";
  let data = parseGeneratorData(JSON.stringify(options.saved ?? {}));
  let nodeState = { active_kind: options.family ?? "QI2", selected_model: "" };
  const update = (mutate: (model: GeneratorModel) => void) => {
    data = updateGeneratorData(data, kind, mutate);
  };
  const h = {
    get data(): GeneratorData {
      return data;
    },
    get serialized(): GeneratorData {
      return JSON.parse(serializeGeneratorData(data));
    },
    model: () => new GeneratorModel(structuredClone(data), kind),
    sync(): boolean {
      let changed = false;
      update((model) => {
        changed = model.syncModelResolution({ nodeState });
      });
      return changed;
    },
    poll: () => h.sync(),
    switchTo(family: string, model = "") {
      nodeState = { active_kind: family, selected_model: model };
      h.sync();
    },
    set(section: string, key: string, value: unknown) {
      update((model) => model.set(section, key, value));
    },
    reload() {
      data = parseGeneratorData(serializeGeneratorData(data));
    },
  };
  return h;
}

const SECTION = (kind: GeneratorKind) =>
  kind === "clone" ? "common" : "pose_generation";

describe("Character Generator upscaler migration", () => {
  for (const kind of ["base", "clone", "clothes", "emotions"] as const) {
    it(`retires GAN settings to OFF (${kind})`, () => {
      const h = harness({
        kind,
        family: "Klein9b",
        saved: {
          upscaler: { mode: "gan", gan_model: "old.pth", resolution: 3072 },
        },
      });
      expect(h.data.upscaler.mode).toBe("off");
      expect(h.data.upscaler.gan_model).toBeUndefined();
      expect(h.data.upscaler.resolution).toBe(3072);
      const fields = h
        .model()
        .settingsGroups()
        .flatMap((group) => group.fields);
      expect(fields.every((field) => field.key !== "gan_model")).toBe(true);
      if (kind !== "emotions") {
        const mode = fields.find(
          (field) => field.section === "upscaler" && field.key === "mode"
        );
        expect(mode?.type === "select" && mode.options).toEqual([
          "seedvr",
          "off",
        ]);
      }
      h.set("upscaler", "mode", "seedvr");
      h.reload();
      expect(h.data.upscaler.mode).toBe("seedvr");
    });
  }

  it("replaces retired SeedVR models and invalid colour correction", () => {
    const data = parseGeneratorData({
      upscaler: { model: "seedvr2_ema_3b.gguf", color_correction: "hsv" },
    });
    expect(data.upscaler.model).toBe("seedvr2_3b_fp8_e4m3fn.safetensors");
    expect(data.upscaler.color_correction).toBe("lab");
  });

  it("falls back to defaults for unreadable data", () => {
    expect(parseGeneratorData("{bad").pose_generation.target_size).toBe(1024);
    expect(parseGeneratorData(null).ui.selected_preview).toBe(
      "pose_generation"
    );
  });
});

describe("Character Generator background removal", () => {
  for (const kind of ["base", "clone", "clothes", "emotions"] as const) {
    it(`selects Native for QI2 and restores it for other families (${kind})`, () => {
      const h = harness({ kind });
      h.poll();
      expect(h.data.bg_remove.preset).toBe("Native");
      expect(h.serialized.bg_remove.preset).toBe("Native");
      h.switchTo("Klein9b");
      expect(h.data.bg_remove.preset).toBe("balanced");
      h.switchTo("QI2");
      expect(h.data.bg_remove.preset).toBe("Native");
    });
  }

  it("keeps a manual choice through repeated QI2 updates until the family changes", () => {
    const h = harness();
    h.poll();
    h.set("bg_remove", "preset", "strong");
    h.switchTo("QI2");
    h.poll();
    expect(h.data.bg_remove.preset).toBe("strong");
    h.switchTo("Klein9b");
    h.switchTo("QI2");
    expect(h.data.bg_remove.preset).toBe("Native");
  });

  it("repairs Native outside QI2 even with an unchanged model marker", () => {
    const h = harness({
      family: "Anima",
      saved: {
        bg_remove: { preset: "Native" },
        ui: {
          bg_remove_model_kind: "anima",
          bg_remove_previous_preset: "light",
        },
      },
    });
    h.poll();
    expect(h.data.bg_remove.preset).toBe("light");
    h.set("bg_remove", "preset", "Native");
    expect(h.data.bg_remove.preset).toBe("light");
    const preset = h
      .model()
      .settingsGroups()
      .flatMap((group) => group.fields)
      .find((field) => field.section === "bg_remove" && field.key === "preset");
    expect(preset?.type === "select" && preset.options).not.toContain("Native");
  });

  it("falls back to balanced for an invalid saved restoration preset", () => {
    const h = harness({
      family: "Anima",
      saved: {
        bg_remove: { preset: "Native" },
        ui: { bg_remove_previous_preset: "Native" },
      },
    });
    h.poll();
    expect(h.data.bg_remove.preset).toBe("balanced");
  });

  it("hides SAM3 recovery for Native and defaults SAM off", () => {
    const h = harness();
    h.poll();
    const native = h.model().settingsGroups();
    expect(native.some((group) => group.title.includes("SAM3"))).toBe(false);
    expect(
      native
        .flatMap((group) => group.fields)
        .some((field) => field.key === "use_sam3_details_recovery")
    ).toBe(false);
    h.set("bg_remove", "preset", "balanced");
    const chroma = h.model().settingsGroups();
    expect(chroma.some((group) => group.title.includes("SAM3"))).toBe(true);
    expect(h.data.emotion_generation.use_sam).toBe(false);
    expect(h.data.bg_remove.use_sam3_details_recovery).toBe(false);
  });
});

describe("Character Generator QI2 upscaler", () => {
  const upscalerFields = (h: ReturnType<typeof harness>) =>
    h
      .model()
      .settingsGroups()
      .flatMap((group) => group.fields)
      .filter((field) => field.section === "upscaler");

  for (const kind of ["base", "clone", "clothes"] as const) {
    it(`selects QI2 for QI2 pipes and restores the previous mode (${kind})`, () => {
      const h = harness({ kind, saved: { upscaler: { mode: "off" } } });
      h.poll();
      expect(h.serialized.upscaler.mode).toBe("qi2");
      h.switchTo("Klein9b");
      expect(h.data.upscaler.mode).toBe("off");
      h.switchTo("QI2");
      expect(h.data.upscaler.mode).toBe("qi2");
      h.switchTo("MiniMaxH3");
      expect(h.data.upscaler.mode).toBe("off");
    });
  }

  it("keeps a manual choice while the family stays QI2", () => {
    const h = harness();
    h.poll();
    h.set("upscaler", "mode", "seedvr");
    h.poll();
    expect(h.data.upscaler.mode).toBe("seedvr");
    h.switchTo("Klein9b");
    expect(h.data.upscaler.mode).toBe("seedvr");
    h.switchTo("QI2");
    expect(h.data.upscaler.mode).toBe("qi2");
  });

  it("repairs a QI2 mode saved for another family", () => {
    const h = harness({
      family: "Klein9b",
      saved: {
        upscaler: { mode: "qi2" },
        ui: { upscaler_model_kind: "klein9b" },
      },
    });
    h.poll();
    expect(h.data.upscaler.mode).toBe("seedvr");
  });

  it("offers the QI2 mode and its fields only for QI2 pipes", () => {
    const h = harness();
    h.poll();
    const qi2 = upscalerFields(h);
    const mode = qi2.find((field) => field.key === "mode");
    expect(mode?.type === "select" && mode.options).toEqual([
      "qi2",
      "seedvr",
      "off",
    ]);
    expect(qi2.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "qi2_target_size",
        "qi2_prompt",
        "qi2_pass",
        "qi2_detail_denoise",
        "qi2_sampling",
        "qi2_steps",
        "qi2_vae",
        "qi2_alpha",
        "qi2_align",
        "qi2_consistency",
      ])
    );
    expect(h.data.upscaler).toMatchObject({
      qi2_target_size: 4096,
      qi2_pass: "repaint",
      qi2_sampling: "turbo",
      qi2_vae: "texture_fix",
      qi2_alpha: "source",
    });
    h.switchTo("Klein9b");
    expect(
      upscalerFields(h).some((field) => field.key.startsWith("qi2_"))
    ).toBe(false);
  });

  it("leaves the emotions generator's upscaler alone", () => {
    let data = parseGeneratorData({});
    data = updateGeneratorData(data, "emotions", (model) => {
      model.syncModelResolution({ emotionMode: "qi2" });
    });
    expect(data.upscaler.mode).toBe("seedvr");
    expect(data.ui.upscaler_model_kind).toBeUndefined();
  });
});

describe("Character Generator emotion settings", () => {
  function emotions(saved: Record<string, unknown> = {}) {
    let data = parseGeneratorData(saved);
    const sync = () => {
      data = updateGeneratorData(data, "emotions", (model) => {
        model.syncModelResolution({ emotionMode: "qi2" });
      });
    };
    sync();
    return {
      get data() {
        return data;
      },
      sync,
      model: () => new GeneratorModel(structuredClone(data), "emotions"),
      seedQi2Defaults() {
        data = updateGeneratorData(data, "emotions", (model) =>
          model.applyQi2EmotionDefaults()
        );
      },
    };
  }

  it("uses Native and the BBox extractor for a QI2 Emotion Studio", () => {
    const h = emotions();
    h.seedQi2Defaults();
    expect(h.data.bg_remove.preset).toBe("Native");
    expect(h.data.emotion_generation).toMatchObject({
      target_size: 2048,
      bbox_threshold: 0.3,
      bbox_dilation: 50,
      feather: 50,
      drop_size: 10,
    });
    const groups = h.model().settingsGroups();
    const bbox = groups.find((group) =>
      group.title.includes("VNCCS BBox Extractor")
    );
    expect(bbox?.fields.map((field) => field.key)).toEqual([
      "target_size",
      "bbox_threshold",
      "bbox_dilation",
      "feather",
      "drop_size",
    ]);
    expect(groups.some((group) => group.title === "FaceDetailer")).toBe(false);
    const prompt = groups.find((group) =>
      group.title.includes("Emotion Prompt")
    );
    expect(prompt?.fields[0]?.key).toBe("qi2_prompt_template");
    expect(String(h.data.emotion_generation.qi2_prompt_template)).toContain(
      "{emotion}"
    );
  });

  it("offers only the QI2 face pass, even before it follows the Emotion Studio", () => {
    const titles = new GeneratorModel(parseGeneratorData({}), "emotions")
      .settingsGroups()
      .map((group) => group.title);
    expect(titles).toContain("VNCCS BBox Extractor · QI2 Face Generation");
    expect(titles).toContain("VNCCS Emotion Crop Merge");
    expect(titles).not.toContain("FaceDetailer");
    expect(titles).not.toContain("SAMLoader");
  });

  it("keeps saved bbox values; defaults only fill what is missing", () => {
    const h = emotions({
      emotion_generation: { bbox_dilation: 17, feather: 9 },
    });
    expect(h.data.emotion_generation).toMatchObject({
      bbox_dilation: 17,
      feather: 9,
    });
    h.sync();
    expect(h.data.emotion_generation).toMatchObject({
      bbox_dilation: 17,
      feather: 9,
    });
  });

  it("names stages after the emotion pairs", () => {
    const h = emotions();
    expect(h.model().stages()).toEqual([
      { key: "emotion_0001_bg_remove", label: "Emotion" },
    ]);
    const data = updateGeneratorData(h.data, "emotions", (model) => {
      model.data.emotion_pairs = [
        { costume: "Naked", emotion: "angry" },
        { costume: "Simple", emotion: "happy" },
      ];
    });
    const model = new GeneratorModel(data, "emotions");
    expect(model.stages()).toEqual([
      { key: "emotion_0001_bg_remove", label: "Naked / angry" },
      { key: "emotion_0002_bg_remove", label: "Simple / happy" },
    ]);
    expect(model.defaultPreviewStage()).toBe("emotion_0001_bg_remove");
  });

  it("follows the Emotion Studio's character and pairs", () => {
    let data = parseGeneratorData({ character_name: "Old" });
    const sync = (
      source: Parameters<GeneratorModel["syncCharacterSource"]>[0]
    ) => {
      let changed = false;
      data = updateGeneratorData(data, "emotions", (model) => {
        changed = model.syncCharacterSource(source);
      });
      return changed;
    };
    const pairs = [
      { costume: "Naked", emotion: "angry" },
      { costume: "Naked", emotion: "happy" },
      { costume: "Simple", emotion: "angry" },
    ];
    expect(sync({ character: "StudioQA", emotionPairs: pairs })).toBe(true);
    expect(data.character_name).toBe("StudioQA");
    expect(data.emotion_pairs).toEqual(pairs);
    expect(
      new GeneratorModel(data, "emotions").stages().map((stage) => stage.label)
    ).toEqual(["Naked / angry", "Naked / happy", "Simple / angry"]);
    expect(sync({ character: "StudioQA", emotionPairs: pairs })).toBe(false);
    expect(sync({ character: "", emotionPairs: [] })).toBe(true);
    expect(data.character_name).toBe("");
    expect(data.emotion_pairs).toEqual([]);
  });
});

describe("Character Generator resolution per model", () => {
  for (const kind of ["base", "clone", "clothes"] as const) {
    it(`follows the family default resolution (${kind})`, () => {
      const h = harness({ kind });
      const section = SECTION(kind);
      for (const [family, size] of [
        ["QI2", 1024],
        ["MiniMaxH3", 1536],
        ["Klein9b", 1024],
        ["MiniMaxH3", 1536],
        ["QI2", 1024],
      ] as const) {
        h.switchTo(family);
        expect(h.data[section]).toMatchObject({ target_size: size });
        expect(h.serialized[section]).toMatchObject({ target_size: size });
        if (kind === "clone") {
          expect(h.data.pose_generation.target_size).toBe(size);
          expect(h.data.remove_clothes.target_size).toBe(size);
        }
      }
    });
  }

  it("keeps a manual choice through polling, reload and switching back", () => {
    const h = harness();
    h.switchTo("MiniMaxH3");
    h.set("pose_generation", "target_size", 1024);
    h.switchTo("MiniMaxH3");
    h.poll();
    h.reload();
    expect(h.sync()).toBe(false);
    expect(h.data.pose_generation.target_size).toBe(1024);
    h.switchTo("QI2");
    h.switchTo("MiniMaxH3");
    expect(h.data.pose_generation.target_size).toBe(1024);
  });

  it("adapts legacy defaults on load but keeps a saved custom size", () => {
    const defaults = harness({ family: "MiniMaxH3" });
    defaults.poll();
    expect(defaults.data.pose_generation.target_size).toBe(1536);
    const custom = harness({
      family: "MiniMaxH3",
      saved: { pose_generation: { target_size: 2048 } },
    });
    custom.poll();
    expect(custom.data.pose_generation.target_size).toBe(2048);
  });

  for (const kind of ["base", "clone", "clothes"] as const) {
    it(`remembers each model's resolution across changes and reload (${kind})`, () => {
      const h = harness({ kind });
      const section = SECTION(kind);
      h.switchTo("QI2", "Model A");
      h.set(section, "target_size", 2560);
      h.switchTo("QI2", "Model B");
      expect(h.data[section]).toMatchObject({ target_size: 1024 });
      h.set(section, "target_size", 3072);
      h.switchTo("MiniMaxH3", "Model C");
      h.set(section, "target_size", 2048);
      for (const [family, model, size] of [
        ["QI2", "Model A", 2560],
        ["QI2", "Model B", 3072],
        ["MiniMaxH3", "Model C", 2048],
      ] as const) {
        h.switchTo(family, model);
        h.reload();
        h.poll();
        expect(h.data[section]).toMatchObject({ target_size: size });
        expect(h.serialized[section]).toMatchObject({ target_size: size });
        if (kind === "clone") {
          expect(h.data.pose_generation.target_size).toBe(size);
          expect(h.data.remove_clothes.target_size).toBe(size);
        }
      }
    });
  }

  it("remembers settings-dialog edits for the same model", () => {
    const h = harness();
    h.switchTo("QI2", "Model A");
    let data = updateGeneratorData(h.data, "base", (model) => {
      model.data.pose_generation.target_size = 2048;
    });
    data = updateGeneratorData(data, "base", (model) => {
      model.syncModelResolution({
        nodeState: { active_kind: "QI2", selected_model: "Model A" },
      });
      model.syncModelResolution({
        nodeState: { active_kind: "QI2", selected_model: "Model B" },
      });
      model.syncModelResolution({
        nodeState: { active_kind: "QI2", selected_model: "Model A" },
      });
    });
    expect(data.pose_generation.target_size).toBe(2048);
  });

  it("labels pose stages with the family's Pose Studio LoRA", () => {
    const h = harness({ kind: "clone" });
    h.switchTo("Klein9b");
    expect(h.model().stageLoraLabel("naked_pose_generation")).toBe(
      "VNCCS Pose Studio Klein9b"
    );
    h.switchTo("QI2");
    expect(h.model().stageLoraLabel("pose_generation")).toBe(
      "VNCCS Pose Studio QI2"
    );
    expect(h.model().stageLoraLabel("remove_clothes")).toBe(
      "VNCCS Clothes Core"
    );
  });
});

describe("Character Generator settings dialog", () => {
  it("resets only the fields the dialog shows", () => {
    const h = harness();
    h.poll();
    const draft = updateGeneratorData(h.data, "base", (model) => {
      model.data.pose_sampler.steps = 99;
      model.data.ui.selected_preview = "upscaler";
    });
    const groups = new GeneratorModel(draft, "base").settingsGroups();
    const reset = resetDraftToDefaults(draft, groups);
    expect(reset.pose_sampler.steps).toBe(20);
    expect(reset.ui.selected_preview).toBe("upscaler");
  });

  it("lists the current value, static options and live schema options once", () => {
    const field = {
      type: "select" as const,
      section: "pose_sampler",
      key: "sampler_name",
      label: "sampler_name",
      options: ["euler"],
    };
    expect(settingsFieldOptions(field, "dpmpp_2m", ["euler", "ddim"])).toEqual([
      "dpmpp_2m",
      "euler",
      "ddim",
    ]);
  });

  it("strips regenerate markers before a normal queue", () => {
    const data = updateGeneratorData(
      regenerateData(parseGeneratorData({}), {
        stage: "upscaler",
        imageIndex: 2,
        requestId: "r1",
        scope: "wf:VNCCS_CharacterGenerator:7",
      }),
      "base",
      (model) => model.prepareQueuedRun("wf:VNCCS_CharacterGenerator:7")
    );
    const saved = JSON.parse(serializeGeneratorData(data));
    expect(saved.regenerate_from).toBeUndefined();
    expect(saved.regenerate_index).toBeUndefined();
    expect(saved.ui.progress_request_id).toBeUndefined();
    expect(saved.ui.progress_scope).toBe("wf:VNCCS_CharacterGenerator:7");
  });

  it("builds the server progress scope", () => {
    expect(progressScope("wf_1", "clone", "12")).toBe(
      "wf_1:VNCCS_CharacterCloneGenerator:12"
    );
  });
});

describe("Character Generator progress", () => {
  const scope = "wf:VNCCS_CharacterGenerator:17";
  const stages = ["pose_generation", "upscaler", "bg_remove"];
  const context = { nodeId: "17", scope, stageKeys: stages };

  function view(): GeneratorView {
    const data = parseGeneratorData({});
    const model = new GeneratorModel(data, "base");
    return initialGeneratorView(model.stages(), data, "pose_generation");
  }

  function snapshot(patch: Partial<ProgressSnapshot>): ProgressSnapshot {
    return {
      scope,
      node_id: "17",
      epoch: "e1",
      revision: 1,
      run_id: "run1",
      request_id: null,
      stages: {},
      ...patch,
    };
  }

  it("shows phase counts and keeps a manual preview selection", () => {
    let current = selectPreview(view(), "upscaler");
    current = applyProgressSnapshot(
      current,
      snapshot({
        stages: {
          pose_generation: {
            status: "running",
            images: null,
            message: "Encoding poses",
            current: 0,
            total: 12,
          },
        },
      }),
      context
    );
    expect(formatStageStatus(current, "pose_generation", 0)).toBe(
      "Encoding poses (0/12)"
    );
    expect(current.selectedPreview).toBe("upscaler");
    expect(isRunActive(current)).toBe(true);
    current = applyProgressSnapshot(
      current,
      snapshot({
        revision: 2,
        stages: {
          pose_generation: {
            status: "done",
            images: ["/a.png"],
            message: "Generated 12 pose images",
            current: 12,
            total: 12,
          },
        },
      }),
      context
    );
    expect(current.stages.pose_generation?.status).toBe("done");
    expect(current.selectedPreview).toBe("upscaler");
    expect(isRunActive(current)).toBe(false);
  });

  it("follows the newest stage when nothing was picked", () => {
    const current = applyProgressSnapshot(
      view(),
      snapshot({
        stages: {
          pose_generation: { status: "done", images: [], message: "" },
          upscaler: { status: "running", images: null, message: "" },
        },
      }),
      context
    );
    expect(current.selectedPreview).toBe("upscaler");
  });

  it("ignores other nodes, other scopes and older revisions", () => {
    const start = applyProgressSnapshot(
      view(),
      snapshot({ revision: 5 }),
      context
    );
    const running = {
      pose_generation: {
        status: "running" as const,
        images: null,
        message: "",
      },
    };
    for (const stale of [
      snapshot({ node_id: "other", revision: 6, stages: running }),
      snapshot({ scope: "x:y:z", revision: 6, stages: running }),
      snapshot({ revision: 4, stages: running }),
    ]) {
      expect(applyProgressSnapshot(start, stale, context)).toBe(start);
    }
  });

  it("follows the preview again when a new run starts", () => {
    let current = applyProgressSnapshot(view(), snapshot({}), context);
    current = selectPreview(current, "bg_remove");
    current = applyProgressSnapshot(
      current,
      snapshot({
        revision: 2,
        run_id: "run2",
        stages: {
          pose_generation: { status: "running", images: null, message: "" },
        },
      }),
      context
    );
    expect(current.userSelectedPreview).toBe(false);
    expect(current.selectedPreview).toBe("pose_generation");
  });

  it("resets stages and the preview when the app queues a run", () => {
    const picked = selectPreview(view(), "upscaler");
    const next = beginRun(picked, stages, "pose_generation");
    expect(next.selectedPreview).toBe("pose_generation");
    expect(next.userSelectedPreview).toBe(false);
    expect(next.stages.upscaler?.status).toBe("waiting");
  });

  it("marks running stages failed when the server loses the progress", () => {
    const running = applyProgressSnapshot(
      view(),
      snapshot({
        stages: {
          pose_generation: { status: "running", images: null, message: "" },
        },
      }),
      context
    );
    const lost = applyProgressSnapshot(running, null, context);
    expect(lost.stages.pose_generation).toMatchObject({
      status: "error",
      message:
        "Server progress is unavailable. Check the queue before retrying.",
    });
  });

  it("puts a server error on the running stage and shows it", () => {
    const failed = applyProgressSnapshot(
      view(),
      snapshot({
        stages: {
          pose_generation: { status: "done", images: [], message: "" },
          upscaler: { status: "running", images: null, message: "" },
        },
        error: { message: "SeedVR failed", stage: "upscaler" },
      }),
      context
    );
    expect(failed.stages.upscaler).toMatchObject({
      status: "error",
      message: "SeedVR failed",
    });
    expect(failed.selectedPreview).toBe("upscaler");
  });

  it("filters by request id during a regenerate and finishes on the last stage", () => {
    let current = beginRegenerate(view(), stages, "upscaler", null, "req1", 0);
    expect(current.stages.upscaler?.status).toBe("waiting");
    expect(formatStageStatus(current, "upscaler", 3)).toBe(
      "Starting regenerate · 3s"
    );
    expect(formatStageStatus(current, "bg_remove", 3)).toBe(
      "Queued for regenerate"
    );
    const done = {
      pose_generation: { status: "done" as const, images: [], message: "" },
      upscaler: { status: "done" as const, images: [], message: "" },
      bg_remove: { status: "done" as const, images: [], message: "" },
    };
    expect(
      applyProgressSnapshot(
        current,
        snapshot({ request_id: "other", stages: done }),
        context
      )
    ).toBe(current);
    current = applyProgressSnapshot(
      current,
      snapshot({ request_id: "req1", stages: done }),
      context
    );
    expect(current.regenerate).toBeNull();
    expect(isRunActive(current)).toBe(false);
  });

  it("keeps sibling images for a single-image regenerate", () => {
    const withImages: GeneratorView = {
      ...view(),
      stages: {
        ...view().stages,
        bg_remove: { status: "done", images: ["a", "b", "c"], message: "" },
      },
    };
    const next = beginRegenerate(withImages, stages, "bg_remove", 1, "req", 0);
    expect(next.stages.bg_remove?.images).toEqual(["a", "b", "c"]);
    const whole = beginRegenerate(
      withImages,
      stages,
      "bg_remove",
      null,
      "req",
      0
    );
    expect(whole.stages.bg_remove?.images).toBeNull();
  });
});

describe("live node schemas", () => {
  const schemas: NodeSchemas = {
    KSampler: {
      input: { required: { sampler_name: [["euler", "dpmpp_2m"]] } },
    },
    LoadSam3Model: {
      input: {
        optional: { device: ["COMBO", { options: ["auto", "cuda"] }] },
      },
    },
    SeedVR2Preprocess: {},
  };

  it("lists the nodes the settings dialog reads options from", () => {
    const model = new GeneratorModel(parseGeneratorData("{}"), "base");
    const names = schemaNodeNames(model.settingsGroups());
    expect(names).toContain("KSampler");
    expect(names).toContain("SeedVR2PostProcessing");
    expect(new Set(names).size).toBe(names.length);
  });

  it("reads both combo formats", () => {
    expect(schemaInputOptions(schemas, "KSampler", "sampler_name")).toEqual([
      "euler",
      "dpmpp_2m",
    ]);
    expect(schemaInputOptions(schemas, "LoadSam3Model", "device")).toEqual([
      "auto",
      "cuda",
    ]);
    expect(schemaInputOptions(schemas, "Missing", "x")).toEqual([]);
    expect(schemaInputOptions(schemas, undefined, undefined)).toEqual([]);
  });

  it("blocks SeedVR upscaling when the native nodes are missing", () => {
    expect(missingNativeSeedvrNodes(schemas)).toEqual([
      "SeedVR2Conditioning",
      "SeedVR2PostProcessing",
    ]);
    const data = parseGeneratorData("{}");
    expect(nativeSeedvrProblem(data, schemas)).toContain(
      "Missing nodes: SeedVR2Conditioning, SeedVR2PostProcessing"
    );
    expect(nativeSeedvrProblem(data, null)).toBeNull();
    const off = parseGeneratorData({ upscaler: { mode: "off" } });
    expect(nativeSeedvrProblem(off, schemas)).toBeNull();
  });

  it("needs the color correction input on an older post-processing node", () => {
    const older: NodeSchemas = {
      SeedVR2Preprocess: {},
      SeedVR2Conditioning: {},
      SeedVR2PostProcessing: { input: { required: {} } },
    };
    expect(missingNativeSeedvrNodes(older)).toEqual([
      "SeedVR2PostProcessing.color_correction_method",
    ]);
    const current: NodeSchemas = {
      ...older,
      SeedVR2PostProcessing: {
        input: { required: { color_correction_method: [["lab"]] } },
      },
    };
    expect(missingNativeSeedvrNodes(current)).toEqual([]);
  });
});
