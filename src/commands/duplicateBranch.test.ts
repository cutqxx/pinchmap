import { describe, expect, it } from "vitest";
import { buildMindMap, getNode, readManualPosition } from "../model";
import type { MindMap, NodeId } from "../model";
import { duplicateBranch } from "./duplicateBranch";
import { History } from "./history";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null, state: { x: 100, y: 200, color: "purple" } },
  { id: "a", text: "A", parentId: "r", state: { side: "left", color: "red", collapsed: true, x: 9, y: 8 } },
  { id: "a1", text: "A1\nsecond", parentId: "a", state: { color: "green", x: 1, y: 2, custom: 7 } },
  { id: "a2", text: "A2", parentId: "a" },
  { id: "b", text: "B", parentId: "r" },
  { id: "c", text: "C", parentId: "r" },
  { id: "r2", text: "Second root", parentId: null },
]);

function branchTexts(map: MindMap, id: NodeId): unknown {
  const node = getNode(map, id);
  return { text: node.text, children: node.childIds.map((childId) => branchTexts(map, childId)) };
}

describe("duplicateBranch of a non-root node", () => {
  it("puts the copy right after the original among its siblings", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "a" });

    expect(getNode(map, "r").childIds).toEqual(["a", firstNodeId, "b", "c"]);
    expect(getNode(map, firstNodeId ?? "").parentId).toBe("r");
  });

  it("puts the copy after the last sibling when the original is last", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "c" });

    expect(getNode(map, "r").childIds).toEqual(["a", "b", "c", firstNodeId]);
  });

  it("copies the whole branch with texts and structure", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "a" });

    expect(branchTexts(map, firstNodeId ?? "")).toEqual(branchTexts(MAP, "a"));
  });

  it("gives every copied node a new id unique within the map", () => {
    const { map } = duplicateBranch(MAP, { nodeId: "a" });

    expect(map.nodes.size).toBe(MAP.nodes.size + 3);
    expect(new Set(map.nodes.keys()).size).toBe(map.nodes.size);
  });

  it("keeps the colours, the collapsed flag and the side of the copied nodes", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "a" });

    const copy = getNode(map, firstNodeId ?? "");
    expect(copy.state).toEqual({ side: "left", color: "red", collapsed: true });
    expect(getNode(map, copy.childIds[0] ?? "").state).toEqual({ color: "green", custom: 7 });
  });

  it("does not copy manual positions", () => {
    const { map } = duplicateBranch(MAP, { nodeId: "a" });

    const copies = [...map.nodes.values()].filter((node) => !MAP.nodes.has(node.id));
    for (const node of copies) {
      expect(readManualPosition(node.state)).toBeUndefined();
    }
  });

  it("leaves the original branch untouched", () => {
    const { map } = duplicateBranch(MAP, { nodeId: "a" });

    for (const id of ["a", "a1", "a2", "b", "c", "r2"]) expect(map.nodes.get(id)).toEqual(MAP.nodes.get(id));
  });

  it("gives the copy no side-pending flag so it does not jump sides", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "a" });

    expect(getNode(map, firstNodeId ?? "").isSidePending).toBeUndefined();
  });

  it("does not change the original map", () => {
    duplicateBranch(MAP, { nodeId: "a" });

    expect(getNode(MAP, "r").childIds).toEqual(["a", "b", "c"]);
  });
});

describe("duplicateBranch of a root", () => {
  it("adds a new root right after the original", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "r" });

    expect(map.rootIds).toEqual(["r", firstNodeId, "r2"]);
    expect(getNode(map, firstNodeId ?? "").parentId).toBeNull();
  });

  it("leaves the new root without a saved position", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "r" });

    expect(getNode(map, firstNodeId ?? "").state).toEqual({ color: "purple" });
  });

  it("copies the root's whole tree", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "r" });

    expect(branchTexts(map, firstNodeId ?? "")).toEqual(branchTexts(MAP, "r"));
  });

  it("drops positions from every node of the copied tree", () => {
    const { map, firstNodeId } = duplicateBranch(MAP, { nodeId: "r" });

    const copyA = getNode(map, getNode(map, firstNodeId ?? "").childIds[0] ?? "");
    expect(copyA.state).toEqual({ side: "left", color: "red", collapsed: true });
  });
});

describe("undoing a duplicate", () => {
  it("restores the previous map in one history step", () => {
    const history = new History();
    history.push(MAP);
    const { map } = duplicateBranch(MAP, { nodeId: "r" });

    expect(history.undo(map)).toBe(MAP);
    expect(history.canUndo).toBe(false);
  });
});
