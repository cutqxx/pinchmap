import { describe, expect, it } from "vitest";
import { buildMindMap, getNode } from "../model";
import type { MindMap } from "../model";
import { clearPositionsOfReparentedNodes, reparentNode } from "./reparentNode";

const map = buildMindMap([
  { id: "r", text: "Root", parentId: null, state: { x: 500, y: 400 } },
  { id: "a", text: "A", parentId: "r", state: { side: "left", color: "red", x: 10, y: 20 } },
  { id: "a1", text: "A1", parentId: "a", state: { x: 7, y: 9 } },
  { id: "a1x", text: "A1x", parentId: "a1" },
  { id: "b", text: "B", parentId: "r" },
  { id: "b1", text: "B1", parentId: "b" },
  { id: "b2", text: "B2", parentId: "b" },
  { id: "r2", text: "Second", parentId: null },
  { id: "r2c", text: "Second child", parentId: "r2", state: { side: "left" } },
]);

function childIds(source: MindMap, id: string): readonly string[] {
  return getNode(source, id).childIds;
}

describe("reparentNode", () => {
  it("makes the node the last child among the existing children of the target", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "b" });

    expect(childIds(moved, "b")).toEqual(["b1", "b2", "a"]);
    expect(getNode(moved, "a").parentId).toBe("b");
  });

  it("makes the node the only child of a target that had none", () => {
    const moved = reparentNode(map, { nodeId: "b", newParentId: "a1x" });

    expect(childIds(moved, "a1x")).toEqual(["b"]);
  });

  it("removes the node from its old parent without disturbing the other siblings", () => {
    const moved = reparentNode(map, { nodeId: "b1", newParentId: "a" });

    expect(childIds(moved, "b")).toEqual(["b2"]);
  });

  it("moves the node when it is the first of several siblings and keeps the others' order", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "r2" });

    expect(childIds(moved, "r")).toEqual(["b"]);
    expect(childIds(moved, "r2")).toEqual(["r2c", "a"]);
  });

  it("clears the x and y of the moved node", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "b" });

    expect(getNode(moved, "a").state).toEqual({ color: "red" });
  });

  it("drops the state entirely when x and y were all it held", () => {
    const moved = reparentNode(map, { nodeId: "a1", newParentId: "b" });

    expect(getNode(moved, "a1")).not.toHaveProperty("state");
  });

  it("keeps the offsets of the descendants of the moved node", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "b" });

    expect(getNode(moved, "a1").state).toEqual({ x: 7, y: 9 });
    expect(getNode(moved, "a1").parentId).toBe("a");
    expect(childIds(moved, "a1")).toEqual(["a1x"]);
  });

  it("keeps all node ids and texts", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "b" });

    expect([...moved.nodes.keys()].sort()).toEqual([...map.nodes.keys()].sort());
    expect(getNode(moved, "a").text).toBe("A");
    expect(getNode(moved, "a").id).toBe("a");
  });

  it("sets the left side when the target is a root", () => {
    const moved = reparentNode(map, { nodeId: "b1", newParentId: "r", side: "left" });

    expect(getNode(moved, "b1").state).toEqual({ side: "left" });
  });

  it("leaves a right-side branch without a side key under a root", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "r2", side: "right" });

    expect(getNode(moved, "a").state).toEqual({ color: "red" });
  });

  it("defaults to the right side under a root", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "r2" });

    expect(getNode(moved, "a").state).toEqual({ color: "red" });
  });

  it("removes the side key when the target is not a root, even if left was requested", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "b", side: "left" });

    expect(getNode(moved, "a").state).toEqual({ color: "red" });
  });

  it("replaces an old side with the one chosen for the new root", () => {
    const moved = reparentNode(map, { nodeId: "a", newParentId: "r2", side: "right" });

    expect(getNode(moved, "a").state).not.toHaveProperty("side");
  });

  it("does not leave a pending-side flag on the moved node", () => {
    const pending = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r", isSidePending: true },
      { id: "b", text: "", parentId: "r" },
    ]);

    expect(getNode(reparentNode(pending, { nodeId: "a", newParentId: "b" }), "a")).not.toHaveProperty("isSidePending");
  });

  it("moves a root with its tree under a node and drops it from the root list", () => {
    const moved = reparentNode(map, { nodeId: "r2", newParentId: "b1" });

    expect(moved.rootIds).toEqual(["r"]);
    expect(getNode(moved, "r2").parentId).toBe("b1");
    expect(childIds(moved, "b1")).toEqual(["r2"]);
    expect(childIds(moved, "r2")).toEqual(["r2c"]);
    expect(getNode(moved, "r2c").state).toEqual({ side: "left" });
  });

  it("clears the absolute position of a root that becomes a child", () => {
    const moved = reparentNode(map, { nodeId: "r", newParentId: "r2" });

    expect(getNode(moved, "r")).not.toHaveProperty("state");
    expect(moved.rootIds).toEqual(["r2"]);
  });

  it("assigns the side of a root that becomes a branch of another root", () => {
    const moved = reparentNode(map, { nodeId: "r2", newParentId: "r", side: "left" });

    expect(getNode(moved, "r2").state).toEqual({ side: "left" });
  });

  it("keeps the other roots in order when a middle root moves", () => {
    const three = buildMindMap([
      { id: "x", text: "", parentId: null },
      { id: "y", text: "", parentId: null },
      { id: "z", text: "", parentId: null },
    ]);

    expect(reparentNode(three, { nodeId: "y", newParentId: "z" }).rootIds).toEqual(["x", "z"]);
  });

  it("returns the very same map when the target lies inside the moved branch", () => {
    expect(reparentNode(map, { nodeId: "a", newParentId: "a1x" })).toBe(map);
  });

  it("returns the very same map when the node is moved onto itself", () => {
    expect(reparentNode(map, { nodeId: "a", newParentId: "a" })).toBe(map);
  });

  it("returns the very same map when a root is moved under its own descendant", () => {
    expect(reparentNode(map, { nodeId: "r", newParentId: "b2" })).toBe(map);
  });

  it("leaves the input map untouched", () => {
    reparentNode(map, { nodeId: "a", newParentId: "b" });

    expect(childIds(map, "r")).toEqual(["a", "b"]);
    expect(childIds(map, "b")).toEqual(["b1", "b2"]);
    expect(getNode(map, "a").state).toEqual({ side: "left", color: "red", x: 10, y: 20 });
    expect(getNode(map, "a").parentId).toBe("r");
  });

  it("throws when the target does not exist", () => {
    expect(() => reparentNode(map, { nodeId: "a", newParentId: "ghost" })).toThrow("Node not found: ghost");
  });

  it("throws when the node does not exist", () => {
    expect(() => reparentNode(map, { nodeId: "ghost", newParentId: "a" })).toThrow("Node not found: ghost");
  });
});

