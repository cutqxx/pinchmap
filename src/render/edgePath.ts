import type { Point } from "../layout";

export function edgePath(start: Point, end: Point): string {
  const controlX = (start.x + end.x) / 2;
  return `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`;
}
