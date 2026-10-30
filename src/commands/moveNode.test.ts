import { describe, expect, it } from "vitest";
import { getNode } from "../model";
import { buildMindMap } from "../model";
import { moveRootKeepingOtherRoots, setNodePosition } from "./moveNode";

const map = buildMindMap([
  { id: "root", text: "Root", parentId: null },
  { id: "child", text: "Child", parentId: "root", state: { side: "left", color: "red" } },
  { id: "pinned", text: "Pinned", parentId: "root", state: { x: 5, y: 6 } },
]);

describe("setNodePosition", () => {
  it("stores the position in the node state", () => {
    const moved = setNodePosition(map, { nodeId: "child", position: { x: 10, y: -20 } });

    expect(getNode(moved, "child").state).toEqual({ side: "left", color: "red", x: 10, y: -20 });
  });

  it("overwrites an earlier position", () => {
    const moved = setNodePosition(map, { nodeId: "pinned", position: { x: 1, y: 2 } });

    expect(getNode(moved, "pinned").state).toEqual({ x: 1, y: 2 });
  });

  it("stores an absolute position on a root", () => {
    const moved = setNodePosition(map, { nodeId: "root", position: { x: 300, y: 400 } });

    expect(getNode(moved, "root").state).toEqual({ x: 300, y: 400 });
  });

  it("leaves other nodes and the input map untouched", () => {
    const moved = setNodePosition(map, { nodeId: "child", position: { x: 10, y: -20 } });

    expect(getNode(moved, "root")).toBe(getNode(map, "root"));
    expect(getNode(map, "child").state).toEqual({ side: "left", color: "red" });
  });

  it("returns the very same map when the position is unchanged", () => {
    expect(setNodePosition(map, { nodeId: "pinned", position: { x: 5, y: 6 } })).toBe(map);
  });

  it("throws when the node does not exist", () => {
    expect(() => setNodePosition(map, { nodeId: "ghost", position: { x: 0, y: 0 } })).toThrow("Node not found: ghost");
  });
});

describe("moveRootKeepingOtherRoots", () => {
  const roots = buildMindMap([
    { id: "r1", text: "One", parentId: null },
    { id: "r1c", text: "Child", parentId: "r1" },
    { id: "r2", text: "Two", parentId: null, state: { color: "red" } },
    { id: "r3", text: "Three", parentId: null, state: { x: 900, y: 900 } },
  ]);
  const rootPlacements = new Map([
    ["r1", { x: 0, y: 0 }],
    ["r2", { x: 0, y: 200 }],
    ["r3", { x: 900, y: 900 }],
  ]);

  it("moves the dragged root to the new position", () => {
    const moved = moveRootKeepingOtherRoots(roots, { nodeId: "r1", position: { x: 50, y: -60 }, rootPlacements });

    expect(getNode(moved, "r1").state).toEqual({ x: 50, y: -60 });
  });

  it("pins an auto-placed root at its current placement and keeps its other state", () => {
    const moved = moveRootKeepingOtherRoots(roots, { nodeId: "r1", position: { x: 50, y: -60 }, rootPlacements });

    expect(getNode(moved, "r2").state).toEqual({ color: "red", x: 0, y: 200 });
  });

  it("leaves a root that already has a position untouched", () => {
    const moved = moveRootKeepingOtherRoots(roots, {
      nodeId: "r1",
      position: { x: 50, y: -60 },
      rootPlacements: new Map([...rootPlacements, ["r3", { x: 1, y: 1 }]]),
    });

    expect(getNode(moved, "r3")).toBe(getNode(roots, "r3"));
  });

  it("leaves a root without a known placement auto-placed", () => {
    const moved = moveRootKeepingOtherRoots(roots, {
      nodeId: "r1",
      position: { x: 50, y: -60 },
      rootPlacements: new Map([["r1", { x: 0, y: 0 }]]),
    });

    expect(getNode(moved, "r2").state).toEqual({ color: "red" });
  });

  it("does not pin children of roots", () => {
    const moved = moveRootKeepingOtherRoots(roots, {
      nodeId: "r2",
      position: { x: 5, y: 5 },
      rootPlacements: new Map([...rootPlacements, ["r1c", { x: 300, y: 0 }]]),
    });

    expect(getNode(moved, "r1c").state).toBeUndefined();
    expect(getNode(moved, "r1").state).toEqual({ x: 0, y: 0 });
  });

  it("leaves the input map untouched", () => {
    moveRootKeepingOtherRoots(roots, { nodeId: "r1", position: { x: 50, y: -60 }, rootPlacements });

    expect(getNode(roots, "r1").state).toBeUndefined();
    expect(getNode(roots, "r2").state).toEqual({ color: "red" });
  });
});
