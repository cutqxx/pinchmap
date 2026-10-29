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

  it("leaves an empty map after deleting the only root", () => {
    const single = buildMindMap([
      { id: "r", text: "R", parentId: null },
      { id: "c", text: "C", parentId: "r" },
    ]);

    const updated = deleteBranch(single, { nodeId: "r" });

    expect(updated.rootIds).toEqual([]);
    expect(updated.nodes.size).toBe(0);
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
});
