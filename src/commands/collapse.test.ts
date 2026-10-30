import { describe, expect, it } from "vitest";
import { buildMindMap, getNode, isNodeCollapsed } from "../model";
import { addChild } from "./addChild";
import { History } from "./history";
import { setNodeCollapsed, toggleNodeCollapsed } from "./collapse";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r", state: { side: "left", color: "red" } },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "leaf", text: "Leaf", parentId: "r" },
]);

describe("setNodeCollapsed", () => {
  it("collapses a node and keeps the rest of its state", () => {
    const updated = setNodeCollapsed(MAP, { nodeId: "a", isCollapsed: true });

    expect(getNode(updated, "a").state).toEqual({ side: "left", color: "red", collapsed: true });
  });

  it("expands a node by removing the flag from its state", () => {
    const collapsed = setNodeCollapsed(MAP, { nodeId: "a", isCollapsed: true });

    const expanded = setNodeCollapsed(collapsed, { nodeId: "a", isCollapsed: false });

    expect(getNode(expanded, "a").state).toEqual({ side: "left", color: "red" });
  });

  it("returns the same map when the node is already in the requested state", () => {
    expect(setNodeCollapsed(MAP, { nodeId: "a", isCollapsed: false })).toBe(MAP);
  });

  it("does not change the original map", () => {
    setNodeCollapsed(MAP, { nodeId: "a", isCollapsed: true });

    expect(isNodeCollapsed(getNode(MAP, "a"))).toBe(false);
  });

  it("keeps the descendants and their states when collapsing", () => {
    const updated = setNodeCollapsed(MAP, { nodeId: "a", isCollapsed: true });

    expect(getNode(updated, "a").childIds).toEqual(["a1"]);
  });
});

describe("toggleNodeCollapsed", () => {
  it("collapses an expanded node with children", () => {
    expect(isNodeCollapsed(getNode(toggleNodeCollapsed(MAP, { nodeId: "a" }), "a"))).toBe(true);
  });

  it("expands a collapsed node", () => {
    const collapsed = toggleNodeCollapsed(MAP, { nodeId: "a" });

    expect(isNodeCollapsed(getNode(toggleNodeCollapsed(collapsed, { nodeId: "a" }), "a"))).toBe(false);
  });

  it("collapses a root with children", () => {
    expect(isNodeCollapsed(getNode(toggleNodeCollapsed(MAP, { nodeId: "r" }), "r"))).toBe(true);
  });

  it("returns the very same map for a leaf", () => {
    expect(toggleNodeCollapsed(MAP, { nodeId: "leaf" })).toBe(MAP);
  });
});

describe("undoing a collapse", () => {
  it("restores the previous map in one history step and redo collapses again", () => {
    const history = new History();
    history.push(MAP);
    const collapsed = toggleNodeCollapsed(MAP, { nodeId: "a" });

    const undone = history.undo(collapsed);
    const redone = history.redo(MAP);

    expect(undone).toBe(MAP);
    expect(redone).toBe(collapsed);
    expect(history.canUndo).toBe(true);
  });
});

describe("addChild to a collapsed parent", () => {
  const collapsed = setNodeCollapsed(MAP, { nodeId: "a", isCollapsed: true });

  it("expands the parent", () => {
    const updated = addChild(collapsed, { parentId: "a", id: "n", text: "" });

    expect(isNodeCollapsed(getNode(updated, "a"))).toBe(false);
    expect(getNode(updated, "a").childIds).toEqual(["a1", "n"]);
  });

  it("keeps the parent's other state when expanding it", () => {
    const updated = addChild(collapsed, { parentId: "a", id: "n", text: "" });

    expect(getNode(updated, "a").state).toEqual({ side: "left", color: "red" });
  });

  it("expands a collapsed root", () => {
    const collapsedRoot = setNodeCollapsed(MAP, { nodeId: "r", isCollapsed: true });

    const updated = addChild(collapsedRoot, { parentId: "r", id: "n", text: "", side: "left" });

    expect(isNodeCollapsed(getNode(updated, "r"))).toBe(false);
  });

  it("leaves an expanded parent's state untouched", () => {
    const updated = addChild(MAP, { parentId: "a", id: "n", text: "" });

    expect(getNode(updated, "a").state).toBe(getNode(MAP, "a").state);
  });

  it("is undone in one step back to the collapsed parent without the new node", () => {
    const history = new History();
    history.push(collapsed);
    const added = addChild(collapsed, { parentId: "a", id: "n", text: "" });

    const undone = history.undo(added);

    expect(undone).toBe(collapsed);
    expect(isNodeCollapsed(getNode(undone ?? added, "a"))).toBe(true);
    expect(undone?.nodes.has("n")).toBe(false);
  });
});
