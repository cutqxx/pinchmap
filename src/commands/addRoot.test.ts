import { describe, expect, it } from "vitest";
import { EMPTY_MIND_MAP, buildMindMap, getNode, readRootPosition } from "../model";
import { addRoot } from "./addRoot";

const map = buildMindMap([
  { id: "rootA", text: "Root A", parentId: null },
  { id: "a1", text: "A1", parentId: "rootA" },
  { id: "rootB", text: "Root B", parentId: null, state: { x: 300, y: 10 } },
]);

describe("addRoot", () => {
  it("appends the new root last in the root list", () => {
    const updated = addRoot(map, { id: "n1", text: "", position: { x: 5, y: 6 } });

    expect(updated.rootIds).toEqual(["rootA", "rootB", "n1"]);
    expect(getNode(updated, "n1")).toMatchObject({ parentId: null, childIds: [], text: "" });
  });

  it("stores the position as absolute map coordinates", () => {
    const updated = addRoot(map, { id: "n1", text: "", position: { x: -120, y: 340 } });

    expect(readRootPosition(getNode(updated, "n1").state)).toEqual({ x: -120, y: 340 });
  });

  it("creates the first root on an empty map", () => {
    const updated = addRoot(EMPTY_MIND_MAP, { id: "n1", text: "", position: { x: 40, y: 50 } });

    expect(updated.rootIds).toEqual(["n1"]);
    expect(readRootPosition(getNode(updated, "n1").state)).toEqual({ x: 40, y: 50 });
  });

  it("adds a node under the given new id", () => {
    const updated = addRoot(map, { id: "fresh", text: "", position: { x: 0, y: 0 } });

    expect(map.nodes.has("fresh")).toBe(false);
    expect(updated.nodes.has("fresh")).toBe(true);
    expect(updated.nodes.size).toBe(map.nodes.size + 1);
  });

  it("leaves every existing node untouched", () => {
    const updated = addRoot(map, { id: "n1", text: "", position: { x: 1, y: 2 } });

    for (const [id, node] of map.nodes) expect(getNode(updated, id)).toEqual(node);
  });

  it("does not mutate the input map", () => {
    addRoot(map, { id: "n1", text: "", position: { x: 1, y: 2 } });

    expect(map.rootIds).toEqual(["rootA", "rootB"]);
    expect(map.nodes.size).toBe(3);
  });

  it("keeps the given text", () => {
    const updated = addRoot(map, { id: "n1", text: "Idea", position: { x: 1, y: 2 } });

    expect(getNode(updated, "n1").text).toBe("Idea");
  });
});
