import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap, NodeEntry, NodeId } from "../model";
import { computeLayout } from "./computeLayout";
import type { LayoutResult } from "./computeLayout";
import { findDropTarget } from "./dropTarget";
import type { Point, Size } from "./geometry";

const SIZE: Size = { width: 60, height: 20 };
const SIZES = new Map<NodeId, Size>(["r", "a", "a1", "a1x", "b", "c", "r2", "r2c"].map((id) => [id, SIZE]));

const TREE: NodeEntry[] = [
  { id: "r", text: "", parentId: null },
  { id: "a", text: "", parentId: "r" },
  { id: "a1", text: "", parentId: "a" },
  { id: "a1x", text: "", parentId: "a1" },
  { id: "b", text: "", parentId: "r" },
];

function layoutOf(map: MindMap): LayoutResult {
  return computeLayout(map, SIZES);
}

function positionOf(layout: LayoutResult, id: NodeId): Point {
  const point = layout.positions.get(id);
  if (point === undefined) throw new Error(`No position for ${id}`);
  return point;
}

function centerOf(layout: LayoutResult, id: NodeId): Point {
  const { x, y } = positionOf(layout, id);
  return { x: x + SIZE.width / 2, y: y + SIZE.height / 2 };
}

function targetAt(map: MindMap, point: Point, draggedId: NodeId, sizes = SIZES): NodeId | null {
  return findDropTarget(map, layoutOf(map), sizes, point, draggedId);
}

describe("findDropTarget hit test", () => {
  const map = buildMindMap(TREE);
  const layout = layoutOf(map);

  it("returns the node whose box contains the point", () => {
    expect(findDropTarget(map, layout, SIZES, centerOf(layout, "b"), "a")).toBe("b");
  });

  it("returns null for a point in empty space", () => {
    expect(findDropTarget(map, layout, SIZES, { x: -5000, y: -5000 }, "a")).toBeNull();
  });

  it("includes the top-left corner", () => {
    expect(findDropTarget(map, layout, SIZES, positionOf(layout, "b"), "a")).toBe("b");
  });

  it("includes the bottom-right corner", () => {
    const { x, y } = positionOf(layout, "b");

    expect(findDropTarget(map, layout, SIZES, { x: x + SIZE.width, y: y + SIZE.height }, "a")).toBe("b");
  });

  it("misses a point one pixel past the right edge", () => {
    const { x, y } = positionOf(layout, "b");

    expect(findDropTarget(map, layout, SIZES, { x: x + SIZE.width + 1, y }, "a")).toBeNull();
  });

  it("misses a point one pixel past the bottom edge", () => {
    const { x, y } = positionOf(layout, "b");

    expect(findDropTarget(map, layout, SIZES, { x, y: y + SIZE.height + 1 }, "a")).toBeNull();
  });

  it("misses a point one pixel before the left edge", () => {
    const { x, y } = positionOf(layout, "b");

    expect(findDropTarget(map, layout, SIZES, { x: x - 1, y }, "a")).toBeNull();
  });

  it("misses a point one pixel above the top edge", () => {
    const { x, y } = positionOf(layout, "b");

    expect(findDropTarget(map, layout, SIZES, { x, y: y - 1 }, "a")).toBeNull();
  });

  it("ignores nodes that have no measured size", () => {
    expect(targetAt(map, centerOf(layout, "b"), "a", new Map())).toBeNull();
  });

  it("returns the last node in map order when boxes overlap", () => {
    const overlapping = buildMindMap([
      { id: "r", text: "", parentId: null, state: { x: 0, y: 0 } },
      { id: "r2", text: "", parentId: null, state: { x: 30, y: 5 } },
      { id: "c", text: "", parentId: null, state: { x: 20, y: 0 } },
    ]);
    const overlapLayout = layoutOf(overlapping);

    expect(findDropTarget(overlapping, overlapLayout, SIZES, { x: 40, y: 10 }, "c")).toBe("r2");
  });

  it("returns the earlier node where the later overlapping node does not reach", () => {
    const overlapping = buildMindMap([
      { id: "r", text: "", parentId: null, state: { x: 0, y: 0 } },
      { id: "r2", text: "", parentId: null, state: { x: 30, y: 5 } },
      { id: "c", text: "", parentId: null, state: { x: 500, y: 500 } },
    ]);

    expect(findDropTarget(overlapping, layoutOf(overlapping), SIZES, { x: 10, y: 10 }, "c")).toBe("r");
  });
});

