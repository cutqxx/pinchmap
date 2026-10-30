import type { MindMap, NodeId } from "../model";
import type { Point, Size } from "./geometry";
import type { LayoutResult } from "./computeLayout";

/** The topmost node (last in render order) under `worldPoint`, ignoring the dragged node and its descendants. */
export function findDropTarget(
  map: MindMap,
  layout: LayoutResult,
  sizes: ReadonlyMap<NodeId, Size>,
  worldPoint: Point,
  draggedId: NodeId,
): NodeId | null {
  const excluded = branchIds(map, draggedId);
  let target: NodeId | null = null;
  for (const id of map.nodes.keys()) {
    if (excluded.has(id)) continue;
    const position = layout.positions.get(id);
    const size = sizes.get(id);
    if (position !== undefined && size !== undefined && isInside(worldPoint, position, size)) target = id;
  }
  return target;
}

function isInside(point: Point, topLeft: Point, size: Size): boolean {
  return (
    point.x >= topLeft.x &&
    point.x <= topLeft.x + size.width &&
    point.y >= topLeft.y &&
    point.y <= topLeft.y + size.height
  );
}

function branchIds(map: MindMap, rootId: NodeId): Set<NodeId> {
  const ids = new Set<NodeId>();
  const visit = (id: NodeId): void => {
    ids.add(id);
    map.nodes.get(id)?.childIds.forEach(visit);
  };
  visit(rootId);
  return ids;
}
