import { describe, expect, it } from "vitest";
import { getNode } from "../model";
import { buildMindMap } from "../model";
import { setNodePosition } from "./moveNode";

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
