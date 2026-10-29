import { getNode } from "../model";
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
    node.childIds.forEach(measure);
    const childrenHeight = stackedHeight(node.childIds, blockHeights, siblingGap);
    blockHeights.set(id, Math.max(sizeOf(id).height, childrenHeight));
  };
  map.rootIds.forEach((rootId) => getNode(map, rootId).childIds.forEach(measure));
  return blockHeights;
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
