import { describe, expect, it } from "vitest";
import { hasMindmapFlag } from "./frontmatter";
import { buildNewMapText } from "./newMapFile";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("buildNewMapText", () => {
  it("parses to exactly one root with empty text", () => {
    const { map } = parseMapFile(buildNewMapText(seededRandom(1)));

    expect(map.rootIds).toHaveLength(1);
    const root = map.nodes.get(map.rootIds[0] ?? "");
    expect(root?.text).toBe("");
    expect(root?.childIds).toEqual([]);
  });

  it("gives the root a 6-character id written in the file", () => {
    const text = buildNewMapText(seededRandom(2));

    const { map, source } = parseMapFile(text);
    const rootId = map.rootIds[0] ?? "";
    expect(rootId).toMatch(/^[a-z0-9]{6}$/);
    expect(source.items.get(rootId)?.hasWrittenId).toBe(true);
    expect(text).toContain(`^${rootId}`);
  });

  it("generates different ids for different random sources", () => {
    const first = parseMapFile(buildNewMapText(seededRandom(3))).map.rootIds[0];
    const second = parseMapFile(buildNewMapText(seededRandom(4))).map.rootIds[0];

    expect(first).not.toBe(second);
  });

  it("starts with mindmap: true frontmatter", () => {
    const text = buildNewMapText(seededRandom(5));

    expect(text.startsWith("---\nmindmap: true\n---\n")).toBe(true);
    expect(hasMindmapFlag(text)).toBe(true);
  });

  it("puts the empty root item after the frontmatter, separated by a blank line", () => {
    const text = buildNewMapText(seededRandom(9));

    expect(text).toMatch(/^---\nmindmap: true\n---\n\n- \^[a-z0-9]{6}\n$/);
  });

  it("round-trips byte-identical through parse and serialize", () => {
    const text = buildNewMapText(seededRandom(6));

    const { map, source } = parseMapFile(text, seededRandom(7));

    expect(serializeMapFile(map, source)).toBe(text);
  });

  it("does not add a JSON block", () => {
    expect(buildNewMapText(seededRandom(8))).not.toContain("```");
  });
});
