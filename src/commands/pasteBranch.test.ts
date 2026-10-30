import { describe, expect, it } from "vitest";
import { buildMindMap, getNode, isNodeCollapsed } from "../model";
import type { BranchDraft, MindMap, NodeId } from "../model";
import { History } from "./history";
import { pasteBranch } from "./pasteBranch";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r", state: { side: "left", color: "red" } },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r" },
  { id: "r2", text: "Second", parentId: null, state: { x: 5, y: 6 } },
]);

function leaf(text: string): BranchDraft {
  return { text, children: [] };
}

function textsOf(map: MindMap, ids: readonly NodeId[]): string[] {
  return ids.map((id) => getNode(map, id).text);
}

const NESTED: BranchDraft[] = [
  { text: "P1", children: [{ text: "P1a", children: [leaf("P1a1")] }, leaf("P1b")] },
  leaf("P2"),
];

describe("pasteBranch under a target node", () => {
  it("adds the pasted tops as the last children of the target in order", () => {
    const { map } = pasteBranch(MAP, { drafts: NESTED, targetId: "b" });

    expect(textsOf(map, getNode(map, "b").childIds)).toEqual(["P1", "P2"]);
  });

  it("keeps the existing children of the target before the pasted ones", () => {
    const { map } = pasteBranch(MAP, { drafts: [leaf("New")], targetId: "a" });

    expect(getNode(map, "a").childIds[0]).toBe("a1");
    expect(textsOf(map, getNode(map, "a").childIds)).toEqual(["A1", "New"]);
  });

  it("recreates the nested structure of the drafts", () => {
    const { map, firstNodeId } = pasteBranch(MAP, { drafts: NESTED, targetId: "b" });

    const p1 = getNode(map, firstNodeId ?? "");
    expect(textsOf(map, p1.childIds)).toEqual(["P1a", "P1b"]);
    expect(textsOf(map, getNode(map, p1.childIds[0] ?? "").childIds)).toEqual(["P1a1"]);
    expect(getNode(map, p1.childIds[0] ?? "").parentId).toBe(p1.id);
  });

  it("reports the top of the first pasted branch", () => {
    const { map, firstNodeId } = pasteBranch(MAP, { drafts: NESTED, targetId: "b" });

    expect(getNode(map, firstNodeId ?? "").text).toBe("P1");
    expect(getNode(map, firstNodeId ?? "").parentId).toBe("b");
  });

  it("gives every pasted node an id that is new to the map and unique", () => {
    const { map } = pasteBranch(MAP, { drafts: NESTED, targetId: "b" });

    const newIds = [...map.nodes.keys()].filter((id) => !MAP.nodes.has(id));
    expect(newIds).toHaveLength(5);
    expect(new Set(newIds).size).toBe(5);
  });

  it("leaves every existing node unchanged apart from the target's children", () => {
    const { map } = pasteBranch(MAP, { drafts: NESTED, targetId: "b" });

    for (const [id, node] of MAP.nodes) {
      if (id !== "b") expect(map.nodes.get(id)).toEqual(node);
    }
    expect(map.rootIds).toEqual(MAP.rootIds);
  });

  it("does not change the original map", () => {
    pasteBranch(MAP, { drafts: NESTED, targetId: "b" });

    expect(getNode(MAP, "b").childIds).toEqual([]);
    expect(MAP.nodes.size).toBe(5);
  });

  it("places the pasted tops on the chosen side when the target is a root", () => {
    const { map } = pasteBranch(MAP, { drafts: NESTED, targetId: "r", side: "left" });

    const [p1, p2] = getNode(map, "r").childIds.slice(-2);
    expect(getNode(map, p1 ?? "").state).toEqual({ side: "left" });
    expect(getNode(map, p2 ?? "").state).toEqual({ side: "left" });
  });

  it("writes no side for tops pasted to the right of a root", () => {
    const { map } = pasteBranch(MAP, { drafts: [leaf("New")], targetId: "r" });

    expect(getNode(map, getNode(map, "r").childIds[2] ?? "").state).toBeUndefined();
  });

  it("gives deeper pasted nodes no side or state", () => {
    const { map, firstNodeId } = pasteBranch(MAP, { drafts: NESTED, targetId: "r", side: "left" });

    const p1 = getNode(map, firstNodeId ?? "");
    expect(getNode(map, p1.childIds[0] ?? "").state).toBeUndefined();
    expect(getNode(map, p1.childIds[0] ?? "").isSidePending).toBeUndefined();
  });

  it("ignores the side when the target is not a root", () => {
    const { map } = pasteBranch(MAP, { drafts: [leaf("New")], targetId: "a", side: "left" });

    expect(getNode(map, getNode(map, "a").childIds[1] ?? "").state).toBeUndefined();
  });

  it("expands a collapsed target so the pasted nodes show", () => {
    const collapsed = buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "c", text: "C", parentId: "r", state: { collapsed: true, color: "green" } },
      { id: "c1", text: "C1", parentId: "c" },
    ]);

    const { map } = pasteBranch(collapsed, { drafts: [leaf("New")], targetId: "c" });

    expect(isNodeCollapsed(getNode(map, "c"))).toBe(false);
    expect(getNode(map, "c").state).toEqual({ color: "green" });
  });

  it("keeps text exactly as drafted, including multi-line and fence-like text", () => {
    const text = "line one\n```json\n{}\n```";

    const { map, firstNodeId } = pasteBranch(MAP, { drafts: [leaf(text)], targetId: "b" });

    expect(getNode(map, firstNodeId ?? "").text).toBe(text);
  });
});

