import { getNode } from "../model";
import type { MindMap, NodeId, Side } from "../model";
import { shownChildIdsOf, stackedHeight } from "./blockHeights";
import type { SizeOf } from "./blockHeights";
import type { LayoutSpacing } from "./spacing";
import type { Point } from "./geometry";

export interface PlacementContext {
  readonly map: MindMap;
  readonly sizeOf: SizeOf;
  readonly blockHeights: ReadonlyMap<NodeId, number>;
  readonly sides: ReadonlyMap<NodeId, Side>;
  readonly spacing: LayoutSpacing;
  readonly positions: Map<NodeId, Point>;
}

export function placeRootTree(context: PlacementContext, rootId: NodeId, x: number, top: number): void {
  const { map, sides, sizeOf, spacing } = context;
  const blockHeight = blockHeightOf(context, rootId);
  context.positions.set(rootId, { x, y: top + (blockHeight - sizeOf(rootId).height) / 2 });
  const branchIds = shownChildIdsOf(getNode(map, rootId));
  const branchesOn = (side: Side): NodeId[] => branchIds.filter((id) => sides.get(id) === side);
  placeBranches(context, branchesOn("right"), "right", x + sizeOf(rootId).width + spacing.levelGap, top, blockHeight);
  placeBranches(context, branchesOn("left"), "left", x - spacing.levelGap, top, blockHeight);
}

function placeSubtree(context: PlacementContext, id: NodeId, attachX: number, top: number, side: Side): void {
  const { sizeOf, spacing } = context;
  const { width, height } = sizeOf(id);
  const blockHeight = blockHeightOf(context, id);
  const x = side === "right" ? attachX : attachX - width;
  context.positions.set(id, { x, y: top + (blockHeight - height) / 2 });
  const childAttachX = side === "right" ? x + width + spacing.levelGap : x - spacing.levelGap;
  placeBranches(context, shownChildIdsOf(getNode(context.map, id)), side, childAttachX, top, blockHeight);
}

function placeBranches(
  context: PlacementContext,
  branchIds: readonly NodeId[],
  side: Side,
  attachX: number,
  top: number,
  parentBlockHeight: number,
): void {
  const { blockHeights, spacing } = context;
  const stackHeight = stackedHeight(branchIds, blockHeights, spacing.siblingGap);
  let branchTop = top + (parentBlockHeight - stackHeight) / 2;
  for (const branchId of branchIds) {
    placeSubtree(context, branchId, attachX, branchTop, side);
    branchTop += blockHeightOf(context, branchId) + spacing.siblingGap;
  }
}

function blockHeightOf(context: PlacementContext, id: NodeId): number {
  return context.blockHeights.get(id) ?? 0;
}
