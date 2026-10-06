import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type ControlCenterCatalog,
  describeModules,
} from "../src/control-center";
import {
  DEFAULT_QI2_MODEL,
  type NodeState,
  parseNodeState,
  resolveStatus,
  updateNodeState,
  variantPrefixLength,
  viewNodeState,
} from "../src/control-center-state";
import { partitionDownloads } from "../src/download-guard";
import { liveCatalog, VIGGLE_TURBO } from "./fixtures/catalog";

/** The catalog the legacy widget tests (tests/control_center_unet.test.mjs) use. */
function widgetTestCatalog(): ControlCenterCatalog {
  return {
    ...liveCatalog(),
    models: [
      { name: "Other QI2", type: "unet", kind: "QI2" },
      { name: DEFAULT_QI2_MODEL, type: "unet", kind: "QI2" },
      { name: "Flux Klein", type: "unet", kind: "Klein9b" },
    ],
    lora: [{ name: VIGGLE_TURBO, type: "TurboLora", kind: "QI2" }],
  };
}

function save(
  state: NodeState,
  catalog: ControlCenterCatalog,
  mutate: Parameters<typeof updateNodeState>[2] = () => undefined
): NodeState {
  return updateNodeState(state, catalog, mutate);
}

describe("Control Center node_state (ported widget tests)", () => {
  it("defaults QI2 to native UNet, 25 steps and CFG 3", () => {
    const model = viewNodeState({}, widgetTestCatalog());
    expect(model.modelTypeTabs()).toEqual(["unet", "custom"]);
    expect(model.selectedType()).toBe("unet");
    expect(model.selectedModelEntry()?.name).toBe(DEFAULT_QI2_MODEL);
    expect(model.modelParams()).toMatchObject({ steps: 25, cfg: 3 });
  });

  it("switches QI2 to 6 steps and CFG 1 with Viggle Turbo, then restores", () => {
    const catalog = widgetTestCatalog();
    const on = save({}, catalog, (model) =>
      model.selectTurboLora(VIGGLE_TURBO, true)
    );
    const onModel = viewNodeState(on, catalog);
    expect(onModel.modelParams()).toMatchObject({ steps: 6, cfg: 1 });
    expect(onModel.loraState(VIGGLE_TURBO).auto_apply).toBe(true);
    expect(on.model_params?.turbo_previous_settings).toEqual({
      steps: 25,
      cfg: 3,
    });

    const off = save(on, catalog, (model) =>
      model.selectTurboLora(VIGGLE_TURBO, false)
    );
    expect(viewNodeState(off, catalog).modelParams()).toMatchObject({
      steps: 25,
      cfg: 3,
      turbo_previous_settings: null,
    });
  });

  it("marks a legacy QIE2511 selection unsupported until changed", () => {
    const catalog = widgetTestCatalog();
    const saved = save(
      parseNodeState(
        JSON.stringify({
          selected_type: "gguf",
          selected_model: "Qwen-Image-Edit-2511-GGUF-Q5",
        })
      ),
      catalog
    );
    expect(saved.active_kind).toBe("QI2");
    expect(saved.unsupported_model_kind).toBe("QIE2511");
    expect(viewNodeState(saved, catalog).selectedModelEntry()?.name).toBe(
      DEFAULT_QI2_MODEL
    );
    const dismissed = save(saved, catalog, (model) =>
      model.dismissUnsupportedKind()
    );
    expect(dismissed.unsupported_model_kind).toBeUndefined();
  });

  it("keeps native selections and custom mode across restore", () => {
    const catalog = widgetTestCatalog();
    const native = parseNodeState({
      active_kind: "QI2",
      selected_type: "unet",
      selected_model: "Other QI2",
    });
    expect(viewNodeState(native, catalog).selectedModelEntry()?.name).toBe(
      "Other QI2"
    );
    const custom = viewNodeState(
      parseNodeState({
        active_kind: "QI2",
        selected_types_by_kind: { QI2: "custom" },
      }),
      catalog
    );
    expect(custom.selectedType()).toBe("custom");
    expect(custom.customContextModelEntry().name).toBe(DEFAULT_QI2_MODEL);
  });

  it("serializes QI2 defaults for a new Control Center", () => {
    const saved = save({}, widgetTestCatalog());
    expect(saved).toMatchObject({
      active_kind: "QI2",
      selected_type: "unet",
      selected_model: DEFAULT_QI2_MODEL,
      selected_models: { "QI2:unet": DEFAULT_QI2_MODEL },
      model_params: {
        steps: 25,
        cfg: 3,
        sampler: "euler",
        scheduler: "simple",
      },
    });
  });

  it("persists QI2 cache settings over the gpu/int8 defaults", () => {
    const catalog = widgetTestCatalog();
    expect(viewNodeState({}, catalog).qi2Cache()).toEqual({
      device: "gpu",
      dtype: "int8",
    });
    const saved = save({}, catalog, (model) =>
      model.setQi2Cache({ device: "cpu", dtype: "int4" })
    );
    expect(saved.qi2_cache).toEqual({ device: "cpu", dtype: "int4" });
    expect(
      viewNodeState({ qi2_cache: { device: "bogus" } }, catalog).qi2Cache()
    ).toEqual({ device: "gpu", dtype: "int8" });
  });
});

