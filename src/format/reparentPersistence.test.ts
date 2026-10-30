import { describe, expect, it } from "vitest";
import { getNode, withMovedBranch, withNodeState, withSide, withoutManualPosition } from "../model";
import type { MindMap } from "../model";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

const FILE = [
  "---",
  "mindmap: true",
  "---",
  "- Main ^a1b2c3",
  "\t- Sub ^d4e5f6",
  "\t\t- Deep ^z9y8x7",
  "\t- Other ^g7h8i9",
  "- Second ^m3n4o5",
  "\t- Second child ^p1q2r3",
  "",
].join("\n");

// format/ must not depend on commands/, so the move is built from the model helpers the command uses.
function reparentNode(map: MindMap, { nodeId, newParentId, side }: { nodeId: string; newParentId: string; side: "left" | "right" }): MindMap {
  const isRootTarget = getNode(map, newParentId).parentId === null;
  const state = withSide(withoutManualPosition(getNode(map, nodeId).state), isRootTarget ? side : "right");
  return withMovedBranch(map, nodeId, newParentId, state);
}

function reparentAndSave(nodeId: string, newParentId: string, source = FILE): string {
  const { map, source: layout } = parseMapFile(source);
  return serializeMapFile(reparentNode(map, { nodeId, newParentId, side: "right" }), layout);
}

function listPart(text: string): string[] {
  return text.split("\n").filter((line) => /^\s*- /.test(line));
}

function parentOf(map: MindMap, id: string): string | null {
  return getNode(map, id).parentId;
}

describe("persisting a change of parent", () => {
  it("moves the item with its nested items under the new parent as the last child", () => {
    const text = reparentAndSave("d4e5f6", "m3n4o5");

    expect(listPart(text)).toEqual([
      "- Main ^a1b2c3",
      "\t- Other ^g7h8i9",
      "- Second ^m3n4o5",
      "\t- Second child ^p1q2r3",
      "\t- Sub ^d4e5f6",
      "\t\t- Deep ^z9y8x7",
    ]);
  });

  it("keeps every id marker exactly once", () => {
    const text = reparentAndSave("d4e5f6", "m3n4o5");

    for (const id of ["a1b2c3", "d4e5f6", "z9y8x7", "g7h8i9", "m3n4o5", "p1q2r3"]) {
      expect(text.split(`^${id}`)).toHaveLength(2);
    }
  });

  it("indents a root that becomes a child together with its subtree", () => {
    const text = reparentAndSave("m3n4o5", "g7h8i9");

    expect(listPart(text)).toEqual([
      "- Main ^a1b2c3",
      "\t- Sub ^d4e5f6",
      "\t\t- Deep ^z9y8x7",
      "\t- Other ^g7h8i9",
      "\t\t- Second ^m3n4o5",
      "\t\t\t- Second child ^p1q2r3",
    ]);
  });

  it("outdents nothing else: unrelated items stay where they were", () => {
    const text = reparentAndSave("z9y8x7", "g7h8i9");

    expect(listPart(text)).toEqual([
      "- Main ^a1b2c3",
      "\t- Sub ^d4e5f6",
      "\t- Other ^g7h8i9",
      "\t\t- Deep ^z9y8x7",
      "- Second ^m3n4o5",
      "\t- Second child ^p1q2r3",
    ]);
  });

  it("keeps the front matter intact", () => {
    expect(reparentAndSave("d4e5f6", "m3n4o5").startsWith("---\nmindmap: true\n---\n")).toBe(true);
  });

  it("parses back to the same tree that was saved", () => {
    const { map, source } = parseMapFile(FILE);
    const moved = reparentNode(map, { nodeId: "d4e5f6", newParentId: "m3n4o5", side: "right" });

    const reparsed = parseMapFile(serializeMapFile(moved, source)).map;

    expect(reparsed.rootIds).toEqual(["a1b2c3", "m3n4o5"]);
    expect(parentOf(reparsed, "d4e5f6")).toBe("m3n4o5");
    expect(parentOf(reparsed, "z9y8x7")).toBe("d4e5f6");
    expect(getNode(reparsed, "m3n4o5").childIds).toEqual(["p1q2r3", "d4e5f6"]);
    expect(getNode(reparsed, "a1b2c3").childIds).toEqual(["g7h8i9"]);
  });

  it("keeps the ids of every node after a round trip of a moved root", () => {
    const { map, source } = parseMapFile(FILE);
    const moved = reparentNode(map, { nodeId: "m3n4o5", newParentId: "g7h8i9", side: "right" });

    const reparsed = parseMapFile(serializeMapFile(moved, source)).map;

    expect([...reparsed.nodes.keys()].sort()).toEqual([...map.nodes.keys()].sort());
    expect(reparsed.rootIds).toEqual(["a1b2c3"]);
  });

  it("serializes a move into the node's own branch as the unchanged file", () => {
    expect(reparentAndSave("d4e5f6", "z9y8x7")).toBe(FILE);
  });

  it("stores a left side of a branch moved under a root in the JSON block, not in the list", () => {
    const { map, source } = parseMapFile(FILE);
    const moved = reparentNode(map, { nodeId: "z9y8x7", newParentId: "m3n4o5", side: "left" });

    const text = serializeMapFile(moved, source);

    expect(text).toMatch(/"z9y8x7":\s*\{\s*"side":\s*"left"\s*\}/);
    expect(parseMapFile(text).map.nodes.get("z9y8x7")?.state).toEqual({ side: "left" });
  });

  it("drops the x and y of the moved node from the JSON block", () => {
    const first = parseMapFile(FILE);
    const pinned = withNodeState(first.map, "d4e5f6", { x: 30, y: 40, color: "red" });
    const { map, source } = parseMapFile(serializeMapFile(pinned, first.source));
    const moved = reparentNode(map, { nodeId: "d4e5f6", newParentId: "m3n4o5", side: "right" });

    const text = serializeMapFile(moved, source);

    expect(text).not.toContain('"x"');
    expect(parseMapFile(text).map.nodes.get("d4e5f6")?.state).toEqual({ color: "red" });
  });
});

