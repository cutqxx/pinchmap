import type { NodeId } from "../model";
import type { LayoutResult } from "./computeLayout";
import type { Point, Size } from "./geometry";
import { DEFAULT_SPACING } from "./spacing";
import type { LayoutSpacing } from "./spacing";

export function positionBelowRootTree(
  layout: LayoutResult,
  rootId: NodeId,
  rootSize: Size,
  spacing: LayoutSpacing = DEFAULT_SPACING,
): Point | null {
  const rootPosition = layout.positions.get(rootId);
  const heights = layout.sideHeights.get(rootId);
  if (rootPosition === undefined || heights === undefined) return null;
  const treeHeight = Math.max(rootSize.height, heights.left, heights.right);
  const treeBottom = rootPosition.y + rootSize.height / 2 + treeHeight / 2;
  return { x: rootPosition.x, y: treeBottom + spacing.rootGap };
}
