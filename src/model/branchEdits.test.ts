import { describe, expect, it } from "vitest";
import { buildMindMap, getNode } from ".";
import type { MindMap } from ".";
import { isOnlyBlankRoot, withNewRoot, withNewSibling, withOnlyBlankRoot, withoutBranch } from "./branchEdits";

const map = buildMindMap([
  { id: "r1", text: "R1", parentId: null },
  { id: "c1", text: "C1", parentId: "r1" },
  { id: "g1", text: "G1", parentId: "c1" },
  { id: "c2", text: "C2", parentId: "r1" },
  { id: "r2", text: "R2", parentId: null },
  { id: "d1", text: "D1", parentId: "r2" },
]);

function expectConsistent(tree: MindMap): void {
  for (const node of tree.nodes.values()) {
    if (node.parentId === null) {
      expect(tree.rootIds).toContain(node.id);
    } else {
      expect(getNode(tree, node.parentId).childIds).toContain(node.id);
    }
    node.childIds.forEach((childId) => expect(getNode(tree, childId).parentId).toBe(node.id));
  }
  tree.rootIds.forEach((rootId) => expect(getNode(tree, rootId).parentId).toBeNull());
}

describe("withNewSibling", () => {
  it.each(["r1", "c1", "g1", "c2", "r2", "d1"])("keeps parent and child links consistent when anchored at %s", (anchorId) => {
    const updated = withNewSibling(map, anchorId, { id: "n", text: "N" });

    expectConsistent(updated);
    expect(updated.nodes.size).toBe(map.nodes.size + 1);
  });

  it("gives the new node the anchor's parent", () => {
    const updated = withNewSibling(map, "g1", { id: "n", text: "N" });

    expect(getNode(updated, "n").parentId).toBe("c1");
  });

  it("keeps the state of the entry on the new node", () => {
    const updated = withNewSibling(map, "c1", { id: "n", text: "N", state: { side: "left" } });

    expect(getNode(updated, "n").state).toEqual({ side: "left" });
  });

  it("does not mutate the input map", () => {
    const rootIdsBefore = [...map.rootIds];
    withNewSibling(map, "c1", { id: "n", text: "N" });
    withNewSibling(map, "r1", { id: "m", text: "M" });

    expect(map.rootIds).toEqual(rootIdsBefore);
    expect(getNode(map, "r1").childIds).toEqual(["c1", "c2"]);
    expect(map.nodes.size).toBe(6);
  });
});

describe("withNewRoot", () => {
  it("appends the new node last in the root list with no parent", () => {
    const updated = withNewRoot(map, { id: "n", text: "N" });

    expect(updated.rootIds).toEqual(["r1", "r2", "n"]);
    expect(getNode(updated, "n")).toMatchObject({ parentId: null, childIds: [], text: "N" });
  });

  it("keeps parent and child links consistent", () => {
    const updated = withNewRoot(map, { id: "n", text: "N" });

    expectConsistent(updated);
    expect(updated.nodes.size).toBe(map.nodes.size + 1);
  });

  it("keeps the state of the entry on the new node", () => {
    const updated = withNewRoot(map, { id: "n", text: "N", state: { x: 4, y: 5 } });

    expect(getNode(updated, "n").state).toEqual({ x: 4, y: 5 });
  });

  it("leaves no state on the new node when the entry has none", () => {
    expect(getNode(withNewRoot(map, { id: "n", text: "N" }), "n").state).toBeUndefined();
  });

  it("creates the first root of an empty map", () => {
    const updated = withNewRoot({ rootIds: [], nodes: new Map() }, { id: "n", text: "" });

    expect(updated.rootIds).toEqual(["n"]);
  });

  it("does not touch the existing nodes or mutate the input map", () => {
    const updated = withNewRoot(map, { id: "n", text: "N" });

    expect(map.rootIds).toEqual(["r1", "r2"]);
    expect(map.nodes.size).toBe(6);
    for (const [id, node] of map.nodes) expect(getNode(updated, id)).toBe(node);
  });
});

describe("withoutBranch", () => {
  it.each(["r1", "c1", "g1", "c2", "r2", "d1"])("keeps parent and child links consistent when %s is removed", (branchId) => {
    const updated = withoutBranch(map, branchId);

    expectConsistent(updated);
    expect(updated.nodes.has(branchId)).toBe(false);
  });

  it("removes exactly the branch from the node set", () => {
    const updated = withoutBranch(map, "c1");

    expect([...updated.nodes.keys()].sort()).toEqual(["c2", "d1", "r1", "r2"]);
  });

  it("does not mutate the input map", () => {
    withoutBranch(map, "c1");
    withoutBranch(map, "r1");

    expect(map.nodes.size).toBe(6);
    expect(map.rootIds).toEqual(["r1", "r2"]);
    expect(getNode(map, "r1").childIds).toEqual(["c1", "c2"]);
  });
});

describe("withOnlyBlankRoot", () => {
  it("reduces the map to the given root with empty text, no children and no state", () => {
    const coloured = buildMindMap([
      { id: "r1", text: "R1", parentId: null, state: { color: "red" } },
      { id: "c1", text: "C1", parentId: "r1" },
      { id: "r2", text: "R2", parentId: null },
    ]);

    const blank = withOnlyBlankRoot(coloured, "r2");

    expect(blank.rootIds).toEqual(["r2"]);
    expect([...blank.nodes.values()]).toEqual([{ id: "r2", text: "", parentId: null, childIds: [] }]);
  });

  it("does not change the map it was given", () => {
    withOnlyBlankRoot(map, "r1");

    expect(map.nodes.size).toBe(6);
  });

  it("throws for an id that is not in the map", () => {
    expect(() => withOnlyBlankRoot(map, "missing")).toThrow();
  });
});

describe("isOnlyBlankRoot", () => {
  it("is true for one root with empty text and no state", () => {
    expect(isOnlyBlankRoot(buildMindMap([{ id: "r", text: "", parentId: null }]))).toBe(true);
  });

  it("is false for an empty map", () => {
    expect(isOnlyBlankRoot(buildMindMap([]))).toBe(false);
  });

  it("is false for a lone root with text", () => {
    expect(isOnlyBlankRoot(buildMindMap([{ id: "r", text: "x", parentId: null }]))).toBe(false);
  });

  it("is false for a blank root that has a child", () => {
    const parent = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "c", text: "", parentId: "r" },
    ]);

    expect(isOnlyBlankRoot(parent)).toBe(false);
  });

  it("is false for two blank roots", () => {
    expect(isOnlyBlankRoot(buildMindMap([{ id: "a", text: "", parentId: null }, { id: "b", text: "", parentId: null }]))).toBe(false);
  });

  it("is false for a blank root that carries state", () => {
    expect(isOnlyBlankRoot(buildMindMap([{ id: "r", text: "", parentId: null, state: { x: 1, y: 1 } }]))).toBe(false);
  });
});
