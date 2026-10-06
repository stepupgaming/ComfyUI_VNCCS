import { readFileSync } from "node:fs";
import { type ApiPrompt, isLink } from "../src/prompt";

interface LegacyNode {
  id: number;
  inputs?: { name: string; link: number | null }[];
  type: string;
  widgets_values?: unknown[];
}

export interface LegacyWorkflow {
  links: [number, number, number, number, number, string][];
  nodes: LegacyNode[];
}

const workflowsDir = new URL("../../../../workflows/", import.meta.url);

export function readLegacyWorkflow(name: string): LegacyWorkflow {
  return JSON.parse(
    readFileSync(new URL(name, workflowsDir), "utf8")
  ) as LegacyWorkflow;
}

/** Serialized widget order per node type; trailing DOM widgets are not serialized. */
const WIDGET_NAMES: Record<string, string[]> = {
  VNCCS_ControlCenter: ["repo_id", "node_state"],
  CharacterCreatorV2: ["widget_data"],
  CharacterCloner: ["widget_data"],
  ClothesDesigner: ["widget_data"],
  VNCCS_PoseStudio: ["pose_data", "animation_image_batch"],
  VNCCS_CharacterGenerator: ["prompt", "background", "widget_data"],
  VNCCS_CharacterCloneGenerator: ["prompt", "background", "widget_data"],
  VNCCS_ClothesGenerator: ["prompt", "background", "widget_data"],
  EmotionGeneratorV2: [
    "generation_model",
    "generation_settings",
    "prompt_style",
    "character",
    "costumes_data",
    "emotions_data",
  ],
  VNCCS_EmotionsGenerator: ["widget_data"],
  VNCCS_MigrationAssistant: [],
  PreviewImage: [],
};

export function nodeOfType(workflow: LegacyWorkflow, type: string): LegacyNode {
  const node = workflow.nodes.find((candidate) => candidate.type === type);
  if (!node) {
    throw new Error(`workflow has no ${type} node`);
  }
  return node;
}

/** Widget values of a node by input name, skipping widgets converted to links. */
export function widgetValues(node: LegacyNode): Record<string, unknown> {
  const names = WIDGET_NAMES[node.type];
  if (!names) {
    throw new Error(`no widget layout for ${node.type}`);
  }
  const linked = new Set(
    (node.inputs ?? [])
      .filter((input) => input.link !== null)
      .map((input) => input.name)
  );
  const values: Record<string, unknown> = {};
  names.forEach((name, index) => {
    if (!linked.has(name)) {
      values[name] = node.widgets_values?.[index];
    }
  });
  return values;
}

export interface Topology {
  edges: string[];
  nodes: Record<string, string>;
}

export function legacyTopology(workflow: LegacyWorkflow): Topology {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const edges = workflow.links.map(([, from, fromSlot, to, toSlot]) => {
    const input = byId.get(to)?.inputs?.[toSlot];
    if (!input) {
      throw new Error(`link into missing input ${to}[${toSlot}]`);
    }
    return `${from}:${fromSlot}->${to}.${input.name}`;
  });
  return {
    nodes: Object.fromEntries(
      workflow.nodes.map((node) => [String(node.id), node.type])
    ),
    edges: edges.sort(),
  };
}

export function promptTopology(prompt: ApiPrompt): Topology {
  const edges: string[] = [];
  for (const [id, node] of Object.entries(prompt)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isLink(value)) {
        edges.push(`${value[0]}:${value[1]}->${id}.${name}`);
      }
    }
  }
  return {
    nodes: Object.fromEntries(
      Object.entries(prompt).map(([id, node]) => [id, node.class_type])
    ),
    edges: edges.sort(),
  };
}
