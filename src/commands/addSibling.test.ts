import { describe, expect, it } from "vitest";
import { buildMindMap, getNode } from "../model";
import { addSibling } from "./addSibling";

const map = buildMindMap([
  { id: "rootA", text: "Root A", parentId: null },
  { id: "a1", text: "A1", parentId: "rootA" },
  { id: "g1", text: "G1", parentId: "a1" },
  { id: "a2", text: "A2", parentId: "rootA" },
  { id: "rootB", text: "Root B", parentId: null },
  { id: "rootC", text: "Root C", parentId: null },
]);

describe("addSibling", () => {
  it("inserts the new node right after the anchor, not at the end", () => {
    const updated = addSibling(map, { anchorId: "a1", id: "n1", text: "New" });

    expect(getNode(updated, "rootA").childIds).toEqual(["a1", "n1", "a2"]);
    expect(getNode(updated, "n1")).toMatchObject({ text: "New", parentId: "rootA", childIds: [] });
  });

  it("appends after the anchor when the anchor is the last child", () => {
    const updated = addSibling(map, { anchorId: "a2", id: "n1", text: "" });

    expect(getNode(updated, "rootA").childIds).toEqual(["a1", "a2", "n1"]);
  });

  it("gives a deeper anchor a sibling under the same parent", () => {
    const updated = addSibling(map, { anchorId: "g1", id: "n1", text: "" });

    expect(getNode(updated, "a1").childIds).toEqual(["g1", "n1"]);
  });

  it("creates a new root right after a root anchor in the root list", () => {
    const updated = addSibling(map, { anchorId: "rootA", id: "n1", text: "" });

    expect(updated.rootIds).toEqual(["rootA", "n1", "rootB", "rootC"]);
    expect(getNode(updated, "n1").parentId).toBeNull();
  });

  it("creates a new root after the last root when the anchor is the last root", () => {
    const updated = addSibling(map, { anchorId: "rootC", id: "n1", text: "" });

    expect(updated.rootIds).toEqual(["rootA", "rootB", "rootC", "n1"]);
  });

  it("does not give a new root a side even when a side is requested", () => {
    const updated = addSibling(map, { anchorId: "rootA", id: "n1", text: "", side: "left" });

    expect(getNode(updated, "n1").state).toBeUndefined();
  });

  it("writes no side for a first-level sibling placed on the right by default", () => {
    const updated = addSibling(map, { anchorId: "a1", id: "n1", text: "" });

    expect(getNode(updated, "n1").state).toBeUndefined();
  });

  it("fixes the left side in the state of a first-level sibling of a left anchor", () => {
    const updated = addSibling(map, { anchorId: "a1", id: "n1", text: "", side: "left" });

    expect(getNode(updated, "n1").state).toEqual({ side: "left" });
  });

  it("ignores the side for a sibling deeper than the first level", () => {
    const updated = addSibling(map, { anchorId: "g1", id: "n1", text: "", side: "left" });

    expect(getNode(updated, "n1").state).toBeUndefined();
  });

  it("leaves every existing node unchanged except the parent", () => {
    const updated = addSibling(map, { anchorId: "a1", id: "n1", text: "" });

    for (const id of ["rootA", "a1", "g1", "a2", "rootB", "rootC"]) {
      if (id !== "rootA") expect(getNode(updated, id)).toBe(getNode(map, id));
    }
  });

  it("does not mutate the input map", () => {
    addSibling(map, { anchorId: "a1", id: "n1", text: "" });
    addSibling(map, { anchorId: "rootA", id: "n2", text: "" });

    expect(getNode(map, "rootA").childIds).toEqual(["a1", "a2"]);
    expect(map.rootIds).toEqual(["rootA", "rootB", "rootC"]);
    expect(map.nodes.has("n1")).toBe(false);
  });

  it("fails for an unknown anchor", () => {
    expect(() => addSibling(map, { anchorId: "nope", id: "n1", text: "" })).toThrow("Node not found: nope");
  });

  it("stores the given position in the state of a new root", () => {
    const updated = addSibling(map, { anchorId: "rootA", id: "n1", text: "", rootPosition: { x: 40, y: 120 } });

    expect(getNode(updated, "n1").state).toEqual({ x: 40, y: 120 });
  });

  it("writes no position for a new root when none is given", () => {
    const updated = addSibling(map, { anchorId: "rootA", id: "n1", text: "" });

    expect(getNode(updated, "n1").state).toBeUndefined();
  });

  it("ignores a root position for a sibling that is not a root", () => {
    const updated = addSibling(map, { anchorId: "a1", id: "n1", text: "", rootPosition: { x: 1, y: 2 } });

    expect(getNode(updated, "n1").state).toBeUndefined();
  });
});
