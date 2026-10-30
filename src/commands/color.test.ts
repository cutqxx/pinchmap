import { describe, expect, it } from "vitest";
import { buildMindMap, effectiveColor, getNode } from "../model";
import { History } from "./history";
import { setNodeColor } from "./color";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r", state: { side: "left", collapsed: true } },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "c", text: "C", parentId: "r", state: { color: "green" } },
  { id: "odd", text: "Odd", parentId: "r", state: { color: "magenta" } },
  { id: "nul", text: "Null", parentId: "r", state: { color: null } },
]);

describe("setNodeColor", () => {
  it("sets the colour and keeps the rest of the node's state", () => {
    const updated = setNodeColor(MAP, { nodeId: "a", color: "red" });

    expect(getNode(updated, "a").state).toEqual({ side: "left", collapsed: true, color: "red" });
  });

  it("changes an existing colour", () => {
    expect(getNode(setNodeColor(MAP, { nodeId: "c", color: "purple" }), "c").state).toEqual({ color: "purple" });
  });

  it("removes the colour key when cleared and drops an emptied state", () => {
    expect(getNode(setNodeColor(MAP, { nodeId: "c", color: undefined }), "c").state).toBeUndefined();
  });

  it("returns the very same map when the colour is unchanged", () => {
    expect(setNodeColor(MAP, { nodeId: "c", color: "green" })).toBe(MAP);
  });

  it("returns the very same map when clearing a node that has no colour", () => {
    expect(setNodeColor(MAP, { nodeId: "a", color: undefined })).toBe(MAP);
  });

  it("leaves an unknown stored value in place when clearing, since the node already reads as uncoloured", () => {
    const updated = setNodeColor(MAP, { nodeId: "odd", color: undefined });

    expect(updated).toBe(MAP);
    expect(getNode(updated, "odd").state).toEqual({ color: "magenta" });
  });

  it("replaces an unknown stored value when a real colour is chosen", () => {
    expect(getNode(setNodeColor(MAP, { nodeId: "odd", color: "cyan" }), "odd").state).toEqual({ color: "cyan" });
  });

  it("replaces a null colour when a real colour is chosen", () => {
    expect(getNode(setNodeColor(MAP, { nodeId: "nul", color: "red" }), "nul").state).toEqual({ color: "red" });
  });

  it("colours the descendants through inheritance without touching their state", () => {
    const updated = setNodeColor(MAP, { nodeId: "a", color: "orange" });

    expect(effectiveColor(updated, "a1")).toBe("orange");
    expect(getNode(updated, "a1").state).toBeUndefined();
  });

  it("keeps a descendant's own colour when an ancestor is recoloured", () => {
    const map = setNodeColor(buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "k", text: "", parentId: "r", state: { color: "green" } },
    ]), { nodeId: "r", color: "red" });

    expect(effectiveColor(map, "k")).toBe("green");
  });

  it("does not change the original map", () => {
    setNodeColor(MAP, { nodeId: "a", color: "red" });

    expect(getNode(MAP, "a").state).toEqual({ side: "left", collapsed: true });
  });
});

describe("undoing a colour change", () => {
  it("restores the previous map in one history step and redo recolours", () => {
    const history = new History();
    history.push(MAP);
    const coloured = setNodeColor(MAP, { nodeId: "a", color: "red" });

    const undone = history.undo(coloured);
    const redone = history.redo(MAP);

    expect(undone).toBe(MAP);
    expect(redone).toBe(coloured);
    expect(history.canUndo).toBe(true);
  });
});
