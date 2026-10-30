import { describe, expect, it } from "vitest";
import { getNode, readManualPosition, withManualPosition, withNodeState, withoutManualPosition } from "../model";
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
  "",
].join("\n");

function jsonNodes(text: string): Record<string, unknown> {
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  if (match?.[1] === undefined) throw new Error("no JSON block");
  const parsed = JSON.parse(match[1]) as { nodes: Record<string, unknown> };
  return parsed.nodes;
}

function setNodePosition(map: MindMap, { nodeId, position }: { nodeId: string; position: { x: number; y: number } }): MindMap {
  return withNodeState(map, nodeId, withManualPosition(getNode(map, nodeId).state, position));
}

function clearNodePosition(map: MindMap, nodeId: string): MindMap {
  return withNodeState(map, nodeId, withoutManualPosition(getNode(map, nodeId).state));
}

function moveAndSave(nodeId: string, position: { x: number; y: number }, source = FILE): string {
  const { map, source: layout } = parseMapFile(source);
  return serializeMapFile(setNodePosition(map, { nodeId, position }), layout);
}

describe("persisting a manual position", () => {
  it("writes the offset of a moved non-root as x and y on that node", () => {
    const text = moveAndSave("d4e5f6", { x: 25, y: -60 });

    expect(jsonNodes(text)).toEqual({ d4e5f6: { x: 25, y: -60 } });
  });

  it("writes the absolute position of a moved root as x and y on that root", () => {
    const text = moveAndSave("m3n4o5", { x: 800, y: 120 });

    expect(jsonNodes(text)).toEqual({ m3n4o5: { x: 800, y: 120 } });
  });

  it("keeps a moved node at the same place after saving and reopening the file", () => {
    const text = moveAndSave("d4e5f6", { x: 25, y: -60 });

    const reopened = parseMapFile(text).map;

    expect(readManualPosition(getNode(reopened, "d4e5f6").state)).toEqual({ x: 25, y: -60 });
  });

  it("keeps the list text of the file unchanged when only a position changed", () => {
    const text = moveAndSave("d4e5f6", { x: 25, y: -60 });

    expect(text.split("%%")[0]?.trimEnd()).toBe(FILE.trimEnd());
  });

  it("does not leave a position on nodes that were not moved", () => {
    const reopened = parseMapFile(moveAndSave("d4e5f6", { x: 25, y: -60 })).map;

    expect(getNode(reopened, "z9y8x7").state).toBeUndefined();
    expect(getNode(reopened, "a1b2c3").state).toBeUndefined();
  });

  it("removes a node from the JSON block when its position is reset", () => {
    const moved = parseMapFile(moveAndSave("d4e5f6", { x: 25, y: -60 }));

    const text = serializeMapFile(clearNodePosition(moved.map, "d4e5f6"), moved.source);

    expect(jsonNodes(text)).toEqual({});
  });

  it("keeps a root position in the JSON block when only non-root positions are cleared", () => {
    const { map, source } = parseMapFile(moveAndSave("m3n4o5", { x: 800, y: 120 }));
    const moved = setNodePosition(setNodePosition(map, { nodeId: "z9y8x7", position: { x: 1, y: 2 } }), {
      nodeId: "d4e5f6",
      position: { x: 3, y: 4 },
    });

    const text = serializeMapFile(clearNodePosition(clearNodePosition(moved, "z9y8x7"), "d4e5f6"), source);

    expect(jsonNodes(text)).toEqual({ m3n4o5: { x: 800, y: 120 } });
  });
});

describe("persisting a position of a node that had no id in the file", () => {
  const PENDING_FILE = "---\nmindmap: true\n---\n- Main\n\t- Sub\n";

  it("writes the id into the list item and keys the position by it", () => {
    const { map, source } = parseMapFile(PENDING_FILE);
    const subId = map.nodes.get(map.rootIds[0] ?? "")?.childIds[0] ?? "";

    const text = serializeMapFile(setNodePosition(map, { nodeId: subId, position: { x: 9, y: 8 } }), source);

    expect(text).toContain(`\t- Sub ^${subId}`);
    expect(jsonNodes(text)[subId]).toEqual({ x: 9, y: 8 });
  });
});
