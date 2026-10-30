import type { LayoutResult, Size } from "../layout";
import type { NodeId } from "../model";
import type { Rect } from "../viewport";

export function contentBounds(
  layout: LayoutResult,
  sizes: ReadonlyMap<NodeId, Size>,
): Rect | null {
  let bounds: Rect | null = null;
  for (const [id, position] of layout.positions) {
    const size = sizes.get(id) ?? { width: 0, height: 0 };
    bounds = unionRects(bounds, {
      left: position.x,
      top: position.y,
      right: position.x + size.width,
      bottom: position.y + size.height,
    });
  }
  return bounds;
}

function unionRects(a: Rect | null, b: Rect): Rect {
  if (a === null) return b;
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}