describe("shipped workflows", () => {
  const directory = new URL("../../../../workflows/", import.meta.url);
  const states: { file: string; state: NodeState }[] = [];
  for (const file of readdirSync(directory).filter((name) =>
    name.endsWith(".json")
  )) {
    const workflow = JSON.parse(readFileSync(new URL(file, directory), "utf8"));
    for (const node of workflow.nodes) {
      if (node.type === "VNCCS_ControlCenter") {
        states.push({ file, state: JSON.parse(node.widgets_values[1]) });
      }
    }
  }

  it("all select the QI2 default model", () => {
    expect(states).toHaveLength(3);
    for (const { file, state } of states) {
      const turbo = state.loras?.some(
        (lora) => lora.name === VIGGLE_TURBO && lora.auto_apply
      );
      expect(state.active_kind, file).toBe("QI2");
      expect(state.selected_model, file).toBe(DEFAULT_QI2_MODEL);
      expect(state.model_params, file).toMatchObject(
        turbo ? { steps: 6, cfg: 1 } : { steps: 25, cfg: 3 }
      );
      expect(state.model_params_by_kind?.QI2, file).toEqual(state.model_params);
    }
  });

  it("re-save to the same node_state the widget wrote", () => {
    for (const { file, state } of states) {
      expect(save(parseNodeState(state), liveCatalog()), file).toEqual(state);
    }
  });
});

describe("model families on the live catalog", () => {
  it("gives each family its own selection and parameters", () => {
    const catalog = liveCatalog();
    const h3 = save({}, catalog, (model) => model.setActiveKind("MiniMaxH3"));
    const h3Model = viewNodeState(h3, catalog);
    expect(h3.active_kind).toBe("MiniMaxH3");
    expect(h3Model.selectedModelEntry()?.name).toBe(
      "MiniMax H3 Ref2VA Pruned FP8 Scaled"
    );
    expect(h3.model_params).toEqual({
      steps: 20,
      cfg: 1,
      sampler: "res_multistep",
      scheduler: "simple",
    });

    const int8 = save(h3, catalog, (model) =>
      model.chooseVariant("unet", "MiniMax H3 Ref2VA Pruned INT8 ConvRot")
    );
    expect(int8.selected_models?.["MiniMaxH3:unet"]).toBe(
      "MiniMax H3 Ref2VA Pruned INT8 ConvRot"
    );

    const back = save(int8, catalog, (model) => model.setActiveKind("QI2"));
    expect(back.selected_model).toBe(DEFAULT_QI2_MODEL);
    expect(back.model_params).toMatchObject({ steps: 25, cfg: 3 });
    expect(back.model_params_by_kind?.MiniMaxH3).toMatchObject({ steps: 20 });
    expect(back.selected_types_by_kind).toEqual({
      QI2: "unet",
      MiniMaxH3: "unet",
    });
  });

  it("keeps turbo LoRAs exclusive within the selected family", () => {
    const catalog = liveCatalog();
    const qi2 = save({}, catalog, (model) =>
      model.selectTurboLora(VIGGLE_TURBO, true)
    );
    expect(qi2.loras?.map((lora) => lora.name)).toEqual([VIGGLE_TURBO]);
    const h3 = save(qi2, catalog, (model) => {
      model.setActiveKind("MiniMaxH3");
    });
    const h3Turbo = save(h3, catalog, (model) =>
      model.selectTurboLora("TaoMate-H3 3-Step LoRA", true)
    );
    expect(h3Turbo.model_params).toMatchObject({ steps: 4, cfg: 1 });
    expect(viewNodeState(h3Turbo, catalog).loraState(VIGGLE_TURBO)).toEqual({
      name: VIGGLE_TURBO,
      auto_apply: true,
      strength: 1,
    });
  });

  it("lists helper LoRA files for other nodes", () => {
    expect(viewNodeState({}, liveCatalog()).helperLoraOptions()).toEqual([
      "QI2.1/VNCCS/VNCCS_QI2_PoseStudioV1.1.safetensors",
      "QI2.1/VNCCS/VNCCS_QI2_ClothesCoreV2.6.safetensors",
    ]);
  });

  it("offers family downloads that the guard filters", () => {
    const catalog = liveCatalog();
    const qi2 = viewNodeState({}, catalog).downloadAllCandidates();
    expect(qi2.map(({ entry }) => entry.name)).toEqual([
      "VNCCS Pose Studio QI2",
      "VNCCS Clothes Core QI2",
      VIGGLE_TURBO,
    ]);

    const h3 = viewNodeState(
      save({}, catalog, (model) => model.setActiveKind("MiniMaxH3")),
      catalog
    ).downloadAllCandidates();
    const { allowed, blocked } = partitionDownloads(h3);
    expect(blocked.map(({ entry }) => entry.name)).toEqual([
      "MiniMax H3 Ref2VA Pruned FP8 Scaled",
    ]);
    expect(blocked[0]?.reason).toContain("MiniMax H3");
    expect(allowed.map(({ entry }) => entry.name)).toEqual([
      "MiniMax H3 Pose Studio",
      "TaoMate-H3 3-Step LoRA",
    ]);
  });

  it("splits custom LoRAs by family", () => {
    const catalog = liveCatalog();
    catalog.lora.push(
      { name: "Mine", custom: true, kind: "QI2", status: "installed" },
      { name: "Any", custom: true, kind: "Custom", status: "installed" },
      { name: "H3 only", custom: true, kind: "MiniMaxH3", status: "installed" }
    );
    expect(
      viewNodeState({}, catalog)
        .customLoras()
        .map((entry) => entry.name)
    ).toEqual(["Mine", "Any"]);
  });
});

