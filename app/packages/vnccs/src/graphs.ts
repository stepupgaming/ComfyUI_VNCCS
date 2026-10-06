import { type ApiPrompt, jsonInput, link } from "./prompt";

/**
 * Builders for the shipped VNCCS workflows. Node ids match
 * `workflows/VNCCS_3.2_*.json` on purpose: generator nodes key their pose
 * caches and progress events by node id, so keeping the ids lets the app and
 * the legacy workflows share cached stages.
 */

export const DEFAULT_REPO_ID = "MIUProject/VNCCS_v3.0";

/** Widget state is serialized as JSON; callers may pass either form. */
export type JsonState = string | object;

export interface ControlCenterInput {
  nodeState: JsonState;
  repoId?: string;
}

export interface PoseStudioInput {
  animationImageBatch?: boolean;
  poseData: JsonState;
}

export interface WidgetInput {
  widgetData: JsonState;
}

/** Output slots shared by the character source nodes (Creator, Cloner, Clothes Designer). */
const SOURCE = { character: 0, sheetsPath: 1, background: 2 } as const;
const POSE = { images: 0, lightingPrompt: 1 } as const;
const PIPE = 0;

interface CharacterStepIds {
  controlCenter: string;
  generator: string;
  pose: string;
  source: string;
}

interface CharacterStepSpec {
  generatorClass: string;
  ids: CharacterStepIds;
  sourceClass: string;
  sourceInputs?: ApiPrompt[string]["inputs"];
}

export interface CharacterStepInput {
  controlCenter: ControlCenterInput;
  generator: WidgetInput;
  poseStudio: PoseStudioInput;
  source: WidgetInput;
}

function controlCenterNode(input: ControlCenterInput): ApiPrompt[string] {
  return {
    class_type: "VNCCS_ControlCenter",
    inputs: {
      repo_id: input.repoId ?? DEFAULT_REPO_ID,
      node_state: jsonInput(input.nodeState),
    },
  };
}

/** Control Center -> source -> Pose Studio -> generator, the shape of Steps 1, 1.1 and 2. */
function characterStep(
  spec: CharacterStepSpec,
  input: CharacterStepInput
): ApiPrompt {
  const { ids } = spec;
  return {
    [ids.controlCenter]: controlCenterNode(input.controlCenter),
    [ids.source]: {
      class_type: spec.sourceClass,
      inputs: {
        ...spec.sourceInputs,
        widget_data: jsonInput(input.source.widgetData),
      },
    },
    [ids.pose]: {
      class_type: "VNCCS_PoseStudio",
      inputs: {
        pose_data: jsonInput(input.poseStudio.poseData),
        animation_image_batch: input.poseStudio.animationImageBatch ?? false,
        pose_image: link(ids.source, SOURCE.character),
      },
    },
    [ids.generator]: {
      class_type: spec.generatorClass,
      inputs: {
        poses: link(ids.pose, POSE.images),
        character: link(ids.source, SOURCE.character),
        pipe: link(ids.controlCenter, PIPE),
        sheets_path: link(ids.source, SOURCE.sheetsPath),
        prompt: link(ids.pose, POSE.lightingPrompt),
        background: link(ids.source, SOURCE.background),
        widget_data: jsonInput(input.generator.widgetData),
      },
    },
  };
}

export const CREATOR_IDS = {
  controlCenter: "812",
  source: "818",
  pose: "703",
  generator: "798",
} as const;

/** Step 1: Character Creator V2. */
export function buildCharacterCreatorPrompt(
  input: CharacterStepInput
): ApiPrompt {
  return characterStep(
    {
      ids: CREATOR_IDS,
      sourceClass: "CharacterCreatorV2",
      generatorClass: "VNCCS_CharacterGenerator",
    },
    input
  );
}

export const CLONER_IDS = {
  controlCenter: "771",
  source: "774",
  pose: "761",
  generator: "776",
} as const;

/** Step 1.1: Character Cloner. */
export function buildCharacterClonerPrompt(
  input: CharacterStepInput
): ApiPrompt {
  return characterStep(
    {
      ids: CLONER_IDS,
      sourceClass: "CharacterCloner",
      generatorClass: "VNCCS_CharacterCloneGenerator",
    },
    input
  );
}

export const CLOTHES_IDS = {
  controlCenter: "758",
  source: "753",
  pose: "728",
  generator: "751",
  preview: "752",
} as const;

/** Step 2: Clothes Designer. The designer also takes the pipe and feeds a preview node. */
export function buildClothesPrompt(input: CharacterStepInput): ApiPrompt {
  const prompt = characterStep(
    {
      ids: CLOTHES_IDS,
      sourceClass: "ClothesDesigner",
      generatorClass: "VNCCS_ClothesGenerator",
      sourceInputs: { pipe: link(CLOTHES_IDS.controlCenter, PIPE) },
    },
    input
  );
  prompt[CLOTHES_IDS.preview] = {
    class_type: "PreviewImage",
    inputs: { images: link(CLOTHES_IDS.source, SOURCE.character) },
  };
  return prompt;
}

export const EMOTION_IDS = { source: "404", generator: "405" } as const;

export interface EmotionStepInput {
  generator: WidgetInput;
  source: {
    character: string;
    costumes: string[];
    emotions: string[];
    generationModel: string;
    generationSettings: JsonState;
    promptStyle: string;
  };
}

/** Step 3: Emotion Studio. EmotionGeneratorV2 builds its own pipe from its settings. */
export function buildEmotionPrompt(input: EmotionStepInput): ApiPrompt {
  const { source } = input;
  return {
    [EMOTION_IDS.source]: {
      class_type: "EmotionGeneratorV2",
      inputs: {
        generation_model: source.generationModel,
        generation_settings: jsonInput(source.generationSettings),
        prompt_style: source.promptStyle,
        character: source.character,
        costumes_data: JSON.stringify(source.costumes),
        emotions_data: JSON.stringify(source.emotions),
      },
    },
    [EMOTION_IDS.generator]: {
      class_type: "VNCCS_EmotionsGenerator",
      inputs: {
        images: link(EMOTION_IDS.source, 0),
        pipe: link(EMOTION_IDS.source, 1),
        emotion_data: link(EMOTION_IDS.source, 2),
        widget_data: jsonInput(input.generator.widgetData),
      },
    },
  };
}

/** Migration Assistant: a single output node; the work happens over its REST routes. */
export function buildMigrationPrompt(): ApiPrompt {
  return { "1": { class_type: "VNCCS_MigrationAssistant", inputs: {} } };
}
