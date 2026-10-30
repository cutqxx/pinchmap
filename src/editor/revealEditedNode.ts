import type { Size } from "../layout";
import { intersectRects, panDeltaToReveal } from "../viewport";
import type { Camera, OverflowAlign, Point, Rect } from "../viewport";

export const REVEAL_MARGIN_PX = 8;

export interface RevealRequest {
  readonly camera: Camera;
  readonly canvasRect: Rect;
  readonly nodePosition: Point;
  readonly nodeSize: Size;
  readonly visibleArea: Rect;
  readonly reservedBottomPx: number;
  readonly overflowAlign?: OverflowAlign;
}

export function computeRevealPan(request: RevealRequest): Point {
  const {
    camera,
    canvasRect,
    nodePosition,
    nodeSize,
    visibleArea,
    reservedBottomPx,
    overflowAlign,
  } = request;
  const left = canvasRect.left + camera.x + nodePosition.x * camera.zoom;
  const top = canvasRect.top + camera.y + nodePosition.y * camera.zoom;
  const nodeRect = {
    left,
    top,
    right: left + nodeSize.width * camera.zoom,
    bottom: top + nodeSize.height * camera.zoom,
  };
  const usable = intersectRects(canvasRect, visibleArea);
  return panDeltaToReveal(
    nodeRect,
    { ...usable, bottom: usable.bottom - reservedBottomPx },
    REVEAL_MARGIN_PX,
    overflowAlign === undefined ? undefined : { overflowAlign },
  );
}
