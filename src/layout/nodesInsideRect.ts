import { listHiddenNodeIds } from "../model";
import type { MindMap, NodeId } from "../model";
import type { Point, Rect, Size } from "./geometry";
import type { LayoutResult } from "./computeLayout";

/** Visible nodes whose whole box lies inside `rect`, in map order. Partly covered nodes are left out. */
export function nodesInsideRect(
  map: MindMap,
  layout: LayoutResult,
  sizes: ReadonlyMap<NodeId, Size>,
  rect: Rect,
): NodeId[] {
  const hiddenIds = listHiddenNodeIds(map);
  return [...map.nodes.keys()].filter((id) => {
    const position = layout.positions.get(id);
    const size = sizes.get(id);
    if (hiddenIds.has(id) || position === undefined || size === undefined) return false;
    return containsBox(rect, position, size);
  });
}

function containsBox(rect: Rect, topLeft: Point, size: Size): boolean {
  return (
    topLeft.x >= rect.x &&
    topLeft.y >= rect.y &&
    topLeft.x + size.width <= rect.x + rect.width &&
    topLeft.y + size.height <= rect.y + rect.height
  );
}
