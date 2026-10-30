import { describe, expect, it } from "vitest";
import { effectiveColor, getNode, withColor, withNodeState } from "../model";
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
  "",
].join("\n");

function setNodeColor(map: MindMap, { nodeId, color }: { nodeId: string; color: Parameters<typeof withColor>[1] }): MindMap {
  return withNodeState(map, nodeId, withColor(getNode(map, nodeId).state, color));
}

function jsonOf(text: string): unknown {
  const body = /```json\n([\s\S]*?)\n```/.exec(text)?.[1];
  if (body === undefined) throw new Error("no json block");
  return JSON.parse(body);
}

function saveAndReopen(map: MindMap, source: ReturnType<typeof parseMapFile>["source"]): MindMap {
  return parseMapFile(serializeMapFile(map, source)).map;
}

describe("persisting node colours", () => {
  it.each(["red", "orange", "yellow", "green", "cyan", "purple"] as const)("writes %s by its name and reads it back", (color) => {
    const { map, source } = parseMapFile(FILE);

    const text = serializeMapFile(setNodeColor(map, { nodeId: "d4e5f6", color }), source);

    expect(jsonOf(text)).toMatchObject({ nodes: { d4e5f6: { color } } });
    expect(getNode(parseMapFile(text).map, "d4e5f6").state).toEqual({ color });
  });

  it("keeps the colour next to other fields of the node", () => {
    const { map, source } = parseMapFile(FILE);
    const moved = withNodeState(map, "d4e5f6", { x: 40, y: -20, pinned: true });

    const reopened = saveAndReopen(setNodeColor(moved, { nodeId: "d4e5f6", color: "red" }), source);

    expect(getNode(reopened, "d4e5f6").state).toEqual({ x: 40, y: -20, pinned: true, color: "red" });
  });

  it("keeps descendants inheriting the colour after reopening, with nothing written for them", () => {
    const { map, source } = parseMapFile(FILE);

    const text = serializeMapFile(setNodeColor(map, { nodeId: "d4e5f6", color: "green" }), source);

    expect(effectiveColor(parseMapFile(text).map, "z9y8x7")).toBe("green");
    expect(jsonOf(text)).not.toHaveProperty("nodes.z9y8x7");
  });

  it("leaves other nodes uncoloured after reopening", () => {
    const { map, source } = parseMapFile(FILE);

    const reopened = saveAndReopen(setNodeColor(map, { nodeId: "d4e5f6", color: "green" }), source);

    expect(effectiveColor(reopened, "g7h8i9")).toBeUndefined();
    expect(effectiveColor(reopened, "a1b2c3")).toBeUndefined();
  });

  it("drops the colour from the JSON when it is cleared", () => {
    const { map, source } = parseMapFile(FILE);
    const coloured = setNodeColor(map, { nodeId: "d4e5f6", color: "red" });

    const text = serializeMapFile(setNodeColor(coloured, { nodeId: "d4e5f6", color: undefined }), source);

    expect(text).not.toContain("color");
  });
});

describe("tolerating stored colour values", () => {
  function withStoredColor(value: string): string {
    return [
      FILE,
      "%%",
      "```json",
      JSON.stringify({ version: 1, nodes: { d4e5f6: { color: JSON.parse(value) } }, style: {} }),
      "```",
      "%%",
      "",
    ].join("\n");
  }

  it("reads null as no colour", () => {
    const { map } = parseMapFile(withStoredColor("null"));

    expect(effectiveColor(map, "d4e5f6")).toBeUndefined();
  });

  it("reads an unknown name as no colour and inherits instead", () => {
    const { map } = parseMapFile(withStoredColor('"magenta"'));

    expect(effectiveColor(map, "d4e5f6")).toBeUndefined();
    expect(effectiveColor(map, "z9y8x7")).toBeUndefined();
  });

  it("preserves an unknown name when the file is saved untouched", () => {
    const { map, source } = parseMapFile(withStoredColor('"magenta"'));

    const text = serializeMapFile(map, source);

    expect(jsonOf(text)).toMatchObject({ nodes: { d4e5f6: { color: "magenta" } } });
  });

  it("preserves a non-string value when the file is saved untouched", () => {
    const { map, source } = parseMapFile(withStoredColor("42"));

    expect(jsonOf(serializeMapFile(map, source))).toMatchObject({ nodes: { d4e5f6: { color: 42 } } });
  });
});
