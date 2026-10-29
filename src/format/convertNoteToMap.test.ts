import { describe, expect, it } from "vitest";
import { hasMindmapFlag } from "./frontmatter";
import { convertNoteToMap } from "./convertNoteToMap";
import { parseMapFile } from "./parseMapFile";

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function convert(text: string, name = "Note", seed = 1): string {
  return convertNoteToMap(text, name, seededRandom(seed));
}

function stripIds(text: string): string {
  return text.replace(/ \^[a-z0-9]{6}(?=\r?\n|$)/g, "");
}

describe("convertNoteToMap with a list", () => {
  it("adds an id to every list item without one", () => {
    const result = convert("- a\n\t- b\n- c\n");

    const { map, source } = parseMapFile(result);
    expect(map.nodes.size).toBe(3);
    for (const item of source.items.values()) expect(item.hasWrittenId).toBe(true);
    expect(map.rootIds.map((id) => map.nodes.get(id)?.text)).toEqual(["a", "c"]);
  });

  it("generates distinct 6-character ids", () => {
    const { map } = parseMapFile(convert("- a\n- b\n- c\n- d\n"));

    const ids = [...map.nodes.keys()];
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{6}$/);
  });

  it("changes nothing but the flag and the ids", () => {
    const original = "---\ntitle: T\n---\nIntro paragraph\n\n- a\n\t- b\n- c\n\nOutro text\n";

    const result = convert(original);

    expect(stripIds(result)).toBe("---\ntitle: T\nmindmap: true\n---\nIntro paragraph\n\n- a\n\t- b\n- c\n\nOutro text\n");
  });

  it("keeps existing ids and only adds missing ones", () => {
    const result = convert("- a ^keep01\n- b\n");

    const { map } = parseMapFile(result);
    expect(map.rootIds[0]).toBe("keep01");
    expect(result.startsWith("---\nmindmap: true\n---\n- a ^keep01\n- b ^")).toBe(true);
    expect(result).toMatch(/- b \^[a-z0-9]{6}\n$/);
  });

  it("keeps the head text before the list byte-identical", () => {
    const head = "---\nauthor: me\n---\n# Title\n\nSome *text* here.\n\n";

    const result = convert(`${head}- a\n`);

    expect(result.startsWith("---\nauthor: me\nmindmap: true\n---\n# Title\n\nSome *text* here.\n\n- a ^")).toBe(true);
  });

  it("keeps the tail text after the list byte-identical", () => {
    const tail = "\n## After\ntext 1\ntext 2";

    const result = convert(`- a\n${tail}`);

    expect(result.endsWith(tail)).toBe(true);
  });

  it("does not append a new root when the note has a list", () => {
    const { map } = parseMapFile(convert("- a\n", "Note Name"));

    expect(map.rootIds).toHaveLength(1);
    expect(map.nodes.get(map.rootIds[0] ?? "")?.text).toBe("a");
  });

  it("keeps CRLF line endings throughout", () => {
    const result = convert("---\r\ntags: a\r\n---\r\nIntro\r\n\r\n- a\r\n\t- b\r\n");

    expect(result).not.toMatch(/(?<!\r)\n/);
    expect(stripIds(result)).toBe("---\r\ntags: a\r\nmindmap: true\r\n---\r\nIntro\r\n\r\n- a\r\n\t- b\r\n");
  });

  it("keeps a missing final newline missing", () => {
    const result = convert("- a\n- b");

    expect(result.endsWith("\n")).toBe(false);
    expect(stripIds(result)).toBe("---\nmindmap: true\n---\n- a\n- b");
  });
});

