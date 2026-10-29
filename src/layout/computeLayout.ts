import { getNode, readRootPosition } from "../model";
import type { MindMap, NodeId, Side } from "../model";
import { measureBranchHeights } from "./blockHeights";
import { pickSideForNewBranch, resolveRootSides } from "./branchSides";
import type { SideHeights } from "./branchSides";
import type { Point, Size } from "./geometry";
import { DEFAULT_SPACING } from "./spacing";
import type { LayoutSpacing } from "./spacing";
import { placeRootTree } from "./treePlacement";
import type { PlacementContext } from "./treePlacement";

export { DEFAULT_SPACING };
export type { LayoutSpacing };

export interface LayoutResult {
  readonly positions: ReadonlyMap<NodeId, Point>;
  readonly sides: ReadonlyMap<NodeId, Side>;
  readonly sideHeights: ReadonlyMap<NodeId, SideHeights>;
}

const UNMEASURED_SIZE: Size = { width: 0, height: 0 };

export function computeLayout(
  map: MindMap,
  sizes: ReadonlyMap<NodeId, Size>,
  spacing: LayoutSpacing = DEFAULT_SPACING,
): LayoutResult {
  const sizeOf = (id: NodeId): Size => sizes.get(id) ?? UNMEASURED_SIZE;
  const blockHeights = measureBranchHeights(map, sizeOf, spacing.siblingGap);
  const sides = new Map<NodeId, Side>();
  const sideHeights = new Map<NodeId, SideHeights>();
  for (const rootId of map.rootIds) {
    const resolved = resolveRootSides(map, rootId, blockHeights, spacing.siblingGap);
    resolved.sides.forEach((side, id) => sides.set(id, side));
    sideHeights.set(rootId, resolved.heights);
    blockHeights.set(rootId, Math.max(sizeOf(rootId).height, resolved.heights.left, resolved.heights.right));
  }
  const positions = new Map<NodeId, Point>();
  placeRoots({ map, sizeOf, blockHeights, sides, spacing, positions });
  return { positions, sides, sideHeights };
}

export function chooseSideForNewBranch(layout: LayoutResult, rootId: NodeId): Side {
  return pickSideForNewBranch(layout.sideHeights.get(rootId));
}

function placeRoots(context: PlacementContext): void {
  const { map, spacing } = context;
  const positionedRoots = map.rootIds.flatMap((rootId) => {
    const position = readRootPosition(getNode(map, rootId).state);
    return position === undefined ? [] : [{ rootId, position }];
  });
  const rootsWithoutPosition = map.rootIds.filter(
    (id) => !positionedRoots.some(({ rootId }) => rootId === id),
  );
  let nextTop = placePositionedRoots(context, positionedRoots);
  for (const rootId of rootsWithoutPosition) {
    placeRootTree(context, rootId, 0, nextTop);
    nextTop += (context.blockHeights.get(rootId) ?? 0) + spacing.rootGap;
  }
}

function placePositionedRoots(
  context: PlacementContext,
  roots: readonly { readonly rootId: NodeId; readonly position: { readonly x: number; readonly y: number } }[],
): number {
  let bottomEdge = Number.NEGATIVE_INFINITY;
  for (const { rootId, position } of roots) {
    const blockHeight = context.blockHeights.get(rootId) ?? 0;
    const top = position.y + context.sizeOf(rootId).height / 2 - blockHeight / 2;
    placeRootTree(context, rootId, position.x, top);
    bottomEdge = Math.max(bottomEdge, top + blockHeight);
  }
  return roots.length === 0 ? 0 : bottomEdge + context.spacing.rootGap;
}
