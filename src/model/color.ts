import { getNode } from "./mindMap";
import type { MindMap } from "./mindMap";
import type { NodeId } from "./nodeId";
import type { JsonObject, NodeState } from "./nodeState";

export const NODE_COLORS = ["red", "orange", "yellow", "green", "cyan", "purple"] as const;

export type NodeColor = (typeof NODE_COLORS)[number];

const COLOR_KEY = "color";

function isNodeColor(value: unknown): value is NodeColor {
  return NODE_COLORS.some((color) => color === value);
}

/** An unknown value, e.g. from an external edit, reads as no colour. */
export function readColor(state: NodeState | undefined): NodeColor | undefined {
  const value = state?.[COLOR_KEY];
  return isNodeColor(value) ? value : undefined;
}

export function withColor(state: NodeState | undefined, color: NodeColor | undefined): NodeState | undefined {
  const otherFields = Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => key !== COLOR_KEY));
  const updated: JsonObject = color === undefined ? otherFields : { ...otherFields, [COLOR_KEY]: color };
  return Object.keys(updated).length === 0 ? undefined : updated;
}

/** The node's own colour, or else the colour of its nearest coloured ancestor. */
export function effectiveColor(map: MindMap, id: NodeId): NodeColor | undefined {
  const node = getNode(map, id);
  return readColor(node.state) ?? (node.parentId === null ? undefined : effectiveColor(map, node.parentId));
}
