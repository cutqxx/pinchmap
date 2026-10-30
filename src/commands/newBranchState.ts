import { getNode, withSide } from "../model";
import type { MindMap, NodeId, NodeState, Side } from "../model";

export function stateForNewNode(map: MindMap, parentId: NodeId | null, side: Side): NodeState | undefined {
  const isFirstLevelBranch = parentId !== null && getNode(map, parentId).parentId === null;
  return isFirstLevelBranch ? withSide(undefined, side) : undefined;
}
