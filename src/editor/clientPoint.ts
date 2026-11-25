import type { ScreenPoint } from "../input";

/** Converts a point relative to the canvas into page (client) coordinates, where popups are positioned. */
export function clientPointOf(canvasElement: HTMLElement, point: ScreenPoint): ScreenPoint {
  const bounds = canvasElement.getBoundingClientRect();
  return { x: point.x + bounds.left, y: point.y + bounds.top };
}
