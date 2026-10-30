import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { NodeEntry, NodeId } from "../model";
import { computeLayout } from "./computeLayout";
import type { LayoutSpacing } from "./computeLayout";
import type { Point, Size } from "./geometry";

const SPACING: LayoutSpacing = { levelGap: 40, siblingGap: 10, rootGap: 30 };
const SIZES = new Map<NodeId, Size>(
  ["r", "a", "a1", "a2", "b", "r2", "r2c"].map((id) => [id, { width: 60, height: 20 }]),
);

const TREE: NodeEntry[] = [
  { id: "r", text: "", parentId: null },
  { id: "a", text: "", parentId: "r" },
  { id: "a1", text: "", parentId: "a" },
  { id: "a2", text: "", parentId: "a" },
  { id: "b", text: "", parentId: "r" },
];

function positionsOf(entries: NodeEntry[]): Map<NodeId, Point> {
  return new Map(computeLayout(buildMindMap(entries), SIZES, SPACING).positions);
}

function at(positions: Map<NodeId, Point>, id: NodeId): Point {
  const point = positions.get(id);
  if (point === undefined) throw new Error(`No position for ${id}`);
  return point;
}

function withState(id: NodeId, state: Record<string, number>): NodeEntry[] {
  return TREE.map((entry) => (entry.id === id ? { ...entry, state } : entry));
}

function shift(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}

describe("manual positions in the layout", () => {
  const auto = positionsOf(TREE);

  it("places a pinned non-root at its parent's position plus the stored offset", () => {
    const moved = positionsOf(withState("b", { x: 15, y: 200 }));

    expect(at(moved, "b")).toEqual(shift(at(moved, "r"), 15, 200));
  });

  it("moves the children of a moved node along with it", () => {
    const moved = positionsOf(withState("a", { x: 15, y: 200 }));
    const dx = at(moved, "a").x - at(auto, "a").x;
    const dy = at(moved, "a").y - at(auto, "a").y;

    expect(at(moved, "a1")).toEqual(shift(at(auto, "a1"), dx, dy));
    expect(at(moved, "a2")).toEqual(shift(at(auto, "a2"), dx, dy));
  });

  it("does not move siblings or the parent of a moved node", () => {
    const moved = positionsOf(withState("a", { x: 15, y: 200 }));

    expect(at(moved, "b")).toEqual(at(auto, "b"));
    expect(at(moved, "r")).toEqual(at(auto, "r"));
  });

  it("keeps the offset of a pinned descendant relative to its parent when the ancestor moves", () => {
    const entries = TREE.map((entry) => {
      if (entry.id === "a") return { ...entry, state: { x: 15, y: 200 } };
      if (entry.id === "a1") return { ...entry, state: { x: 70, y: -30 } };
      return entry;
    });

    const moved = positionsOf(entries);

    expect(at(moved, "a1")).toEqual(shift(at(moved, "a"), 70, -30));
  });

  it("moves a pinned descendant when the ancestor offset changes without changing its own offset", () => {
    const pinnedChild = (parentOffset: Record<string, number>): NodeEntry[] =>
      TREE.map((entry) => {
        if (entry.id === "a") return { ...entry, state: parentOffset };
        if (entry.id === "a1") return { ...entry, state: { x: 70, y: -30 } };
        return entry;
      });

    const first = positionsOf(pinnedChild({ x: 15, y: 200 }));
    const second = positionsOf(pinnedChild({ x: 55, y: 260 }));

    expect(at(second, "a1")).toEqual(shift(at(first, "a1"), 40, 60));
  });

  it("leaves unpinned siblings of a pinned descendant following the moved ancestor", () => {
    const entries = TREE.map((entry) => {
      if (entry.id === "a") return { ...entry, state: { x: 15, y: 200 } };
      if (entry.id === "a1") return { ...entry, state: { x: 70, y: -30 } };
      return entry;
    });

    const moved = positionsOf(entries);
    const dx = at(moved, "a").x - at(auto, "a").x;
    const dy = at(moved, "a").y - at(auto, "a").y;

    expect(at(moved, "a2")).toEqual(shift(at(auto, "a2"), dx, dy));
  });

  it("moves the whole tree when a root has an absolute position", () => {
    const entries = TREE.map((entry) => (entry.id === "r" ? { ...entry, state: { x: 500, y: 300 } } : entry));

    const moved = positionsOf(entries);

    expect(at(moved, "r")).toEqual({ x: 500, y: 300 });
    const dx = 500 - at(auto, "r").x;
    const dy = 300 - at(auto, "r").y;
    for (const id of ["a", "a1", "a2", "b"]) expect(at(moved, id)).toEqual(shift(at(auto, id), dx, dy));
  });

  it("treats the root position as absolute and ignores its parent-offset semantics", () => {
    const entries = [...TREE, { id: "r2", text: "", parentId: null, state: { x: -200, y: 40 } }];

    expect(at(positionsOf(entries), "r2")).toEqual({ x: -200, y: 40 });
  });

  it("moves a pinned descendant together with a moved root", () => {
    const entries = TREE.map((entry) => {
      if (entry.id === "r") return { ...entry, state: { x: 500, y: 300 } };
      if (entry.id === "a") return { ...entry, state: { x: 70, y: 10 } };
      return entry;
    });

    const moved = positionsOf(entries);

    expect(at(moved, "a")).toEqual({ x: 570, y: 310 });
  });

  it("ignores a stored position that is not a pair of finite numbers", () => {
    const entries = TREE.map((entry) => (entry.id === "b" ? { ...entry, state: { x: 5 } } : entry));

    expect(at(positionsOf(entries), "b")).toEqual(at(auto, "b"));
  });
});
