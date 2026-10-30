import { describe, expect, it } from "vitest";
import { buildMindMap, getNode, readManualPosition } from "../model";
import type { ManualPosition, MindMap, NodeId } from "../model";
import { moveNodeGroup } from "./moveNodeGroup";

const map = buildMindMap([
  { id: "r1", text: "One", parentId: null, state: { x: 0, y: 0 } },
  { id: "a", text: "A", parentId: "r1", state: { x: 10, y: 20 } },
  { id: "b", text: "B", parentId: "r1" },
  { id: "r2", text: "Two", parentId: null },
  { id: "r3", text: "Three", parentId: null },
]);

const PLACEMENTS = new Map<NodeId, ManualPosition>([
  ["r1", { x: 0, y: 0 }],
  ["r2", { x: 0, y: 200 }],
  ["r3", { x: 0, y: 400 }],
]);

function positionOf(result: MindMap, id: NodeId): ManualPosition | undefined {
  return readManualPosition(getNode(result, id).state);
}

describe("moveNodeGroup", () => {
  it("stores the new position of every moved node", () => {
    const positions = new Map([["a", { x: 50, y: 60 }], ["b", { x: -5, y: -6 }]]);

    const moved = moveNodeGroup(map, { positions, rootPlacements: new Map() });

    expect(positionOf(moved, "a")).toEqual({ x: 50, y: 60 });
    expect(positionOf(moved, "b")).toEqual({ x: -5, y: -6 });
  });

  it("does not pin auto-placed roots when only non-root nodes move", () => {
    const positions = new Map([["a", { x: 50, y: 60 }]]);

    const moved = moveNodeGroup(map, { positions, rootPlacements: PLACEMENTS });

    expect(positionOf(moved, "r2")).toBeUndefined();
    expect(positionOf(moved, "r3")).toBeUndefined();
  });

  it("moves a root together with a child in the same call", () => {
    const positions = new Map([["r1", { x: 100, y: 100 }], ["b", { x: 1, y: 2 }]]);

    const moved = moveNodeGroup(map, { positions, rootPlacements: PLACEMENTS });

    expect(positionOf(moved, "r1")).toEqual({ x: 100, y: 100 });
    expect(positionOf(moved, "b")).toEqual({ x: 1, y: 2 });
  });

  it("pins auto-placed roots that stay behind where they stand now", () => {
    const positions = new Map([["r1", { x: 100, y: 100 }]]);

    const moved = moveNodeGroup(map, { positions, rootPlacements: PLACEMENTS });

    expect(positionOf(moved, "r2")).toEqual({ x: 0, y: 200 });
    expect(positionOf(moved, "r3")).toEqual({ x: 0, y: 400 });
  });

  it("does not pin an auto-placed root that is itself moved to its new place", () => {
    const positions = new Map([["r2", { x: 300, y: 300 }]]);

    const moved = moveNodeGroup(map, { positions, rootPlacements: PLACEMENTS });

    expect(positionOf(moved, "r2")).toEqual({ x: 300, y: 300 });
    expect(positionOf(moved, "r3")).toEqual({ x: 0, y: 400 });
  });

  it("moves two auto-placed roots without pinning either to the old place", () => {
    const positions = new Map([["r2", { x: 7, y: 8 }], ["r3", { x: 9, y: 10 }]]);

    const moved = moveNodeGroup(map, { positions, rootPlacements: PLACEMENTS });

    expect(positionOf(moved, "r2")).toEqual({ x: 7, y: 8 });
    expect(positionOf(moved, "r3")).toEqual({ x: 9, y: 10 });
    expect(positionOf(moved, "r1")).toEqual({ x: 0, y: 0 });
  });

  it("leaves the input map untouched", () => {
    moveNodeGroup(map, { positions: new Map([["a", { x: 1, y: 1 }]]), rootPlacements: PLACEMENTS });

    expect(positionOf(map, "a")).toEqual({ x: 10, y: 20 });
  });

  it("throws when a moved node does not exist", () => {
    const positions = new Map([["ghost", { x: 1, y: 1 }]]);

    expect(() => moveNodeGroup(map, { positions, rootPlacements: new Map() })).toThrow("Node not found: ghost");
  });

  it("returns an equivalent map for an empty group", () => {
    expect(moveNodeGroup(map, { positions: new Map(), rootPlacements: PLACEMENTS })).toBe(map);
  });
});
