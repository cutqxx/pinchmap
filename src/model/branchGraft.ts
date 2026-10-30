import { getNode } from "./mindMap";
import type { MindMap } from "./mindMap";
import type { NodeId } from "./nodeId";

export type BranchPlacement =
  | { readonly kind: "lastChildOf"; readonly parentId: NodeId }
  | { readonly kind: "after"; readonly anchorId: NodeId }
  | { readonly kind: "newRoot" };

/** Attaches every tree of `forest` (its `rootIds`, in order) to `map`; the forest's node IDs must not exist in `map`. */
export function withBranchesAttached(map: MindMap, forest: MindMap, placement: BranchPlacement): MindMap {
  const parentId = parentIdFor(map, placement);
  const nodes = new Map(map.nodes);
  forest.nodes.forEach((node, id) => nodes.set(id, forest.rootIds.includes(id) ? { ...node, parentId } : node));
  if (parentId === null) {
    return { rootIds: insertIds(map.rootIds, forest.rootIds, placement), nodes };
  }
  const parent = getNode(map, parentId);
  nodes.set(parentId, { ...parent, childIds: insertIds(parent.childIds, forest.rootIds, placement) });
  return { rootIds: map.rootIds, nodes };
}

function parentIdFor(map: MindMap, placement: BranchPlacement): NodeId | null {
  switch (placement.kind) {
    case "lastChildOf":
      return placement.parentId;
    case "after":
      return getNode(map, placement.anchorId).parentId;
    case "newRoot":
      return null;
  }
}

function insertIds(existing: readonly NodeId[], newIds: readonly NodeId[], placement: BranchPlacement): NodeId[] {
  if (placement.kind !== "after") return [...existing, ...newIds];
  const insertAt = existing.indexOf(placement.anchorId) + 1;
  return [...existing.slice(0, insertAt), ...newIds, ...existing.slice(insertAt)];
}
