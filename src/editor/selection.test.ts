import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import { selectionAfterDelete } from "./selection";

const map = buildMindMap([
  { id: "r1", text: "R1", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "b", text: "B", parentId: "r1" },
  { id: "c", text: "C", parentId: "r1" },
  { id: "only", text: "Only", parentId: "a" },
  { id: "r2", text: "R2", parentId: null },
  { id: "r3", text: "R3", parentId: null },
]);

describe("selectionAfterDelete", () => {
  it("selects the previous sibling", () => {
    expect(selectionAfterDelete(map, "b")).toBe("a");
    expect(selectionAfterDelete(map, "c")).toBe("b");
  });

  it("selects the next sibling when there is no previous one", () => {
    expect(selectionAfterDelete(map, "a")).toBe("b");
  });

  it("selects the parent when the node has no siblings", () => {
    expect(selectionAfterDelete(map, "only")).toBe("a");
  });

  it("selects the previous root when a later root is deleted", () => {
    expect(selectionAfterDelete(map, "r2")).toBe("r1");
    expect(selectionAfterDelete(map, "r3")).toBe("r2");
  });

  it("selects the next root when the first of several roots is deleted", () => {
    expect(selectionAfterDelete(map, "r1")).toBe("r2");
  });

  it("selects nothing when the only root is deleted", () => {
    const single = buildMindMap([
      { id: "r", text: "R", parentId: null },
      { id: "c", text: "C", parentId: "r" },
    ]);

    expect(selectionAfterDelete(single, "r")).toBeNull();
  });

  it("fails for an unknown id", () => {
    expect(() => selectionAfterDelete(map, "nope")).toThrow("Node not found: nope");
  });
});
