import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { NodeId } from "../model";
import type { LayoutResult } from "./computeLayout";
import type { Size } from "./geometry";
import { nodesInsideRect } from "./nodesInsideRect";
import { rectBetween } from "./geometry";

const SIZE: Size = { width: 100, height: 40 };

const map = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
  { id: "b", text: "B", parentId: "r" },
]);

function layoutAt(placements: Record<string, { x: number; y: number }>): LayoutResult {
  return { positions: new Map(Object.entries(placements)), sides: new Map(), sideHeights: new Map() };
}

const layout = layoutAt({ r: { x: 0, y: 0 }, a: { x: 200, y: 0 }, b: { x: 200, y: 100 } });
const sizes = new Map<NodeId, Size>([["r", SIZE], ["a", SIZE], ["b", SIZE]]);

describe("nodesInsideRect", () => {
  it("selects every node whose whole box is inside the rectangle", () => {
    const rect = { x: -10, y: -10, width: 400, height: 200 };

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual(["r", "a", "b"]);
  });

  it("does not select a node that is only partly inside", () => {
    const rect = { x: -10, y: -10, width: 250, height: 200 };

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual(["r"]);
  });

  it("does not select a node that is cut off at the bottom", () => {
    const rect = { x: -10, y: -10, width: 400, height: 125 };

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual(["r", "a"]);
  });

  it("selects a node whose box touches the rectangle edges exactly", () => {
    const rect = { x: 200, y: 100, width: 100, height: 40 };

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual(["b"]);
  });

  it("does not select a node one unit short of the right edge", () => {
    const rect = { x: 200, y: 100, width: 99, height: 40 };

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual([]);
  });

  it("does not select a node one unit short of the left edge", () => {
    const rect = { x: 201, y: 100, width: 100, height: 40 };

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual([]);
  });

  it("selects nothing from a rectangle that covers empty space", () => {
    const rect = { x: 1000, y: 1000, width: 50, height: 50 };

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual([]);
  });

  it("selects nothing from a zero-size rectangle", () => {
    expect(nodesInsideRect(map, layout, sizes, rectBetween({ x: 5, y: 5 }, { x: 5, y: 5 }))).toEqual([]);
  });

  it("works with a rectangle drawn from the bottom right to the top left", () => {
    const rect = rectBetween({ x: 310, y: 150 }, { x: 190, y: 90 });

    expect(nodesInsideRect(map, layout, sizes, rect)).toEqual(["b"]);
  });

  it("skips nodes hidden below a collapsed node even when they lie inside the rectangle", () => {
    const collapsed = buildMindMap([
      { id: "r", text: "Root", parentId: null, state: { collapsed: true } },
      { id: "a", text: "A", parentId: "r" },
      { id: "b", text: "B", parentId: "r" },
    ]);
    const rect = { x: -10, y: -10, width: 400, height: 200 };

    expect(nodesInsideRect(collapsed, layout, sizes, rect)).toEqual(["r"]);
  });

  it("skips deeper descendants of a collapsed node", () => {
    const deep = buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "a", text: "A", parentId: "r", state: { collapsed: true } },
      { id: "b", text: "B", parentId: "a" },
    ]);
    const rect = { x: -10, y: -10, width: 400, height: 200 };

    expect(nodesInsideRect(deep, layout, sizes, rect)).toEqual(["r", "a"]);
  });

  it("skips a node that has no measured size", () => {
    const partialSizes = new Map<NodeId, Size>([["r", SIZE]]);
    const rect = { x: -10, y: -10, width: 400, height: 200 };

    expect(nodesInsideRect(map, layout, partialSizes, rect)).toEqual(["r"]);
  });

  it("skips a node that has no layout position", () => {
    const rect = { x: -10, y: -10, width: 400, height: 200 };

    expect(nodesInsideRect(map, layoutAt({ r: { x: 0, y: 0 } }), sizes, rect)).toEqual(["r"]);
  });
});

describe("rectBetween", () => {
  it("normalises corners given in any order", () => {
    expect(rectBetween({ x: 30, y: 5 }, { x: 10, y: 25 })).toEqual({ x: 10, y: 5, width: 20, height: 20 });
  });

  it("returns a zero-size rectangle for identical points", () => {
    expect(rectBetween({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({ x: 3, y: 4, width: 0, height: 0 });
  });
});
