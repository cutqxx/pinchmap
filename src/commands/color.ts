import { getNode, readColor, withColor, withNodeState } from "../model";
import type { MindMap, NodeColor, NodeId } from "../model";

export interface SetNodeColorArgs {
  readonly nodeId: NodeId;
  readonly color: NodeColor | undefined;
}

/** Clearing a node that has no valid own colour leaves the map untouched, so an unknown stored value survives. */
export function setNodeColor(map: MindMap, { nodeId, color }: SetNodeColorArgs): MindMap {
  const node = getNode(map, nodeId);
  if (readColor(node.state) === color) return map;
  return withNodeState(map, nodeId, withColor(node.state, color));
}
