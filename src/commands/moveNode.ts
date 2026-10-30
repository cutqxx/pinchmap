import { getNode, readManualPosition, withManualPosition, withNodeState } from "../model";
import type { ManualPosition, MindMap, NodeId } from "../model";

export interface SetNodePositionArgs {
  readonly nodeId: NodeId;
  readonly position: ManualPosition;
}

export function setNodePosition(map: MindMap, { nodeId, position }: SetNodePositionArgs): MindMap {
  const state = getNode(map, nodeId).state;
  const current = readManualPosition(state);
  if (current?.x === position.x && current.y === position.y) return map;
  return withNodeState(map, nodeId, withManualPosition(state, position));
}
