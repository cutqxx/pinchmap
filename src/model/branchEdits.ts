import { getNode } from "./mindMap";
import type { MapNode, MindMap } from "./mindMap";
import type { NodeId } from "./nodeId";
import type { NodeState } from "./nodeState";

export interface NewSiblingEntry {
  readonly id: NodeId;
  readonly text: string;
  readonly state?: NodeState;
}

export function withNewSibling(map: MindMap, anchorId: NodeId, entry: NewSiblingEntry): MindMap {
  const anchor = getNode(map, anchorId);
  const nodes = new Map(map.nodes);
  const { state, ...fields } = entry;
  nodes.set(entry.id, { ...fields, parentId: anchor.parentId, childIds: [], ...(state === undefined ? {} : { state }) });
  if (anchor.parentId === null) {
    return { rootIds: insertAfter(map.rootIds, anchorId, entry.id), nodes };
  }
  const parent = getNode(map, anchor.parentId);
  nodes.set(parent.id, { ...parent, childIds: insertAfter(parent.childIds, anchorId, entry.id) });
  return { rootIds: map.rootIds, nodes };
}

export function withoutBranch(map: MindMap, branchId: NodeId): MindMap {
  const branch = getNode(map, branchId);
  const nodes = new Map(map.nodes);
  collectBranchIds(map, branch).forEach((id) => nodes.delete(id));
  if (branch.parentId === null) {
    return { rootIds: map.rootIds.filter((id) => id !== branchId), nodes };
  }
  const parent = getNode(map, branch.parentId);
  nodes.set(parent.id, { ...parent, childIds: parent.childIds.filter((id) => id !== branchId) });
  return { rootIds: map.rootIds, nodes };
}

function collectBranchIds(map: MindMap, branch: MapNode): NodeId[] {
  return [branch.id, ...branch.childIds.flatMap((childId) => collectBranchIds(map, getNode(map, childId)))];
}

function insertAfter(ids: readonly NodeId[], anchorId: NodeId, newId: NodeId): NodeId[] {
  const insertAt = ids.indexOf(anchorId) + 1;
  return [...ids.slice(0, insertAt), newId, ...ids.slice(insertAt)];
}