describe("findDropTarget exclusions", () => {
  const map = buildMindMap(TREE);
  const layout = layoutOf(map);

  it("never returns the dragged node even with the point on it", () => {
    expect(findDropTarget(map, layout, SIZES, centerOf(layout, "a"), "a")).toBeNull();
  });

  it("never returns a child of the dragged node", () => {
    expect(findDropTarget(map, layout, SIZES, centerOf(layout, "a1"), "a")).toBeNull();
  });

  it("never returns a deeper descendant of the dragged node", () => {
    expect(findDropTarget(map, layout, SIZES, centerOf(layout, "a1x"), "a")).toBeNull();
  });

  it("still returns the parent of the dragged node", () => {
    expect(findDropTarget(map, layout, SIZES, centerOf(layout, "r"), "a")).toBe("r");
  });

  it("still returns a sibling subtree when the dragged node is a descendant elsewhere", () => {
    expect(findDropTarget(map, layout, SIZES, centerOf(layout, "a1"), "b")).toBe("a1");
  });

  it("falls through a descendant to a node that overlaps it underneath", () => {
    const stacked = buildMindMap([
      { id: "r", text: "", parentId: null, state: { x: 0, y: 0 } },
      { id: "a", text: "", parentId: "r", state: { x: 0, y: 0 } },
      { id: "r2", text: "", parentId: null, state: { x: 0, y: 0 } },
      { id: "a1", text: "", parentId: "a", state: { x: 0, y: 0 } },
    ]);
    const stackedLayout = layoutOf(stacked);

    expect(findDropTarget(stacked, stackedLayout, SIZES, centerOf(stackedLayout, "r2"), "a")).toBe("r2");
  });

  it("excludes a whole root tree when a root is dragged", () => {
    const twoRoots = buildMindMap([...TREE, { id: "r2", text: "", parentId: null }, { id: "r2c", text: "", parentId: "r2" }]);
    const twoLayout = layoutOf(twoRoots);

    expect(findDropTarget(twoRoots, twoLayout, SIZES, centerOf(twoLayout, "a1"), "r")).toBeNull();
    expect(findDropTarget(twoRoots, twoLayout, SIZES, centerOf(twoLayout, "r2c"), "r")).toBe("r2c");
  });
});

describe("layout of a node that was just reparented", () => {
  const BEFORE = buildMindMap(TREE);
  const UNDER_B = buildMindMap(TREE.map((entry) => (entry.id === "a" ? { ...entry, parentId: "b" } : entry)));

  it("places a node without a position at its auto-layout slot under the new parent", () => {
    const stalePosition = TREE.map((entry) => (entry.id === "a" ? { ...entry, parentId: "b", state: { x: 300, y: 300 } } : entry));
    const clearedPosition = layoutOf(UNDER_B).positions.get("a");

    expect(clearedPosition).not.toEqual(layoutOf(buildMindMap(stalePosition)).positions.get("a"));
  });

  it("places the moved node to the right of its new parent", () => {
    const result = layoutOf(UNDER_B);

    expect(positionOf(result, "a").x).toBeGreaterThan(positionOf(result, "b").x + SIZE.width);
  });

  it("moves the children of the moved node along with it", () => {
    const before = layoutOf(BEFORE);
    const moved = layoutOf(UNDER_B);

    const offsetBefore = positionOf(before, "a1").x - positionOf(before, "a").x;
    expect(positionOf(moved, "a1").x - positionOf(moved, "a").x).toBe(offsetBefore);
    expect(positionOf(moved, "a").x).not.toBe(positionOf(before, "a").x);
  });

  it("keeps the offset of a pinned descendant relative to its moved parent", () => {
    const withPinnedChild = buildMindMap(
      TREE.map((entry) => {
        if (entry.id === "a") return { ...entry, parentId: "b" };
        return entry.id === "a1" ? { ...entry, state: { x: 77, y: 88 } } : entry;
      }),
    );
    const result = layoutOf(withPinnedChild);

    expect(positionOf(result, "a1")).toEqual({ x: positionOf(result, "a").x + 77, y: positionOf(result, "a").y + 88 });
  });

  it("puts a branch on the left of a root when the left side is stored", () => {
    const moved = buildMindMap(TREE.map((entry) => (entry.id === "a1" ? { ...entry, parentId: "r", state: { side: "left" } } : entry)));
    const result = layoutOf(moved);

    expect(positionOf(result, "a1").x).toBeLessThan(positionOf(result, "r").x);
  });
});
