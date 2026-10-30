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

export function withNewRoot(map: MindMap, entry: NewSiblingEntry): MindMap {
  const nodes = new Map(map.nodes);
  const { state, ...fields } = entry;
  nodes.set(entry.id, { ...fields, parentId: null, childIds: [], ...(state === undefined ? {} : { state }) });
  return { rootIds: [...map.rootIds, entry.id], nodes };
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

/** The whole map reduced to the one root `rootId`: no children, empty text, no stored state. */
export function withOnlyBlankRoot(map: MindMap, rootId: NodeId): MindMap {
  const { id } = getNode(map, rootId);
  return { rootIds: [id], nodes: new Map([[id, { id, text: "", parentId: null, childIds: [] }]]) };
}

export function isOnlyBlankRoot(map: MindMap): boolean {
  const [rootId] = map.rootIds;
  const root = rootId === undefined ? undefined : map.nodes.get(rootId);
  return map.nodes.size === 1 && root !== undefined && root.text === "" && root.state === undefined;
}

function collectBranchIds(map: MindMap, branch: MapNode): NodeId[] {
  return [branch.id, ...branch.childIds.flatMap((childId) => collectBranchIds(map, getNode(map, childId)))];
}

function insertAfter(ids: readonly NodeId[], anchorId: NodeId, newId: NodeId): NodeId[] {
  const insertAt = ids.indexOf(anchorId) + 1;
  return [...ids.slice(0, insertAt), newId, ...ids.slice(insertAt)];
}

/** Moves a branch to be the last child of `newParentId`; a move into the branch itself is ignored. */
export function withMovedBranch(
  map: MindMap,
  branchId: NodeId,
  newParentId: NodeId,
  state: NodeState | undefined,
): MindMap {
  const branch = getNode(map, branchId);
  if (collectBranchIds(map, branch).includes(newParentId)) return map;
  const withoutOldLink = withoutLinkToParent(map, branch);
  const nodes = new Map(withoutOldLink.nodes);
  const newParent = getNode(withoutOldLink, newParentId);
  nodes.set(newParentId, { ...newParent, childIds: [...newParent.childIds, branchId] });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { state: _previousState, isSidePending: _isSidePending, ...fields } = branch;
  nodes.set(branchId, { ...fields, parentId: newParentId, ...(state === undefined ? {} : { state }) });
  return { rootIds: withoutOldLink.rootIds, nodes };
}

function withoutLinkToParent(map: MindMap, branch: MapNode): MindMap {
  if (branch.parentId === null) {
    return { rootIds: map.rootIds.filter((id) => id !== branch.id), nodes: map.nodes };
  }
  const parent = getNode(map, branch.parentId);
  const nodes = new Map(map.nodes);
  nodes.set(parent.id, { ...parent, childIds: parent.childIds.filter((id) => id !== branch.id) });
  return { rootIds: map.rootIds, nodes };
}
