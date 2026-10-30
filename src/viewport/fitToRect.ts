import type { Camera } from "./camera";
import type { Rect } from "./revealRect";

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

export function fitToRect(
  contentRect: Rect,
  viewportSize: ViewportSize,
  margin: number,
  zoomLimits: ZoomLimits,
): Camera {
  const contentWidth = contentRect.right - contentRect.left;
  const contentHeight = contentRect.bottom - contentRect.top;
  const zoom = clampTo(
    zoomLimits,
    Math.min(
      (viewportSize.width - 2 * margin) / contentWidth,
      (viewportSize.height - 2 * margin) / contentHeight,
    ),
  );
  const centerX = (contentRect.left + contentRect.right) / 2;
  const centerY = (contentRect.top + contentRect.bottom) / 2;
  return {
    zoom,
    x: viewportSize.width / 2 - centerX * zoom,
    y: viewportSize.height / 2 - centerY * zoom,
  };
}

function clampTo({ min, max }: ZoomLimits, zoom: number): number {
  return Math.min(max, Math.max(min, zoom));
}
