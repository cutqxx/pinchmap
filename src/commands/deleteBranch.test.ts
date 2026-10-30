import { describe, expect, it } from "vitest";
import { buildMindMap, getNode } from "../model";
import { deleteBranch } from "./deleteBranch";

const map = buildMindMap([
  { id: "rootA", text: "Root A", parentId: null },
  { id: "a1", text: "A1", parentId: "rootA", state: { side: "left" } },
  { id: "g1", text: "G1", parentId: "a1" },
  { id: "h1", text: "H1", parentId: "g1" },
  { id: "g2", text: "G2", parentId: "a1" },
  { id: "a2", text: "A2", parentId: "rootA" },
  { id: "rootB", text: "Root B", parentId: null },
  { id: "b1", text: "B1", parentId: "rootB" },
]);

describe("deleteBranch", () => {
  it("removes the node and all its descendants", () => {
    const updated = deleteBranch(map, { nodeId: "a1" });

    expect([...updated.nodes.keys()].sort()).toEqual(["a2", "b1", "rootA", "rootB"]);
  });

  it("removes the node from its parent's children and keeps the order of the others", () => {
    const updated = deleteBranch(map, { nodeId: "g1" });

    expect(getNode(updated, "a1").childIds).toEqual(["g2"]);
  });

  it("leaves all unrelated nodes identical", () => {
    const updated = deleteBranch(map, { nodeId: "a1" });

    for (const id of ["a2", "rootB", "b1"]) expect(getNode(updated, id)).toBe(getNode(map, id));
  });

  it("deletes a leaf without touching anything else", () => {
    const updated = deleteBranch(map, { nodeId: "h1" });

    expect(updated.nodes.size).toBe(map.nodes.size - 1);
    expect(getNode(updated, "g1").childIds).toEqual([]);
  });

  it("removes a root with its whole tree and drops it from the root list", () => {
    const updated = deleteBranch(map, { nodeId: "rootA" });

    expect(updated.rootIds).toEqual(["rootB"]);
    expect([...updated.nodes.keys()].sort()).toEqual(["b1", "rootB"]);
  });

  it("keeps the deleted root, blank and childless, when it was the whole map", () => {
    const single = buildMindMap([
      { id: "r", text: "R", parentId: null },
      { id: "c", text: "C", parentId: "r" },
    ]);

    const updated = deleteBranch(single, { nodeId: "r" });

    expect(updated.rootIds).toEqual(["r"]);
    expect([...updated.nodes.values()]).toEqual([{ id: "r", text: "", parentId: null, childIds: [] }]);
  });

  it("does not mutate the input map", () => {
    deleteBranch(map, { nodeId: "a1" });
    deleteBranch(map, { nodeId: "rootA" });

    expect(map.nodes.size).toBe(8);
    expect(map.rootIds).toEqual(["rootA", "rootB"]);
    expect(getNode(map, "rootA").childIds).toEqual(["a1", "a2"]);
  });

  it("fails for an unknown id", () => {
    expect(() => deleteBranch(map, { nodeId: "nope" })).toThrow("Node not found: nope");
  });

  it("clears the position, colour and collapse state of a root that stays as the blank root", () => {
    const single = buildMindMap([
      { id: "r", text: "R", parentId: null, state: { x: 10, y: 20, color: "red", collapsed: true } },
      { id: "c", text: "C", parentId: "r" },
    ]);

    const updated = deleteBranch(single, { nodeId: "r" });

    expect(getNode(updated, "r")).toEqual({ id: "r", text: "", parentId: null, childIds: [] });
  });

  it("keeps the id of the root that was deleted, not another", () => {
    const updated = deleteBranch(buildMindMap([{ id: "only", text: "Only", parentId: null }]), { nodeId: "only" });

    expect(updated.rootIds).toEqual(["only"]);
  });

  it("returns the very same map when the map is already one blank root", () => {
    const blank = buildMindMap([{ id: "r", text: "", parentId: null }]);

    expect(deleteBranch(blank, { nodeId: "r" })).toBe(blank);
  });

  it("blanks a lone childless root that has no text but has a colour", () => {
    const coloured = buildMindMap([{ id: "r", text: "", parentId: null, state: { color: "red" } }]);

    const updated = deleteBranch(coloured, { nodeId: "r" });

    expect(getNode(updated, "r").state).toBeUndefined();
  });

  it("keeps the other root unchanged when one of two roots is deleted", () => {
    const two = buildMindMap([
      { id: "r1", text: "One", parentId: null },
      { id: "r2", text: "Two", parentId: null, state: { x: 1, y: 2 } },
    ]);

    const updated = deleteBranch(two, { nodeId: "r1" });

    expect(updated.rootIds).toEqual(["r2"]);
    expect(getNode(updated, "r2")).toEqual(getNode(two, "r2"));
  });

  it("deletes only the child, not the root, when the root has one child", () => {
    const pair = buildMindMap([
      { id: "r", text: "R", parentId: null },
      { id: "c", text: "C", parentId: "r" },
    ]);

    const updated = deleteBranch(pair, { nodeId: "c" });

    expect(getNode(updated, "r")).toEqual({ id: "r", text: "R", parentId: null, childIds: [] });
  });

  it("ends as one blank root of the last deleted root when every root is deleted in turn", () => {
    const roots = buildMindMap([
      { id: "r1", text: "One", parentId: null },
      { id: "k1", text: "Kid", parentId: "r1" },
      { id: "r2", text: "Two", parentId: null },
      { id: "r3", text: "Three", parentId: null },
    ]);

    const updated = ["r1", "r2", "r3"].reduce((current, nodeId) => deleteBranch(current, { nodeId }), roots);

    expect(updated.rootIds).toEqual(["r3"]);
    expect([...updated.nodes.values()]).toEqual([{ id: "r3", text: "", parentId: null, childIds: [] }]);
  });
});
