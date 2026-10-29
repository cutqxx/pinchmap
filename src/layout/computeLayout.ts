import { getNode } from "../model";
import type { MindMap, NodeId } from "../model";
import type { Point, Size } from "./geometry";

export interface LayoutResult {
  readonly positions: ReadonlyMap<NodeId, Point>;
}

export interface LayoutSpacing {
  readonly levelGap: number;
  readonly siblingGap: number;
  readonly rootGap: number;
}

export const DEFAULT_SPACING: LayoutSpacing = { levelGap: 48, siblingGap: 12, rootGap: 48 };

const UNMEASURED_SIZE: Size = { width: 0, height: 0 };

export function computeLayout(
  map: MindMap,
  sizes: ReadonlyMap<NodeId, Size>,
  spacing: LayoutSpacing = DEFAULT_SPACING,
): LayoutResult {
  const sizeOf = (id: NodeId): Size => sizes.get(id) ?? UNMEASURED_SIZE;
  const blockHeights = measureBlockHeights(map, sizeOf, spacing.siblingGap);
  const positions = new Map<NodeId, Point>();

  const place = (id: NodeId, left: number, top: number): void => {
    const node = getNode(map, id);
    const blockHeight = blockHeights.get(id) ?? 0;
    positions.set(id, { x: left, y: top + (blockHeight - sizeOf(id).height) / 2 });
    const childrenHeight = stackedHeight(node.childIds, blockHeights, spacing.siblingGap);
    let childTop = top + (blockHeight - childrenHeight) / 2;
    for (const childId of node.childIds) {
      place(childId, left + sizeOf(id).width + spacing.levelGap, childTop);
      childTop += (blockHeights.get(childId) ?? 0) + spacing.siblingGap;
    }
  };

  let rootTop = 0;
  for (const rootId of map.rootIds) {
    place(rootId, 0, rootTop);
    rootTop += (blockHeights.get(rootId) ?? 0) + spacing.rootGap;
  }
  return { positions };
}

function measureBlockHeights(
  map: MindMap,
  sizeOf: (id: NodeId) => Size,
  siblingGap: number,
): Map<NodeId, number> {
  const blockHeights = new Map<NodeId, number>();
  const measure = (id: NodeId): void => {
    const node = getNode(map, id);
    node.childIds.forEach(measure);
    const childrenHeight = stackedHeight(node.childIds, blockHeights, siblingGap);
    blockHeights.set(id, Math.max(sizeOf(id).height, childrenHeight));
  };
  map.rootIds.forEach(measure);
  return blockHeights;
}

function stackedHeight(
  ids: readonly NodeId[],
  blockHeights: ReadonlyMap<NodeId, number>,
  gap: number,
): number {
  if (ids.length === 0) return 0;
  const total = ids.reduce((sum, id) => sum + (blockHeights.get(id) ?? 0), 0);
  return total + gap * (ids.length - 1);
}
