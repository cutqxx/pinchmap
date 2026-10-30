import type { NavigationDirection } from "../input";
import type { LayoutResult } from "../layout";
import { getNode, isNodeCollapsed } from "../model";
import type { MindMap, NodeId, Side } from "../model";

export type { NavigationDirection };

export function navigate(
  map: MindMap,
  layout: LayoutResult,
  selectedId: NodeId | null,
  direction: NavigationDirection,
): NodeId | null {
  if (selectedId === null) return map.rootIds[0] ?? null;
  const target =
    direction === "up" || direction === "down"
      ? adjacentSibling(map, layout, selectedId, direction)
      : horizontalTarget(map, layout, selectedId, direction);
  return target ?? selectedId;
}

function adjacentSibling(
  map: MindMap,
  layout: LayoutResult,
  id: NodeId,
  direction: "up" | "down",
): NodeId | undefined {
  const side = sideOf(map, layout, id);
  const siblings = siblingIdsOf(map, id).filter((siblingId) => sideOf(map, layout, siblingId) === side);
  return siblings[siblings.indexOf(id) + (direction === "up" ? -1 : 1)];
}

function horizontalTarget(
  map: MindMap,
  layout: LayoutResult,
  id: NodeId,
  direction: "left" | "right",
): NodeId | undefined {
  const node = getNode(map, id);
  const side = sideOf(map, layout, id);
  if (side === undefined) return firstChildOnSide(map, layout, id, direction);
  if (side === direction) return isNodeCollapsed(node) ? undefined : node.childIds[0];
  return node.parentId ?? undefined;
}

function firstChildOnSide(
  map: MindMap,
  layout: LayoutResult,
  rootId: NodeId,
  side: Side,
): NodeId | undefined {
  const root = getNode(map, rootId);
  if (isNodeCollapsed(root)) return undefined;
  return root.childIds.find((childId) => sideOf(map, layout, childId) === side);
}

function siblingIdsOf(map: MindMap, id: NodeId): readonly NodeId[] {
  const { parentId } = getNode(map, id);
  return parentId === null ? map.rootIds : getNode(map, parentId).childIds;
}

function sideOf(map: MindMap, layout: LayoutResult, id: NodeId): Side | undefined {
  const { parentId } = getNode(map, id);
  if (parentId === null) return undefined;
  if (getNode(map, parentId).parentId === null) return layout.sides.get(id) ?? "right";
  return sideOf(map, layout, parentId);
}