describe("convertNoteToMap without a list", () => {
  it("appends a root named after the note after a blank line", () => {
    const result = convert("Just some text\n", "My note", 5);

    const { map } = parseMapFile(result);
    expect(map.rootIds).toHaveLength(1);
    expect(map.nodes.get(map.rootIds[0] ?? "")?.text).toBe("My note");
    expect(result).toMatch(/^---\nmindmap: true\n---\nJust some text\n\n- My note \^[a-z0-9]{6}\n$/);
  });

  it("leaves the earlier text unchanged", () => {
    const original = "---\ntitle: T\n---\n# Heading\n\nParagraph one.\n\nParagraph two.\n";

    const result = convert(original, "N");

    expect(result.startsWith("---\ntitle: T\nmindmap: true\n---\n# Heading\n\nParagraph one.\n\nParagraph two.\n\n- N ^")).toBe(true);
  });

  it("does not add a second blank line when the text already ends with one", () => {
    const result = convert("Text\n\n", "N");

    expect(result).toMatch(/^---\nmindmap: true\n---\nText\n\n- N \^[a-z0-9]{6}\n$/);
  });

  it("terminates the last line before appending when the note has no trailing newline", () => {
    const result = convert("Text", "N");

    expect(result).toMatch(/^---\nmindmap: true\n---\nText\n\n- N \^[a-z0-9]{6}\n$/);
  });

  it("keeps existing CRLF text unchanged when appending the root", () => {
    const result = convert("Text\r\n", "N");

    expect(result.startsWith("---\r\nmindmap: true\r\n---\r\nText\r\n")).toBe(true);
    expect(parseMapFile(result).map.rootIds).toHaveLength(1);
  });

  it("uses CRLF for the appended blank line and root in a CRLF note", () => {
    const result = convert("Text\r\n", "N");

    expect(result).not.toMatch(/(?<!\r)\n/);
  });

  it("turns an empty note into a flagged map with one named root", () => {
    const result = convert("", "Empty");

    expect(result).toMatch(/^---\nmindmap: true\n---\n\n- Empty \^[a-z0-9]{6}\n$/);
    const { map } = parseMapFile(result);
    expect(map.rootIds).toHaveLength(1);
  });

  it("creates frontmatter when the note had none", () => {
    expect(hasMindmapFlag(convert("plain", "N"))).toBe(true);
  });

  it("keeps an existing valid JSON block untouched", () => {
    const json = '%%\n```json\n{\n"version": 1,\n"nodes": {},\n"style": {}\n}\n```\n%%\n';
    const original = `Text\n\n${json}`;

    const result = convert(original, "N");

    expect(result.startsWith("---\nmindmap: true\n---\nText\n\n")).toBe(true);
    expect(result).toContain(json);
    expect(parseMapFile(result).map.rootIds).toHaveLength(1);
  });

  it("keeps a corrupt JSON block text in the file and still produces a one-root map", () => {
    const corrupt = "%%\n```json\n{ not json\n```\n%%\n";
    const original = `Text\n\n${corrupt}`;

    const result = convert(original, "N");

    expect(result).toContain(corrupt);
    expect(parseMapFile(result).map.rootIds).toHaveLength(1);
  });
});

describe("convertNoteToMap with a list and a JSON block", () => {
  it("keeps the saved state of nodes with ids", () => {
    const original =
      '- a ^aaaaaa\n- b\n\n%%\n```json\n{\n"version": 1,\n"nodes": {\n"aaaaaa": {"x": 5, "y": 6}\n},\n"style": {}\n}\n```\n%%\n';

    const { map } = parseMapFile(convert(original));

    expect(map.nodes.get("aaaaaa")?.state).toEqual({ x: 5, y: 6 });
    expect(map.rootIds).toHaveLength(2);
  });

  it("preserves a corrupt JSON block while adding ids to the list", () => {
    const corrupt = "%%\n```json\n{ broken\n```\n%%\n";

    const result = convert(`- a\n\n${corrupt}`);

    expect(result).toContain(corrupt);
    expect(parseMapFile(result).map.rootIds).toHaveLength(1);
  });
});

describe("convertNoteToMap on an already flagged note", () => {
  it("keeps a single mindmap: true line", () => {
    const result = convert("---\nmindmap: true\n---\n- a ^aaaaaa\n");

    expect(result).toBe("---\nmindmap: true\n---\n- a ^aaaaaa\n");
  });

  it("is idempotent on its own output", () => {
    const once = convert("Intro\n\n- a\n\t- b\n");

    expect(convert(once, "Note", 99)).toBe(once);
  });

  it("is idempotent for a list-less note converted twice", () => {
    const once = convert("Intro\n", "Name");

    expect(convert(once, "Name", 99)).toBe(once);
  });

  it("replaces mindmap: false with true", () => {
    const result = convert("---\nmindmap: false\n---\n- a ^aaaaaa\n");

    expect(result).toBe("---\nmindmap: true\n---\n- a ^aaaaaa\n");
  });
});

describe("convertNoteToMap with a differently cased mindmap field", () => {
  it("keeps a MindMap field and adds the lowercase flag", () => {
    const result = convert("---\nMindMap: x\n---\n- a\n");

    expect(stripIds(result)).toBe("---\nMindMap: x\nmindmap: true\n---\n- a\n");
    expect(hasMindmapFlag(result)).toBe(true);
  });
});
