import { describe, expect, it } from "vitest";
import { buildMindMap, getNode } from "../model";
import { addChild } from "./addChild";

const map = buildMindMap([
  { id: "root", text: "Root", parentId: null },
  { id: "branch", text: "Branch", parentId: "root" },
  { id: "leaf", text: "Leaf", parentId: "branch" },
]);

describe("addChild", () => {
  it("adds the new node as the last child of the parent", () => {
    const updated = addChild(map, { parentId: "root", id: "n1", text: "New" });

    expect(getNode(updated, "root").childIds).toEqual(["branch", "n1"]);
    expect(getNode(updated, "n1")).toMatchObject({ text: "New", parentId: "root", childIds: [] });
  });

  it("puts a first-level branch on the right by default and writes no side", () => {
    const updated = addChild(map, { parentId: "root", id: "n1", text: "" });

    expect(getNode(updated, "n1").state).toBeUndefined();
  });

  it("fixes the given left side in the state of a new first-level branch", () => {
    const updated = addChild(map, { parentId: "root", id: "n1", text: "", side: "left" });

    expect(getNode(updated, "n1").state).toEqual({ side: "left" });
  });

  it("writes no side for a new first-level branch placed on the right", () => {
    const updated = addChild(map, { parentId: "root", id: "n1", text: "", side: "right" });

    expect(getNode(updated, "n1").state).toBeUndefined();
  });

  it("does not mark a new branch as side pending", () => {
    const updated = addChild(map, { parentId: "root", id: "n1", text: "", side: "left" });

    expect(getNode(updated, "n1").isSidePending).toBeUndefined();
  });

  it("ignores the side for a node deeper than the first level", () => {
    const underBranch = addChild(map, { parentId: "branch", id: "n1", text: "", side: "left" });
    const underLeaf = addChild(map, { parentId: "leaf", id: "n2", text: "", side: "left" });

    expect(getNode(underBranch, "n1").state).toBeUndefined();
    expect(getNode(underLeaf, "n2").state).toBeUndefined();
  });

  it("does not change the side of existing branches", () => {
    const withLeft = addChild(map, { parentId: "root", id: "l", text: "", side: "left" });

    const updated = addChild(withLeft, { parentId: "root", id: "n", text: "", side: "right" });

    expect(getNode(updated, "l")).toBe(getNode(withLeft, "l"));
    expect(getNode(updated, "branch")).toBe(getNode(withLeft, "branch"));
  });

  it("does not mutate the input map", () => {
    addChild(map, { parentId: "root", id: "n1", text: "New" });

    expect(getNode(map, "root").childIds).toEqual(["branch"]);
  });

  it("fails for an unknown parent", () => {
    expect(() => addChild(map, { parentId: "nope", id: "n1", text: "" })).toThrow("Node not found: nope");
  });
});
