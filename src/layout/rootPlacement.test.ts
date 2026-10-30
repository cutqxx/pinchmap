import { describe, expect, it } from "vitest";
import { buildMindMap, withRootPosition } from "../model";
import type { MindMap, NodeEntry } from "../model";
import { computeLayout } from "./computeLayout";
import type { LayoutSpacing } from "./computeLayout";
import type { Size } from "./geometry";
import { positionBelowRootTree } from "./rootPlacement";

const SPACING: LayoutSpacing = { levelGap: 40, siblingGap: 10, rootGap: 30 };
const box = (width: number, height: number): Size => ({ width, height });

function mapOf(entries: NodeEntry[]): MindMap {
  return buildMindMap(entries);
}

function layoutOf(map: MindMap, sizes: Record<string, Size>) {
  return computeLayout(map, new Map(Object.entries(sizes)), SPACING);
}

describe("positionBelowRootTree", () => {
  it("puts a lone root's successor one root gap below the root", () => {
    const map = mapOf([{ id: "r", text: "", parentId: null }]);
    const sizes = { r: box(100, 20) };

    const point = positionBelowRootTree(layoutOf(map, sizes), "r", box(100, 20), SPACING);

    expect(point).toEqual({ x: 0, y: 20 + 30 });
  });

  it("treats the root position as top-left, so the root's top edge is its y", () => {
    const map = mapOf([{ id: "r", text: "", parentId: null, state: { x: 70, y: 200 } }]);
    const sizes = { r: box(100, 20) };

    const point = positionBelowRootTree(layoutOf(map, sizes), "r", box(100, 20), SPACING);

    expect(point).toEqual({ x: 70, y: 200 + 20 + 30 });
  });

  it("lands below the taller right side of a tree with children on both sides", () => {
    const map = mapOf([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r" },
      { id: "b", text: "", parentId: "r", state: { side: "left" } },
      { id: "c", text: "", parentId: "r" },
    ]);
    const sizes = { r: box(100, 20), a: box(80, 40), b: box(80, 30), c: box(80, 50) };
    const layout = layoutOf(map, sizes);

    const point = positionBelowRootTree(layout, "r", box(100, 20), SPACING);

    const rightHeight = 40 + 10 + 50;
    const rootTop = (rightHeight - 20) / 2;
    expect(layout.positions.get("r")).toEqual({ x: 0, y: rootTop });
    expect(point).toEqual({ x: 0, y: 0 + rightHeight + 30 });
  });

  it("lands below the taller left side when the left side is taller", () => {
    const map = mapOf([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r", state: { side: "left" } },
      { id: "b", text: "", parentId: "r", state: { side: "left" } },
      { id: "c", text: "", parentId: "r" },
    ]);
    const sizes = { r: box(100, 20), a: box(80, 40), b: box(80, 40), c: box(80, 10) };

    const point = positionBelowRootTree(layoutOf(map, sizes), "r", box(100, 20), SPACING);

    expect(point).toEqual({ x: 0, y: 40 + 10 + 40 + 30 });
  });

  it("uses the root's own height when it is taller than both sides", () => {
    const map = mapOf([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r" },
    ]);
    const sizes = { r: box(100, 90), a: box(80, 10) };

    const point = positionBelowRootTree(layoutOf(map, sizes), "r", box(100, 90), SPACING);

    expect(point).toEqual({ x: 0, y: 90 + 30 });
  });

  it("lands under the anchor, not under another tree, when the anchor has a saved position", () => {
    const map = mapOf([
      { id: "other", text: "", parentId: null, state: { x: 0, y: 0 } },
      { id: "o1", text: "", parentId: "other" },
      { id: "anchor", text: "", parentId: null, state: withRootPosition(undefined, { x: 2000, y: 0 }) },
    ]);
    const sizes = { other: box(100, 20), o1: box(80, 300), anchor: box(100, 20) };

    const point = positionBelowRootTree(layoutOf(map, sizes), "anchor", box(100, 20), SPACING);

    expect(point).toEqual({ x: 2000, y: 20 + 30 });
  });

  it("returns null when the root is not part of the layout", () => {
    const map = mapOf([{ id: "r", text: "", parentId: null }]);

    expect(positionBelowRootTree(layoutOf(map, { r: box(10, 10) }), "ghost", box(10, 10), SPACING)).toBeNull();
  });
});

describe("unpositioned root inserted right after an unpositioned anchor", () => {
  it("is stacked directly under the anchor's tree and later roots shift down", () => {
    const sizes = { first: box(100, 20), anchor: box(100, 20), a1: box(80, 100), fresh: box(100, 20), last: box(100, 20) };
    const entries = (rootOrder: string[]): NodeEntry[] => [
      ...rootOrder.map((id) => ({ id, text: "", parentId: null })),
      { id: "a1", text: "", parentId: "anchor" },
    ];
    const before = layoutOf(mapOf(entries(["first", "anchor", "last"])), sizes);

    const after = layoutOf(mapOf(entries(["first", "anchor", "fresh", "last"])), sizes);

    const anchorBottom = (after.positions.get("anchor")?.y ?? 0) + 100 / 2;
    expect((after.positions.get("fresh")?.y ?? 0) - 10).toBe(anchorBottom + SPACING.rootGap);
    expect(after.positions.get("anchor")).toEqual(before.positions.get("anchor"));
    expect(after.positions.get("first")).toEqual(before.positions.get("first"));
    expect(after.positions.get("last")?.y).toBeGreaterThan(before.positions.get("last")?.y ?? 0);
  });
});
