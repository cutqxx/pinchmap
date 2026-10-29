import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { NodeEntry, NodeId } from "../model";
import { computeLayout } from "./computeLayout";
import type { LayoutSpacing } from "./computeLayout";
import type { Point, Size } from "./geometry";

const SPACING: LayoutSpacing = { levelGap: 40, siblingGap: 10, rootGap: 30 };

function layout(entries: NodeEntry[], sizes: Record<NodeId, Size>): Map<NodeId, Point> {
  const map = buildMindMap(entries);
  const result = computeLayout(map, new Map(Object.entries(sizes)), SPACING);
  return new Map(result.positions);
}

function pointOf(positions: Map<NodeId, Point>, id: NodeId): Point {
  const point = positions.get(id);
  if (point === undefined) throw new Error(`No position for ${id}`);
  return point;
}

const box = (width: number, height: number): Size => ({ width, height });

describe("computeLayout", () => {
  it("returns no positions for an empty map", () => {
    expect(layout([], {}).size).toBe(0);
  });

  it("places a lone root at the origin", () => {
    const positions = layout([{ id: "r", text: "", parentId: null }], { r: box(100, 20) });

    expect(pointOf(positions, "r")).toEqual({ x: 0, y: 0 });
  });

  it("places a child to the right of its parent separated by the level gap", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
      ],
      { r: box(100, 20), c: box(60, 20) },
    );

    expect(pointOf(positions, "c").x).toBe(140);
  });

  it("places grandchildren one level further right", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
        { id: "g", text: "", parentId: "c" },
      ],
      { r: box(100, 20), c: box(60, 20), g: box(10, 20) },
    );

    expect(pointOf(positions, "g").x).toBe(100 + 40 + 60 + 40);
  });

  it("stacks children of one parent in list order with the sibling gap", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
        { id: "c", text: "", parentId: "r" },
      ],
      { r: box(100, 20), a: box(50, 30), b: box(50, 40), c: box(50, 20) },
    );

    expect(pointOf(positions, "a").y).toBeLessThan(pointOf(positions, "b").y);
    expect(pointOf(positions, "b").y).toBeLessThan(pointOf(positions, "c").y);
    expect(pointOf(positions, "b").y - pointOf(positions, "a").y).toBe(30 + 10);
    expect(pointOf(positions, "c").y - pointOf(positions, "b").y).toBe(40 + 10);
  });

  it("keeps all children of a parent in one column", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
      ],
      { r: box(100, 20), a: box(50, 30), b: box(80, 30) },
    );

    expect(pointOf(positions, "a").x).toBe(pointOf(positions, "b").x);
  });

  it("centers the parent vertically against the block of its children", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
      ],
      { r: box(100, 20), a: box(50, 30), b: box(50, 50) },
    );

    const childrenTop = pointOf(positions, "a").y;
    const childrenBottom = pointOf(positions, "b").y + 50;
    const parentCenter = pointOf(positions, "r").y + 10;
    expect(parentCenter).toBe((childrenTop + childrenBottom) / 2);
  });

  it("centers a single child against its parent", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
      ],
      { r: box(100, 60), c: box(50, 20) },
    );

    expect(pointOf(positions, "c").y + 10).toBe(pointOf(positions, "r").y + 30);
  });

  it("does not let sibling subtrees overlap vertically when one has many descendants", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "a1", text: "", parentId: "a" },
        { id: "a2", text: "", parentId: "a" },
        { id: "a3", text: "", parentId: "a" },
        { id: "b", text: "", parentId: "r" },
      ],
      { r: box(50, 20), a: box(50, 20), a1: box(50, 40), a2: box(50, 40), a3: box(50, 40), b: box(50, 20) },
    );

    const lowestOfA = Math.max(...["a", "a1", "a2", "a3"].map((id) => pointOf(positions, id).y + (id === "a" ? 20 : 40)));
    expect(pointOf(positions, "b").y).toBeGreaterThanOrEqual(lowestOfA + 10);
  });

  it("places several roots one under another without overlap", () => {
    const positions = layout(
      [
        { id: "r1", text: "", parentId: null },
        { id: "c1", text: "", parentId: "r1" },
        { id: "c2", text: "", parentId: "r1" },
        { id: "r2", text: "", parentId: null },
      ],
      { r1: box(50, 20), c1: box(50, 40), c2: box(50, 40), r2: box(50, 20) },
    );

    const firstTreeBottom = Math.max(pointOf(positions, "c1").y + 40, pointOf(positions, "c2").y + 40, pointOf(positions, "r1").y + 20);
    expect(pointOf(positions, "r2").y).toBeGreaterThanOrEqual(firstTreeBottom + 30);
    expect(pointOf(positions, "r2").x).toBe(0);
  });

  it("gives every node a position", () => {
    const entries: NodeEntry[] = [
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r" },
      { id: "b", text: "", parentId: "a" },
      { id: "r2", text: "", parentId: null },
    ];

    expect([...layout(entries, {}).keys()].sort()).toEqual(["a", "b", "r", "r2"]);
  });

  it("treats nodes without a measured size as zero sized instead of failing", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
      ],
      {},
    );

    expect(pointOf(positions, "c")).toEqual({ x: 40, y: 0 });
  });

  it("uses default spacing when none is given", () => {
    const map = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "c", text: "", parentId: "r" },
    ]);

    const { positions } = computeLayout(map, new Map([["r", box(100, 20)], ["c", box(10, 20)]]));

    expect(positions.get("c")?.x).toBeGreaterThan(100);
  });
});