describe("persisting a change of parent in a file with other indentation", () => {
  const SPACES = ["- Main ^a1", "    - Sub ^b2", "        - Deep ^c3", "- Second ^d4", ""].join("\n");

  it("re-indents a moved root and its subtree with the file's own indent unit", () => {
    const { map, source } = parseMapFile(SPACES);
    const moved = reparentNode(map, { nodeId: "d4", newParentId: "b2", side: "right" });

    expect(listPart(serializeMapFile(moved, source))).toEqual([
      "- Main ^a1",
      "    - Sub ^b2",
      "        - Deep ^c3",
      "        - Second ^d4",
    ]);
  });

  it("outdents a nested item that becomes a first-level branch", () => {
    const { map, source } = parseMapFile(SPACES);
    const moved = reparentNode(map, { nodeId: "c3", newParentId: "d4", side: "right" });

    expect(listPart(serializeMapFile(moved, source))).toEqual(["- Main ^a1", "    - Sub ^b2", "- Second ^d4", "    - Deep ^c3"]);
  });

  it("keeps a multi-line item's continuation lines under its new bullet", () => {
    const text = "- Main ^a1\n- Two ^b2\n  lines\n";
    const { map, source } = parseMapFile(text);
    const moved = reparentNode(map, { nodeId: "b2", newParentId: "a1", side: "right" });

    expect(serializeMapFile(moved, source)).toBe("- Main ^a1\n\t- Two ^b2\n\t  lines\n");
  });
});

function treeOf(map: MindMap): string[] {
  const lines: string[] = [];
  const visit = (id: string, depth: number): void => {
    lines.push(`${"  ".repeat(depth)}${id}`);
    getNode(map, id).childIds.forEach((childId) => visit(childId, depth + 1));
  };
  map.rootIds.forEach((rootId) => visit(rootId, 0));
  return lines;
}

function reparsedTreeAfterMove(file: string, nodeId: string, newParentId: string): { saved: string[]; reparsed: string[] } {
  const { map, source } = parseMapFile(file);
  const moved = reparentNode(map, { nodeId, newParentId, side: "right" });
  return { saved: treeOf(moved), reparsed: treeOf(parseMapFile(serializeMapFile(moved, source)).map) };
}

describe("persisting a change of parent of the last item of a file without a trailing newline", () => {
  const NO_FINAL_NEWLINE = "- A ^a1\n\t- A child ^a2\n- B ^b1\n- C ^c1";

  it("ends the moved item's line before the items that now follow it", () => {
    const { map, source } = parseMapFile(NO_FINAL_NEWLINE);

    const text = serializeMapFile(reparentNode(map, { nodeId: "c1", newParentId: "a1", side: "right" }), source);

    expect(listPart(text)).toEqual(["- A ^a1", "\t- A child ^a2", "\t- C ^c1", "- B ^b1"]);
  });

  it("parses back to the same tree", () => {
    const { saved, reparsed } = reparsedTreeAfterMove(NO_FINAL_NEWLINE, "c1", "a1");

    expect(reparsed).toEqual(saved);
  });
});

describe("persisting a change of parent in a file with uneven indentation", () => {
  it("nests the moved item under a parent indented deeper than the file's indent unit suggests", () => {
    const file = "- A ^a1\n  - B ^b1\n      - C ^c1\n- D ^d1\n";

    const { saved, reparsed } = reparsedTreeAfterMove(file, "d1", "c1");

    expect(reparsed).toEqual(saved);
  });

  it("nests the moved item under a tab-indented parent in a file indented with spaces", () => {
    const file = "- A ^a1\n  - B ^b1\n- C ^c1\n\t- D ^d1\n- E ^e1\n";

    const { saved, reparsed } = reparsedTreeAfterMove(file, "e1", "d1");

    expect(reparsed).toEqual(saved);
  });

  it("lines the moved item up with the existing children of its new parent", () => {
    const file = "- A ^a1\n      - A1 ^a2\n- B ^b1\n";
    const { map, source } = parseMapFile(file);

    const text = serializeMapFile(reparentNode(map, { nodeId: "b1", newParentId: "a1", side: "right" }), source);

    expect(listPart(text)).toEqual(["- A ^a1", "      - A1 ^a2", "      - B ^b1"]);
  });

  it("keeps the moved item's children nested under it", () => {
    const file = "- A ^a1\n  - B ^b1\n      - C ^c1\n- D ^d1\n  - D1 ^d2\n";

    const { saved, reparsed } = reparsedTreeAfterMove(file, "d1", "c1");

    expect(reparsed).toEqual(saved);
  });

  it("re-indents an item that keeps its depth but moves under a parent indented differently", () => {
    const file = "- P ^p1\n  - X ^x1\n- Q ^q1\n      - Q1 ^q2\n";

    const { saved, reparsed } = reparsedTreeAfterMove(file, "x1", "q1");

    expect(reparsed).toEqual(saved);
  });
});

describe("persisting a branch moved to the end of its own parent in a file with uneven indentation", () => {
  it("does not nest the moved item under the shallower sibling it now follows", () => {
    const file = "- A ^a1\n    - B ^b1\n  - C ^c1\n";

    const { saved, reparsed } = reparsedTreeAfterMove(file, "b1", "a1");

    expect(reparsed).toEqual(saved);
  });
});
