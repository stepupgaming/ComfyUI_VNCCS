/** A link to another node's output: `[nodeId, outputIndex]`. */
export type NodeLink = [nodeId: string, outputIndex: number];

export type InputValue = string | number | boolean | NodeLink;

export interface PromptNode {
  class_type: string;
  inputs: Record<string, InputValue>;
}

/** ComfyUI prompt (API) format, keyed by node id. */
export type ApiPrompt = Record<string, PromptNode>;

export function link(nodeId: string, outputIndex: number): NodeLink {
  return [nodeId, outputIndex];
}

export function isLink(value: InputValue | undefined): value is NodeLink {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  );
}

/** Widgets store their state as JSON strings; accept either form. */
export function jsonInput(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