describe("pasteBranch without a target", () => {
  it("adds the pasted tops as new roots after the existing ones, in order", () => {
    const { map } = pasteBranch(MAP, { drafts: NESTED, targetId: null });

    expect(map.rootIds.slice(0, 2)).toEqual(["r", "r2"]);
    expect(textsOf(map, map.rootIds)).toEqual(["Root", "Second", "P1", "P2"]);
  });

  it("gives new roots no saved position", () => {
    const { map } = pasteBranch(MAP, { drafts: NESTED, targetId: null });

    for (const id of map.rootIds.slice(2)) {
      expect(getNode(map, id).state).toBeUndefined();
      expect(getNode(map, id).parentId).toBeNull();
    }
  });

  it("leaves the sides of the root's first-level children pending for the layout", () => {
    const { map, firstNodeId } = pasteBranch(MAP, { drafts: NESTED, targetId: null });

    const p1 = getNode(map, firstNodeId ?? "");
    expect(p1.childIds.map((id) => getNode(map, id).isSidePending)).toEqual([true, true]);
  });

  it("does not mark deeper nodes as side pending", () => {
    const { map, firstNodeId } = pasteBranch(MAP, { drafts: NESTED, targetId: null });

    const p1a = getNode(map, getNode(map, firstNodeId ?? "").childIds[0] ?? "");
    expect(getNode(map, p1a.childIds[0] ?? "").isSidePending).toBeUndefined();
  });

  it("works on an empty map", () => {
    const { map } = pasteBranch(buildMindMap([]), { drafts: [leaf("Only")], targetId: null });

    expect(textsOf(map, map.rootIds)).toEqual(["Only"]);
  });
});

describe("pasteBranch with nothing to paste", () => {
  it.each([["a target", "b"], ["no target", null]] as const)("returns the very same map for no drafts and %s", (_name, targetId) => {
    const result = pasteBranch(MAP, { drafts: [], targetId });

    expect(result.map).toBe(MAP);
    expect(result.firstNodeId).toBeNull();
  });

  it("does not expand a collapsed target when there is nothing to paste", () => {
    const collapsed = buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "c", text: "C", parentId: "r", state: { collapsed: true } },
    ]);

    expect(pasteBranch(collapsed, { drafts: [], targetId: "c" }).map).toBe(collapsed);
  });
});

describe("undoing a paste", () => {
  it("restores the previous map in one history step", () => {
    const history = new History();
    history.push(MAP);
    const { map } = pasteBranch(MAP, { drafts: NESTED, targetId: "b" });

    const undone = history.undo(map);

    expect(undone).toBe(MAP);
    expect(history.canUndo).toBe(false);
  });
});
