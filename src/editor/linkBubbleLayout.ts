import type { NodeLink } from "../model";
import type { Point, Rect } from "../viewport";

export interface BubbleSize {
  readonly width: number;
  readonly height: number;
}

export const BUBBLE_GAP_PX = 8;
export const BUBBLE_MARGIN_PX = 8;

/** The muted second line of a bubble button: the note name of a wiki link, or only the domain of an external one. */
export function describeLinkTarget(link: NodeLink): string {
  return link.kind === "wiki" ? noteNameOf(link.target) : domainOf(link.target);
}

function noteNameOf(target: string): string {
  return (target.split("#")[0] ?? "").trim() || target;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

/**
 * Where to put the bubble's top-left corner: centred over the node, above it unless the visible
 * area has no room there, and kept inside the area.
 */
export function placeBubble(nodeRect: Rect, bubble: BubbleSize, area: Rect): Point {
  const centredLeft = (nodeRect.left + nodeRect.right) / 2 - bubble.width / 2;
  const above = nodeRect.top - BUBBLE_GAP_PX - bubble.height;
  const hasRoomAbove = above >= area.top + BUBBLE_MARGIN_PX;
  const top = hasRoomAbove ? above : nodeRect.bottom + BUBBLE_GAP_PX;
  return {
    x: clamp(centredLeft, area.left + BUBBLE_MARGIN_PX, area.right - BUBBLE_MARGIN_PX - bubble.width),
    y: clamp(top, area.top + BUBBLE_MARGIN_PX, area.bottom - BUBBLE_MARGIN_PX - bubble.height),
  };
}

/** Keeps `value` between the bounds; when they cross (too little room), the lower bound wins. */
function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(value, upper));
}