describe("restore migrations", () => {
  it("maps the legacy enabled flag to auto_apply", () => {
    const state = parseNodeState({
      loras: [
        { name: "a", enabled: false },
        { name: "b", enabled: true },
      ],
    });
    expect(state.loras?.map((lora) => lora.auto_apply)).toEqual([false, true]);
  });

  it("treats invalid JSON as a new node", () => {
    expect(parseNodeState("{not json")).toEqual({
      active_kind: "QI2",
      selected_types_by_kind: {},
      output_slot_names: [],
    });
  });
});

describe("display helpers", () => {
  it("lets transient download phases win over the catalog", () => {
    expect(resolveStatus({ status: "downloading" }, "missing")).toBe(
      "downloading"
    );
    expect(resolveStatus({ status: "success" }, "missing")).toBe("missing");
    expect(resolveStatus(undefined, undefined)).toBe("missing");
  });

  it("strips the shared variant prefix", () => {
    const names = [
      "MiniMax H3 Ref2VA Pruned FP8 Scaled",
      "MiniMax H3 Ref2VA Pruned INT8 ConvRot",
    ];
    const length = variantPrefixLength(names);
    expect(names.map((name) => name.slice(length))).toEqual([
      "FP8 Scaled",
      "INT8 ConvRot",
    ]);
    expect(variantPrefixLength(["model_a_fp8", "model_a_bf16"])).toBe(8);
  });

  it("classifies module status like the widget", () => {
    const { pills, notices } = describeModules({
      main: { version: "3.2.3" },
      utils: {
        duplicate: true,
        duplicate_folders: ["a", "b"],
        version: "0.6.9",
      },
      dependencies: {
        easy_sam3: { label: "Easy SAM3", status: "ok" },
        impact_pack: {
          label: "Impact Pack",
          status: "missing",
          missing_nodes: ["FaceDetailer"],
          github_url: "https://github.com/ltdrdata/ComfyUI-Impact-Pack",
        },
      },
    });
    expect(
      pills.map(({ label, state, missing }) => [label, state, missing])
    ).toEqual([
      ["VNCCS", "ok", false],
      ["Utils", "dup", false],
      ["Easy SAM3", "ok", false],
      ["Impact Pack", "error", true],
    ]);
    expect(pills[3]?.detail).toBe("missing: FaceDetailer");
    expect(notices).toEqual(["Utils: duplicate folders (a, b)"]);
  });
});
