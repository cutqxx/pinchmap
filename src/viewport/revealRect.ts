import type { Point } from "./camera";

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function intersectRects(a: Rect, b: Rect): Rect {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

export type OverflowAlign = "start" | "end";

export interface RevealOptions {
  readonly overflowAlign: OverflowAlign;
}

const DEFAULT_REVEAL_OPTIONS: RevealOptions = { overflowAlign: "start" };

export function panDeltaToReveal(
  node: Rect,
  visible: Rect,
  margin: number,
  { overflowAlign }: RevealOptions = DEFAULT_REVEAL_OPTIONS,
): Point {
  return {
    x: axisDeltaToReveal(
      node.left,
      node.right,
      visible.left,
      visible.right,
      margin,
      overflowAlign,
    ),
    y: axisDeltaToReveal(
      node.top,
      node.bottom,
      visible.top,
      visible.bottom,
      margin,
      overflowAlign,
    ),
  };
}

function axisDeltaToReveal(
  nodeStart: number,
  nodeEnd: number,
  visibleStart: number,
  visibleEnd: number,
  margin: number,
  overflowAlign: OverflowAlign,
): number {
  const allowedStart = visibleStart + margin;
  const allowedEnd = visibleEnd - margin;
  const isTallerThanAllowed = nodeEnd - nodeStart > allowedEnd - allowedStart;
  if (isTallerThanAllowed)
    return overflowAlign === "end"
      ? allowedEnd - nodeEnd
      : allowedStart - nodeStart;
  if (nodeStart < allowedStart) return allowedStart - nodeStart;
  if (nodeEnd > allowedEnd) return allowedEnd - nodeEnd;
  return 0;
}
