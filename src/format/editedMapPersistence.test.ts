import { describe, expect, it } from "vitest";
import {
  generateNodeId,
  getNode,
  readRootPosition,
  withNewChild,
  withNewRoot,
  withNewSibling,
  withRootPosition,
  withSide,
  withoutBranch,
} from "../model";
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
  "%%",
  "```json",
  "{",
  '"version": 1,',
  '"nodes": {',
  '"d4e5f6": {"x": 40, "y": -20},',
  '"z9y8x7": {"x": 1, "y": 2},',
  '"m3n4o5": {"x": 500, "y": 0}',
  "},",
  '"style": {}',
  "}",
  "```",
  "%%",
].join("\n");

function freshId(map: MindMap): string {
  return generateNodeId(new Set(map.nodes.keys()), seededRandom());
}

function seededRandom(): () => number {
  let state = 12345;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function structure(map: MindMap): string[] {
  return map.rootIds.flatMap(function walk(id): string[] {
    const node = getNode(map, id);
    return [`${node.parentId ?? "-"}>${id}:${node.text}`, ...node.childIds.flatMap(walk)];
  });
}

describe("persisting a newly added node", () => {
  it("writes the new child as the last child with its generated id and reads it back", () => {
    const { map, source } = parseMapFile(FILE);
    const id = freshId(map);
    const edited = withNewChild(map, { parentId: "a1b2c3", id, text: "Fresh" });

    const text = serializeMapFile(edited, source);

    expect(text).toContain(`\t- Fresh ^${id}`);
    expect(text.indexOf(`^${id}`)).toBeGreaterThan(text.indexOf("^g7h8i9"));
    expect(text.indexOf(`^${id}`)).toBeLessThan(text.indexOf("^m3n4o5"));
    expect(structure(parseMapFile(text).map)).toEqual(structure(edited));
  });

  it("writes a new sibling right after the anchor's whole subtree", () => {
    const { map, source } = parseMapFile(FILE);
    const id = freshId(map);
    const edited = withNewSibling(map, "d4e5f6", { id, text: "Next" });

    const text = serializeMapFile(edited, source);

    const lines = text.split("\n");
    const deepLine = lines.findIndex((line) => line.includes("^z9y8x7"));
    expect(lines[deepLine + 1]).toBe(`\t- Next ^${id}`);
    expect(structure(parseMapFile(text).map)).toEqual(structure(edited));
  });

  it("writes a new root right after the selected root's tree, before the next root", () => {
    const { map, source } = parseMapFile(FILE);
    const id = freshId(map);
    const edited = withNewSibling(map, "a1b2c3", { id, text: "Between" });

    const text = serializeMapFile(edited, source);

    expect(text).toContain(`\t- Other ^g7h8i9\n- Between ^${id}\n- Second ^m3n4o5`);
    expect(parseMapFile(text).map.rootIds).toEqual(["a1b2c3", id, "m3n4o5"]);
  });

  it("writes the position of a new root in the JSON block and reads it back", () => {
    const { map, source } = parseMapFile(FILE);
    const id = freshId(map);
    const state = withRootPosition(undefined, { x: 40, y: 310 });
    const edited = withNewSibling(map, "a1b2c3", { id, text: "Below", state });

    const text = serializeMapFile(edited, source);

    expect(text).toContain(`"${id}": {"x":40,"y":310}`);
    const reread = parseMapFile(text).map;
    expect(readRootPosition(getNode(reread, id).state)).toEqual({ x: 40, y: 310 });
    expect(reread.rootIds).toEqual(["a1b2c3", id, "m3n4o5"]);
  });

  it("keeps the layout positions of existing nodes", () => {
    const { map, source } = parseMapFile(FILE);
    const edited = withNewChild(map, { parentId: "a1b2c3", id: freshId(map), text: "Fresh" });

    const text = serializeMapFile(edited, source);

    expect(text).toContain('"d4e5f6": {"x":40,"y":-20}');
    expect(text).toContain('"m3n4o5": {"x":500,"y":0}');
  });

  it("records the side of a new left first-level branch in the JSON block", () => {
    const { map, source } = parseMapFile(FILE);
    const id = freshId(map);
    const edited = withNewChild(map, { parentId: "a1b2c3", id, text: "Left one", state: withSide(undefined, "left") });

    const text = serializeMapFile(edited, source);

    expect(getNode(parseMapFile(text).map, id).state).toEqual({ side: "left" });
  });
});

describe("persisting a root added at a position", () => {
  const POSITION = { x: 120, y: -45 };

  function addRootAt(text: string) {
    const { map, source } = parseMapFile(text);
    const id = freshId(map);
    const edited = withNewRoot(map, { id, text: "Fresh", state: withRootPosition(undefined, POSITION) });
    return { id, edited, written: serializeMapFile(edited, source) };
  }

  it("writes the new root as the last top-level item", () => {
    const { id, written } = addRootAt(FILE);

    const listLines = written.split("\n").filter((line) => /^- /.test(line));
    expect(listLines[listLines.length - 1]).toBe(`- Fresh ^${id}`);
    expect(parseMapFile(written).map.rootIds).toEqual(["a1b2c3", "m3n4o5", id]);
  });

  it("puts the absolute x and y into the JSON block and reads them back", () => {
    const { id, written } = addRootAt(FILE);

    expect(written).toContain(`"${id}": {"x":120,"y":-45}`);
    expect(readRootPosition(getNode(parseMapFile(written).map, id).state)).toEqual(POSITION);
  });

  it("keeps the existing positions", () => {
    const { written } = addRootAt(FILE);

    expect(written).toContain('"m3n4o5": {"x":500,"y":0}');
    expect(written).toContain('"d4e5f6": {"x":40,"y":-20}');
  });

  it("gives an empty map its first root with the position", () => {
    const { id, written } = addRootAt("---\nmindmap: true\n---\n");

    const reread = parseMapFile(written).map;
    expect(reread.rootIds).toEqual([id]);
    expect(readRootPosition(getNode(reread, id).state)).toEqual(POSITION);
  });
});

describe("persisting a deleted branch", () => {
  it("drops the branch lines of the node and all its descendants", () => {
    const { map, source } = parseMapFile(FILE);

    const text = serializeMapFile(withoutBranch(map, "d4e5f6"), source);

    expect(text).not.toContain("Sub");
    expect(text).not.toContain("Deep");
    expect(text).toContain("\t- Other ^g7h8i9");
  });

  it("drops the JSON entries of every deleted id and keeps the others", () => {
    const { map, source } = parseMapFile(FILE);

    const text = serializeMapFile(withoutBranch(map, "d4e5f6"), source);

    expect(text).not.toContain("d4e5f6");
    expect(text).not.toContain("z9y8x7");
    expect(text).toContain('"m3n4o5": {"x":500,"y":0}');
  });

  it("reads back as the edited map", () => {
    const { map, source } = parseMapFile(FILE);
    const edited = withoutBranch(map, "a1b2c3");

    const reread = parseMapFile(serializeMapFile(edited, source)).map;

    expect(structure(reread)).toEqual(structure(edited));
    expect(reread.rootIds).toEqual(["m3n4o5"]);
  });

  it("leaves text outside the list untouched", () => {
    const { map, source } = parseMapFile(FILE);

    const text = serializeMapFile(withoutBranch(map, "m3n4o5"), source);

    expect(text.startsWith("---\nmindmap: true\n---\n")).toBe(true);
    expect(text).toContain("```json");
  });
});
