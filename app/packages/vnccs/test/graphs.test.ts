import { describe, expect, it } from "vitest";
import {
  buildCharacterClonerPrompt,
  buildCharacterCreatorPrompt,
  buildClothesPrompt,
  buildEmotionPrompt,
  buildMigrationPrompt,
  type CharacterStepInput,
} from "../src/graphs";
import type { ApiPrompt } from "../src/prompt";
import {
  type LegacyWorkflow,
  legacyTopology,
  nodeOfType,
  promptTopology,
  readLegacyWorkflow,
  widgetValues,
} from "./legacy-workflow";

function characterStepInput(
  workflow: LegacyWorkflow,
  sourceType: string,
  generatorType: string
): CharacterStepInput {
  const controlCenter = widgetValues(
    nodeOfType(workflow, "VNCCS_ControlCenter")
  );
  const pose = widgetValues(nodeOfType(workflow, "VNCCS_PoseStudio"));
  return {
    controlCenter: {
      repoId: controlCenter.repo_id as string,
      nodeState: controlCenter.node_state as string,
    },
    source: {
      widgetData: widgetValues(nodeOfType(workflow, sourceType))
        .widget_data as string,
    },
    poseStudio: {
      poseData: pose.pose_data as string,
      animationImageBatch: pose.animation_image_batch as boolean,
    },
    generator: {
      widgetData: widgetValues(nodeOfType(workflow, generatorType))
        .widget_data as string,
    },
  };
}

/** Every serialized widget of the legacy workflow reaches the prompt unchanged. */
function expectWidgetsCarried(workflow: LegacyWorkflow, prompt: ApiPrompt) {
  for (const node of workflow.nodes) {
    const inputs = prompt[String(node.id)]?.inputs;
    expect(inputs, `node ${node.id}`).toBeDefined();
    for (const [name, value] of Object.entries(widgetValues(node))) {
      expect(inputs?.[name], `${node.type}.${name}`).toEqual(value);
    }
  }
}

const characterSteps = [
  {
    file: "VNCCS_3.2_Step1_CharacterCreator.json",
    source: "CharacterCreatorV2",
    generator: "VNCCS_CharacterGenerator",
    build: buildCharacterCreatorPrompt,
  },
  {
    file: "VNCCS_3.2_Step1_CharacterCloner.json",
    source: "CharacterCloner",
    generator: "VNCCS_CharacterCloneGenerator",
    build: buildCharacterClonerPrompt,
  },
  {
    file: "VNCCS_3.2_Step2_CharacterClothes.json",
    source: "ClothesDesigner",
    generator: "VNCCS_ClothesGenerator",
    build: buildClothesPrompt,
  },
];

describe("character step graphs match the shipped workflows", () => {
  for (const step of characterSteps) {
    it(step.file, () => {
      const workflow = readLegacyWorkflow(step.file);
      const prompt = step.build(
        characterStepInput(workflow, step.source, step.generator)
      );
      expect(promptTopology(prompt)).toEqual(legacyTopology(workflow));
      expectWidgetsCarried(workflow, prompt);
    });
  }
});

describe("emotion graph matches the shipped workflow", () => {
  it("VNCCS_3.2_Step3_CharacterEmotions.json", () => {
    const workflow = readLegacyWorkflow(
      "VNCCS_3.2_Step3_CharacterEmotions.json"
    );
    const source = widgetValues(nodeOfType(workflow, "EmotionGeneratorV2"));
    const prompt = buildEmotionPrompt({
      source: {
        generationModel: source.generation_model as string,
        generationSettings: source.generation_settings as string,
        promptStyle: source.prompt_style as string,
        character: source.character as string,
        costumes: JSON.parse(source.costumes_data as string),
        emotions: JSON.parse(source.emotions_data as string),
      },
      generator: {
        widgetData: widgetValues(
          nodeOfType(workflow, "VNCCS_EmotionsGenerator")
        ).widget_data as string,
      },
    });
    expect(promptTopology(prompt)).toEqual(legacyTopology(workflow));
    expectWidgetsCarried(workflow, prompt);
  });
});

describe("migration graph", () => {
  it("matches the shipped workflow", () => {
    const workflow = readLegacyWorkflow("VNCCS_MigrationAssistant.json");
    expect(promptTopology(buildMigrationPrompt())).toEqual(
      legacyTopology(workflow)
    );
  });
});

describe("widget state serialization", () => {
  it("serializes object state to JSON strings", () => {
    const prompt = buildCharacterCreatorPrompt({
      controlCenter: { nodeState: { active_kind: "QI2" } },
      source: { widgetData: { character: "Alice" } },
      poseStudio: { poseData: { schema_version: 3 } },
      generator: { widgetData: { common: { target_size: 1024 } } },
    });
    expect(prompt["812"]?.inputs).toEqual({
      repo_id: "MIUProject/VNCCS_v3.0",
      node_state: '{"active_kind":"QI2"}',
    });
    expect(prompt["818"]?.inputs.widget_data).toBe('{"character":"Alice"}');
    expect(prompt["703"]?.inputs.animation_image_batch).toBe(false);
  });
});
