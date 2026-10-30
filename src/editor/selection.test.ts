import { beforeEach, describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import { Selection, selectionAfterDelete, topmostNodeIds } from "./selection";

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

describe("topmostNodeIds", () => {
  it("drops a selected node whose parent is also selected", () => {
    expect(topmostNodeIds(map, ["a", "r1"])).toEqual(["r1"]);
  });

  it("drops a node with a selected ancestor several levels up", () => {
    expect(topmostNodeIds(map, ["only", "r1", "r2"])).toEqual(["r1", "r2"]);
  });

  it("keeps unrelated nodes in their selection order", () => {
    expect(topmostNodeIds(map, ["c", "a", "r2"])).toEqual(["c", "a", "r2"]);
  });

  it("keeps a node whose ancestor is not selected", () => {
    expect(topmostNodeIds(map, ["only", "b"])).toEqual(["only", "b"]);
  });

  it("returns an empty list for an empty selection", () => {
    expect(topmostNodeIds(map, [])).toEqual([]);
  });
});

describe("Selection", () => {
  let selection: Selection;
  let refreshes: number;

  beforeEach(() => {
    refreshes = 0;
    selection = new Selection({ focusCanvas: () => void (refreshes += 1), scheduleFrame: () => undefined });
  });

  it("starts empty", () => {
    expect(selection.ids).toEqual([]);
    expect(selection.current).toBeNull();
    expect(selection.sole).toBeNull();
    expect(selection.isMultiple).toBe(false);
  });

  it("exposes a single selected node as current and sole", () => {
    selection.select("a");

    expect([selection.current, selection.sole, selection.isMultiple]).toEqual(["a", "a", false]);
  });

  it("selecting a node replaces the whole group", () => {
    selection.selectMany(["a", "b", "c"]);
    selection.select("r2");

    expect(selection.ids).toEqual(["r2"]);
  });

  it("selecting null clears the group", () => {
    selection.selectMany(["a", "b"]);
    selection.select(null);

    expect(selection.ids).toEqual([]);
  });

  it("makes the last picked node the primary one and hides sole when several are selected", () => {
    selection.selectMany(["a", "b", "c"]);

    expect([selection.current, selection.sole, selection.isMultiple]).toEqual(["c", null, true]);
  });

  it("removes duplicates from a picked group", () => {
    selection.selectMany(["a", "b", "a"]);

    expect(selection.ids).toEqual(["a", "b"]);
  });

  it("toggling an unselected node adds it and makes it primary", () => {
    selection.select("a");
    selection.toggle("b");

    expect(selection.ids).toEqual(["a", "b"]);
    expect(selection.current).toBe("b");
  });

  it("toggling a selected node removes only that node", () => {
    selection.selectMany(["a", "b", "c"]);
    selection.toggle("b");

    expect(selection.ids).toEqual(["a", "c"]);
  });

  it("toggling the primary node makes the previous one primary", () => {
    selection.selectMany(["a", "b"]);
    selection.toggle("b");

    expect([selection.current, selection.sole]).toEqual(["a", "a"]);
  });

  it("toggling the last selected node leaves nothing selected", () => {
    selection.select("a");
    selection.toggle("a");

    expect(selection.ids).toEqual([]);
  });

  it("toggling on an empty selection selects the node", () => {
    selection.toggle("a");

    expect(selection.ids).toEqual(["a"]);
  });

  it("focuses the canvas and schedules a frame on selectMany and toggle but not on silent set", () => {
    selection.selectMany(["a"]);
    selection.toggle("b");
    const afterPicking = refreshes;
    selection.set("c");
    selection.setMany(["a", "b"]);

    expect(afterPicking).toBe(2);
    expect(refreshes).toBe(2);
  });
});
