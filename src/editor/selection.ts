import { getNode } from "../model";
import type { MindMap, NodeId } from "../model";

export function selectionAfterDelete(map: MindMap, deletedId: NodeId): NodeId | null {
  const { parentId } = getNode(map, deletedId);
  const siblingIds = parentId === null ? map.rootIds : getNode(map, parentId).childIds;
  const index = siblingIds.indexOf(deletedId);
  return siblingIds[index - 1] ?? siblingIds[index + 1] ?? parentId;
}
