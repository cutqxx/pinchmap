import { describe, expect, it } from "vitest";
import { getNode, isNodeCollapsed, withNodeState } from "../model";
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

function collapse(map: MindMap, id: string): MindMap {
  return withNodeState(map, id, { ...getNode(map, id).state, collapsed: true });
}

function saveAndReopen(map: MindMap, source: ReturnType<typeof parseMapFile>["source"]): MindMap {
  return parseMapFile(serializeMapFile(map, source)).map;
}

describe("persisting collapsed branches", () => {
  it("writes the collapsed flag into the JSON state and reads it back", () => {
    const { map, source } = parseMapFile(FILE);

    const text = serializeMapFile(collapse(map, "d4e5f6"), source);

    expect(text).toContain('"collapsed":true');
    expect(isNodeCollapsed(getNode(parseMapFile(text).map, "d4e5f6"))).toBe(true);
  });

  it("keeps other nodes expanded after reopening", () => {
    const { map, source } = parseMapFile(FILE);

    const reopened = saveAndReopen(collapse(map, "d4e5f6"), source);

    expect(isNodeCollapsed(getNode(reopened, "a1b2c3"))).toBe(false);
    expect(isNodeCollapsed(getNode(reopened, "g7h8i9"))).toBe(false);
  });

  it("keeps the collapsed node's children in the list", () => {
    const { map, source } = parseMapFile(FILE);

    const reopened = saveAndReopen(collapse(map, "d4e5f6"), source);

    expect(getNode(reopened, "d4e5f6").childIds).toEqual(["z9y8x7"]);
  });

  it("keeps the other state fields next to the flag", () => {
    const { map, source } = parseMapFile(FILE);
    const colored = withNodeState(map, "d4e5f6", { color: "red", collapsed: true });

    const reopened = saveAndReopen(colored, source);

    expect(getNode(reopened, "d4e5f6").state).toEqual({ color: "red", collapsed: true });
  });

  it("round-trips a collapsed root", () => {
    const { map, source } = parseMapFile(FILE);

    const reopened = saveAndReopen(collapse(map, "a1b2c3"), source);

    expect(isNodeCollapsed(getNode(reopened, "a1b2c3"))).toBe(true);
  });

  it("writes no flag once the branch is expanded again", () => {
    const { map, source } = parseMapFile(FILE);
    const expanded = withNodeState(collapse(map, "d4e5f6"), "d4e5f6", undefined);

    expect(serializeMapFile(expanded, source)).not.toContain("collapsed");
  });
});
