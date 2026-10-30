import { describe, expect, it } from "vitest";
import { buildMindMap } from "./mindMap";
import { getNode } from "./mindMap";
import { withBranchesAttached } from "./branchGraft";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
  { id: "b", text: "B", parentId: "r" },
  { id: "r2", text: "Second", parentId: null },
]);

const FOREST = buildMindMap([
  { id: "n1", text: "N1", parentId: null },
  { id: "n1a", text: "N1a", parentId: "n1" },
  { id: "n2", text: "N2", parentId: null },
]);

describe("withBranchesAttached", () => {
  it("appends the trees as last children of the parent in order", () => {
    const grafted = withBranchesAttached(MAP, FOREST, { kind: "lastChildOf", parentId: "r" });

    expect(getNode(grafted, "r").childIds).toEqual(["a", "b", "n1", "n2"]);
    expect(getNode(grafted, "n1").parentId).toBe("r");
    expect(getNode(grafted, "n2").parentId).toBe("r");
  });

  it("keeps the descendants of the attached trees under their own parents", () => {
    const grafted = withBranchesAttached(MAP, FOREST, { kind: "lastChildOf", parentId: "r" });

    expect(getNode(grafted, "n1").childIds).toEqual(["n1a"]);
    expect(getNode(grafted, "n1a").parentId).toBe("n1");
  });

  it("inserts the trees right after the anchor among its siblings", () => {
    const grafted = withBranchesAttached(MAP, FOREST, { kind: "after", anchorId: "a" });

    expect(getNode(grafted, "r").childIds).toEqual(["a", "n1", "n2", "b"]);
    expect(getNode(grafted, "n1").parentId).toBe("r");
  });

  it("inserts after a root as new roots right behind it", () => {
    const grafted = withBranchesAttached(MAP, FOREST, { kind: "after", anchorId: "r" });

    expect(grafted.rootIds).toEqual(["r", "n1", "n2", "r2"]);
    expect(getNode(grafted, "n1").parentId).toBeNull();
  });

  it("adds the trees as the last roots for a new root placement", () => {
    const grafted = withBranchesAttached(MAP, FOREST, { kind: "newRoot" });

    expect(grafted.rootIds).toEqual(["r", "r2", "n1", "n2"]);
    expect(getNode(grafted, "n1").parentId).toBeNull();
  });

  it("does not change the original map", () => {
    withBranchesAttached(MAP, FOREST, { kind: "lastChildOf", parentId: "r" });

    expect(getNode(MAP, "r").childIds).toEqual(["a", "b"]);
    expect(MAP.nodes.has("n1")).toBe(false);
  });
});