describe("clearPositionsOfReparentedNodes", () => {
  it("returns next itself when no parent changed", () => {
    const next = buildMindMap([...map.nodes.values()].map((node) => ({ id: node.id, text: node.text, parentId: node.parentId, state: node.state })));

    expect(clearPositionsOfReparentedNodes(map, next)).toBe(next);
  });

  it("returns next itself when the parent changed but the node holds no position", () => {
    const next = reparentNode(map, { nodeId: "b", newParentId: "a1x" });

    expect(clearPositionsOfReparentedNodes(map, next)).toBe(next);
  });

  it("clears x and y of a node whose parent changed and keeps its other state", () => {
    const next = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r" },
      { id: "b", text: "", parentId: "a", state: { color: "red", x: 3, y: 4 } },
    ]);
    const previous = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r" },
      { id: "b", text: "", parentId: "r", state: { color: "red", x: 3, y: 4 } },
    ]);

    expect(getNode(clearPositionsOfReparentedNodes(previous, next), "b").state).toEqual({ color: "red" });
  });

  it("removes the state property when only x and y were there", () => {
    const previous = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r", state: { x: 1, y: 2 } },
    ]);
    const next = buildMindMap([{ id: "a", text: "", parentId: null, state: { x: 1, y: 2 } }, { id: "r", text: "", parentId: "a" }]);

    const cleared = clearPositionsOfReparentedNodes(previous, next);

    expect(getNode(cleared, "a")).not.toHaveProperty("state");
  });

  it("clears the position of a root that became a child", () => {
    const previous = buildMindMap([
      { id: "r", text: "", parentId: null, state: { x: 50, y: 60 } },
      { id: "t", text: "", parentId: null },
    ]);
    const next = buildMindMap([
      { id: "r", text: "", parentId: "t", state: { x: 50, y: 60 } },
      { id: "t", text: "", parentId: null },
    ]);

    expect(getNode(clearPositionsOfReparentedNodes(previous, next), "r")).not.toHaveProperty("state");
  });

  it("keeps the position of a node whose parent did not change", () => {
    const previous = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "t", text: "", parentId: null },
      { id: "a", text: "", parentId: "r", state: { x: 1, y: 2 } },
      { id: "m", text: "", parentId: "r", state: { x: 8, y: 9 } },
    ]);
    const next = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "t", text: "", parentId: null },
      { id: "a", text: "", parentId: "t", state: { x: 1, y: 2 } },
      { id: "m", text: "", parentId: "r", state: { x: 8, y: 9 } },
    ]);

    const cleared = clearPositionsOfReparentedNodes(previous, next);

    expect(getNode(cleared, "m").state).toEqual({ x: 8, y: 9 });
    expect(getNode(cleared, "a")).not.toHaveProperty("state");
  });

  it("keeps the position of a node that is new in next", () => {
    const previous = buildMindMap([{ id: "r", text: "", parentId: null }]);
    const next = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "n", text: "", parentId: "r", state: { x: 4, y: 5 } },
    ]);

    expect(clearPositionsOfReparentedNodes(previous, next)).toBe(next);
  });

  it("does not modify next or previous", () => {
    const previous = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "t", text: "", parentId: null },
      { id: "a", text: "", parentId: "r", state: { x: 1, y: 2 } },
    ]);
    const next = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "t", text: "", parentId: null },
      { id: "a", text: "", parentId: "t", state: { x: 1, y: 2 } },
    ]);

    clearPositionsOfReparentedNodes(previous, next);

    expect(getNode(next, "a").state).toEqual({ x: 1, y: 2 });
    expect(getNode(previous, "a").state).toEqual({ x: 1, y: 2 });
  });

  it("keeps the child lists and root list of next", () => {
    const previous = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "t", text: "", parentId: null },
      { id: "a", text: "", parentId: "r", state: { x: 1, y: 2 } },
    ]);
    const next = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "t", text: "", parentId: null },
      { id: "a", text: "", parentId: "t", state: { x: 1, y: 2 } },
    ]);

    const cleared = clearPositionsOfReparentedNodes(previous, next);

    expect(cleared.rootIds).toEqual(["r", "t"]);
    expect(getNode(cleared, "t").childIds).toEqual(["a"]);
  });
});
