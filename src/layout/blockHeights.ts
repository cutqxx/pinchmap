import { getNode, isNodeCollapsed } from "../model";
import type { MapNode } from "../model";
import type { MindMap, NodeId } from "../model";
import type { Size } from "./geometry";

export type SizeOf = (id: NodeId) => Size;

export function measureBranchHeights(
  map: MindMap,
  sizeOf: SizeOf,
  siblingGap: number,
): Map<NodeId, number> {
  const blockHeights = new Map<NodeId, number>();
  const measure = (id: NodeId): void => {
    const node = getNode(map, id);
    const shownChildIds = shownChildIdsOf(node);
    shownChildIds.forEach(measure);
    const childrenHeight = stackedHeight(shownChildIds, blockHeights, siblingGap);
    blockHeights.set(id, Math.max(sizeOf(id).height, childrenHeight));
  };
  map.rootIds.forEach((rootId) => shownChildIdsOf(getNode(map, rootId)).forEach(measure));
  return blockHeights;
}

/** A collapsed node takes only its own space: its children are not part of the layout. */
export function shownChildIdsOf(node: MapNode): readonly NodeId[] {
  return isNodeCollapsed(node) ? [] : node.childIds;
}

export function stackedHeight(
  ids: readonly NodeId[],
  blockHeights: ReadonlyMap<NodeId, number>,
  gap: number,
): number {
  if (ids.length === 0) return 0;
  const total = ids.reduce((sum, id) => sum + (blockHeights.get(id) ?? 0), 0);
  return total + gap * (ids.length - 1);
}
