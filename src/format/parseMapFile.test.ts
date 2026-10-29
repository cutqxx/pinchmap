import { describe, expect, it } from "vitest";
import { getNode, listNodesInDocumentOrder } from "../model";
import type { MindMap } from "../model";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

function outline(map: MindMap): string[] {
  return listNodesInDocumentOrder(map).map(({ node, depth }) => `${depth}:${node.text}`);
}

function parseOutline(text: string): string[] {
  return outline(parseMapFile(text).map);
}

function sequenceRandom(): () => number {
  let counter = 0;
  return () => {
    counter += 1;
    return (counter % 36) / 36;
  };
}

describe("parseMapFile tree structure", () => {
  it("treats top-level items as roots", () => {
    const { map } = parseMapFile("- one\n- two\n");

    expect(map.rootIds.map((id) => getNode(map, id).text)).toEqual(["one", "two"]);
  });

  it("makes a nested item the child of the nearest item one level up", () => {
    const { map } = parseMapFile("- a\n  - b\n    - c\n  - d\n- e\n");

    expect(outline(map)).toEqual(["0:a", "1:b", "2:c", "1:d", "0:e"]);
    const [aId] = map.rootIds;
    expect(getNode(map, aId ?? "").childIds.map((id) => getNode(map, id).text)).toEqual(["b", "d"]);
  });

  it("keeps sibling order as in the list", () => {
    const { map } = parseMapFile("- root\n  - z\n  - a\n  - m\n");

    const [rootId] = map.rootIds;
    const texts = getNode(map, rootId ?? "").childIds.map((id) => getNode(map, id).text);
    expect(texts).toEqual(["z", "a", "m"]);
  });

  it("links every child back to its parent", () => {
    const { map } = parseMapFile("- a\n  - b\n    - c\n");

    for (const node of map.nodes.values()) {
      node.childIds.forEach((childId) => expect(getNode(map, childId).parentId).toBe(node.id));
    }
  });

  it("accepts -, * and + bullets", () => {
    expect(parseOutline("- a\n* b\n+ c\n")).toEqual(["0:a", "0:b", "0:c"]);
  });

  it("returns to the root level after a deep branch", () => {
    expect(parseOutline("- a\n    - b\n        - c\n- d\n")).toEqual(["0:a", "1:b", "2:c", "0:d"]);
  });

  it("attaches an item dedented to an in-between indent to the nearest shallower item", () => {
    expect(parseOutline("- a\n    - b\n  - c\n")).toEqual(["0:a", "1:b", "1:c"]);
  });
});

describe("parseMapFile indentation styles", () => {
  const expected = ["0:a", "1:b", "2:c", "1:d"];

  it("parses tab indentation", () => {
    expect(parseOutline("- a\n\t- b\n\t\t- c\n\t- d\n")).toEqual(expected);
  });

  it("parses two-space indentation", () => {
    expect(parseOutline("- a\n  - b\n    - c\n  - d\n")).toEqual(expected);
  });

  it("parses four-space indentation", () => {
    expect(parseOutline("- a\n    - b\n        - c\n    - d\n")).toEqual(expected);
  });

  it("gives identical trees for tabs, two spaces and four spaces", () => {
    const tabs = parseOutline("- a\n\t- b\n\t\t- c\n");
    const two = parseOutline("- a\n  - b\n    - c\n");
    const four = parseOutline("- a\n    - b\n        - c\n");

    expect(tabs).toEqual(two);
    expect(two).toEqual(four);
  });
});

describe("parseMapFile identifiers", () => {
  it("uses a trailing ^id as the node id", () => {
    const { map } = parseMapFile("- Topic ^a1b2c3\n");

    expect(map.rootIds).toEqual(["a1b2c3"]);
  });

  it("excludes the ^id from the node text", () => {
    const { map } = parseMapFile("- Topic ^a1b2c3\n");

    expect(getNode(map, "a1b2c3").text).toBe("Topic");
  });

  it("accepts ids of any length, such as four characters", () => {
    const { map } = parseMapFile("- Topic ^ab12\n");

    expect(map.rootIds).toEqual(["ab12"]);
  });

  it("keeps a caret in the middle of the text as text", () => {
    const { map } = parseMapFile("- 2^10 is big ^abc123\n");

    expect(getNode(map, "abc123").text).toBe("2^10 is big");
  });

  it("does not treat a caret glued to a word as an id", () => {
    const { map } = parseMapFile("- word^abc\n");

    const [rootId] = map.rootIds;
    expect(getNode(map, rootId ?? "").text).toBe("word^abc");
  });

  it("does not treat an id followed by more text as an id", () => {
    const { map } = parseMapFile("- see ^abc later\n");

    const [rootId] = map.rootIds;
    expect(rootId).not.toBe("abc");
    expect(getNode(map, rootId ?? "").text).toBe("see ^abc later");
  });

  it("ignores trailing spaces after the id", () => {
    const { map } = parseMapFile("- Topic ^a1b2c3   \n");

    expect(getNode(map, "a1b2c3").text).toBe("Topic");
  });

  it("generates a six character id for an item without one", () => {
    const { map } = parseMapFile("- Plain\n");

    expect(map.rootIds[0]).toMatch(/^[a-z0-9]{6}$/);
  });

  it("generates ids that are unique and do not collide with written ids", () => {
    const text = "- a ^aaaaaa\n- b\n- c\n- d\n";

    const collidingFirst = [0, 0, 0, 0, 0, 0];
    const fallback = sequenceRandom();

    const { map } = parseMapFile(text, () => collidingFirst.shift() ?? fallback());

    expect(new Set(map.rootIds).size).toBe(4);
    expect(map.rootIds[0]).toBe("aaaaaa");
  });

  it("keeps the first item of a duplicated id under that id", () => {
    const { map } = parseMapFile("- first ^dup\n- second ^dup\n", sequenceRandom());

    expect(getNode(map, "dup").text).toBe("first");
  });

  it("never gives an item without an id the id of an orphaned json entry nor its state", () => {
    const orphanId = [...parseMapFile("- x\n", sequenceRandom()).map.nodes.keys()][0] ?? "";
    const file = `- fresh\n\n${jsonBlock(JSON.stringify({ nodes: { [orphanId]: { collapsed: true } } }))}\n`;

    const { map } = parseMapFile(file, sequenceRandom());

    const [freshId = ""] = map.rootIds;
    expect(freshId).not.toBe(orphanId);
    expect(map.nodes.size).toBe(1);
    expect(getNode(map, freshId).state).toBeUndefined();
  });

  it("never gives an item without an id the id of an orphaned entry in a head block", () => {
    const orphanId = [...parseMapFile("- x\n", sequenceRandom()).map.nodes.keys()][0] ?? "";
    const headBlock = jsonBlock(JSON.stringify({ nodes: { [orphanId]: { left: true } } }));

    const { map } = parseMapFile(`${headBlock}\n- fresh\n`, sequenceRandom());

    const [freshId = ""] = map.rootIds;
    expect(freshId).not.toBe(orphanId);
    expect(getNode(map, freshId).state).toBeUndefined();
  });

  it("gives the second and later items with a duplicated id new unique ids", () => {
    const { map } = parseMapFile("- first ^dup\n- second ^dup\n- third ^dup\n", sequenceRandom());

    expect(map.nodes.size).toBe(3);
    expect(map.rootIds[0]).toBe("dup");
    expect(map.rootIds.slice(1).map((id) => getNode(map, id).text)).toEqual(["second", "third"]);
    expect(map.rootIds.slice(1)).not.toContain("dup");
  });
});

describe("parseMapFile where the map starts and ends", () => {
  it("skips frontmatter and starts the map at the first list", () => {
    expect(parseOutline("---\nmindmap: true\n---\n- a\n")).toEqual(["0:a"]);
  });

  it("does not read list-like lines inside frontmatter as items", () => {
    expect(parseOutline("---\nmindmap: true\ntags:\n  - x\n  - y\n---\n- a\n")).toEqual(["0:a"]);
  });

  it("stores frontmatter and text before the list as head", () => {
    const { source } = parseMapFile("---\nmindmap: true\n---\nIntro text\n\n- a\n");

    expect(source.head).toBe("---\nmindmap: true\n---\nIntro text\n\n");
  });

  it("takes only the first contiguous list as the map", () => {
    expect(parseOutline("- a\n- b\n\ntext\n\n- later\n")).toEqual(["0:a", "0:b"]);
  });

  it("ends the list at the first line that is not an item", () => {
    expect(parseOutline("- a\nplain line\n- b\n")).toEqual(["0:a"]);
  });

  it("stores everything after the list as tail, including later lists", () => {
    const { source } = parseMapFile("- a\n\nText\n\n- later\n");

    expect(source.tail).toBe("\nText\n\n- later\n");
  });

  it("parses an empty list as an empty map without error", () => {
    const { map, source } = parseMapFile("---\nmindmap: true\n---\n");

    expect(map.rootIds).toEqual([]);
    expect(source.head).toBe("---\nmindmap: true\n---\n");
    expect(source.tail).toBe("");
  });

  it("parses an empty file as an empty map", () => {
    expect(parseMapFile("").map.rootIds).toEqual([]);
  });

  it("parses a file with text but no list as an empty map keeping the text", () => {
    const { map, source } = parseMapFile("just text\nmore\n");

    expect(map.rootIds).toEqual([]);
    expect(source.head).toBe("just text\nmore\n");
  });

  it("parses a list without frontmatter", () => {
    expect(parseOutline("- a\n- b")).toEqual(["0:a", "0:b"]);
  });
});

describe("parseMapFile line endings", () => {
  it("parses CRLF files without carriage returns in node text", () => {
    const { map } = parseMapFile("---\r\nmindmap: true\r\n---\r\n- a ^id1\r\n    - b\r\n");

    expect(getNode(map, "id1").text).toBe("a");
    expect(outline(map)).toEqual(["0:a", "1:b"]);
  });

  it("reads the last item when the file has no trailing newline", () => {
    expect(parseOutline("- a\n- b")).toEqual(["0:a", "0:b"]);
  });

  it("parses an item with empty text", () => {
    const { map } = parseMapFile("- \n- b\n");

    expect(outline(map)).toEqual(["0:", "0:b"]);
  });
});

describe("parseMapFile multi-line node text", () => {
  it("reads indented continuation lines as one node with multi-line text", () => {
    const { map } = parseMapFile("- first\n  second\n  third\n- other\n");

    expect(outline(map)).toEqual(["0:first\nsecond\nthird", "0:other"]);
  });

  it("does not put the continuation indent into the text", () => {
    expect(parseOutline("- a\n    b\n")).toEqual(["0:a\nb"]);
  });

  it("reads tab-indented continuation lines", () => {
    expect(parseOutline("- a\n\t- b\n\t  more\n")).toEqual(["0:a", "1:b\nmore"]);
  });

  it("keeps the id out of the text when it ends the first line", () => {
    const { map } = parseMapFile("- first ^id1\n  second\n");

    expect(getNode(map, "id1").text).toBe("first\nsecond");
  });

  it("does not read a caret-word on a continuation line as the id", () => {
    const { map, source } = parseMapFile("- first\n  second ^notid\n", sequenceRandom());

    expect(outline(map)).toEqual(["0:first\nsecond ^notid"]);
    expect([...map.nodes.keys()]).not.toContain("notid");
    expect(source.items.size).toBe(1);
  });

  it("keeps extra indentation of a continuation line relative to the first one", () => {
    expect(parseOutline("- a\n  b\n    c\n")).toEqual(["0:a\nb\n  c"]);
  });

  it("keeps an empty line between continuation lines as an empty text line", () => {
    expect(parseOutline("- a\n  b\n\n  c\n")).toEqual(["0:a\nb\n\nc"]);
  });

  it("does not include blank lines after the last continuation line in the text", () => {
    expect(parseOutline("- a\n  b\n\n- c\n")).toEqual(["0:a\nb", "0:c"]);
  });

  it("reads CRLF continuation lines without carriage returns", () => {
    expect(parseOutline("- a\r\n  b\r\n  c\r\n")).toEqual(["0:a\nb\nc"]);
  });

  it("reads a continuation line at the end of a file without trailing newline", () => {
    expect(parseOutline("- a\n  b")).toEqual(["0:a\nb"]);
  });

  it("reads an item as single-line text when no continuation follows", () => {
    expect(parseOutline("- a\n- b\n")).toEqual(["0:a", "0:b"]);
  });

  it("reads a nested item as a child, not as a continuation", () => {
    expect(parseOutline("- a\n  - b\n")).toEqual(["0:a", "1:b"]);
  });

  it("attaches a continuation after a nested item to that nested item", () => {
    expect(parseOutline("- a\n  - b\n    more\n- c\n")).toEqual(["0:a", "1:b\nmore", "0:c"]);
  });
});

describe("parseMapFile list end rules", () => {
  it("ends the list at the first non-blank line that is neither an item nor an indented line", () => {
    const { map, source } = parseMapFile("- a\nplain\n- b\n");

    expect(outline(map)).toEqual(["0:a"]);
    expect(source.tail).toBe("plain\n- b\n");
  });

  it("keeps blank lines inside the list when more list content follows", () => {
    const { map } = parseMapFile("- a\n\n\n- b\n");

    expect(outline(map)).toEqual(["0:a", "0:b"]);
  });

  it("keeps blank lines inside the list when an indented continuation follows them", () => {
    expect(parseOutline("- a\n\n  more\n")).toEqual(["0:a\n\nmore"]);
  });

  it("puts blank lines after the list into the tail", () => {
    const { source } = parseMapFile("- a\n\n\nText\n");

    expect(source.tail).toBe("\n\nText\n");
  });

  it("treats a whitespace-only line as a blank line that ends the list", () => {
    const { map, source } = parseMapFile("- a\n   \nText\n");

    expect(outline(map)).toEqual(["0:a"]);
    expect(source.tail).toBe("   \nText\n");
  });

  it("ignores a second list after text, keeping it in the tail", () => {
    const { map, source } = parseMapFile("- a\n\nText\n\n- other\n  - nested\n");

    expect(outline(map)).toEqual(["0:a"]);
    expect(source.tail).toBe("\nText\n\n- other\n  - nested\n");
  });
});

describe("parseMapFile text outside the map", () => {
  it("stores text between frontmatter and the list in head, byte for byte", () => {
    const { source } = parseMapFile("---\nmindmap: true\n---\nIntro\n\n  indented intro\n- a\n");

    expect(source.head).toBe("---\nmindmap: true\n---\nIntro\n\n  indented intro\n");
  });

  it("stores text after the list including a JSON block in tail, byte for byte", () => {
    const { source } = parseMapFile("- a\n\nOutro\n\n%%\n```json\n{}\n```\n%%\n");

    expect(source.tail).toBe("\nOutro\n\n%%\n```json\n{}\n```\n%%\n");
  });

  it("has an empty head and tail when the file is only a list", () => {
    const { source } = parseMapFile("- a\n- b\n");

    expect(source.head).toBe("");
    expect(source.tail).toBe("");
  });

  it("does not turn outside text into nodes", () => {
    const { map } = parseMapFile("Intro\n\n- a\n\nOutro\n");

    expect([...map.nodes.values()].map((node) => node.text)).toEqual(["a"]);
  });
});

describe("parseMapFile continuation lines led by a Unicode space", () => {
  const unicodeSpaces = { "U+00A0": "\u00A0", "U+3000": "\u3000", "U+2003": "\u2003", "U+202F": "\u202F", "U+FEFF": "\uFEFF" };
  const indents = { "spaces": "    ", "a tab": "\t" };
  const cases = Object.entries(unicodeSpaces).flatMap(([spaceName, space]) =>
    Object.entries(indents).map(([indentName, indent]) => ({ spaceName, space, indentName, indent })),
  );

  it.each(cases)("keeps $spaceName after $indentName indent in the item text and keeps the next item", ({ space, indent }) => {
    const { map } = parseMapFile(`- a\n${indent}${space}x\n- b\n`);

    expect(outline(map)).toEqual([`0:a\n${space}x`, "0:b"]);
  });

  it.each(cases)("round trips $spaceName after $indentName indent byte for byte", ({ space, indent }) => {
    const text = `- a\n${indent}${space}x\n- b\n`;
    const { map, source } = parseMapFile(text);

    expect(serializeMapFile(map, source)).toBe(text);
  });

  it("keeps a leading Unicode space when the continuation indents are mixed", () => {
    expect(parseOutline("- a\n\t\u3000x\n y\n")).toEqual(["0:a\n\u3000x\ny"]);
  });

  it("keeps a leading Unicode space after a shared partial indent", () => {
    expect(parseOutline("- a\n  \u3000x\n y\n")).toEqual(["0:a\n \u3000x\ny"]);
  });
});

describe("parseMapFile mixed indentation", () => {
  it("parses a file mixing tabs, two spaces and four spaces by nesting depth", () => {
    expect(parseOutline("- a\n\t- b\n    - c\n  - d\n")).toEqual(["0:a", "1:b", "1:c", "1:d"]);
  });

  it("parses multi-line files with tabs, two spaces and four spaces into the same tree", () => {
    const tabs = parseOutline("- a\n\t- b\n\t  more\n\t- c\n");
    const two = parseOutline("- a\n  - b\n    more\n  - c\n");
    const four = parseOutline("- a\n    - b\n      more\n    - c\n");

    expect(tabs).toEqual(["0:a", "1:b\nmore", "1:c"]);
    expect(two).toEqual(tabs);
    expect(four).toEqual(tabs);
  });

  it("derives a tab indent unit from the first nested item", () => {
    expect(parseMapFile("- a\n\t- b\n").source.indentUnit).toBe("\t");
  });

  it("derives a two-space indent unit from the first nested item", () => {
    expect(parseMapFile("- a\n  - b\n").source.indentUnit).toBe("  ");
  });

  it("derives a four-space indent unit from the first nested item", () => {
    expect(parseMapFile("- a\n    - b\n").source.indentUnit).toBe("    ");
  });

  it("uses the first nested item for the indent unit even when later items differ", () => {
    expect(parseMapFile("- a\n  - b\n\t\t- c\n").source.indentUnit).toBe("  ");
  });

  it("uses a tab as the indent unit when the file has no nested items", () => {
    expect(parseMapFile("- a\n- b\n").source.indentUnit).toBe("\t");
  });
});

function jsonBlock(...lines: string[]): string {
  return ["%%", "```json", ...lines, "```", "%%"].join("\n");
}

describe("parseMapFile generated ids", () => {
  it("gives items without an id six characters from a-z and 0-9", () => {
    const { map } = parseMapFile("- a\n- b\n", sequenceRandom());

    expect([...map.nodes.keys()].every((id) => /^[a-z0-9]{6}$/.test(id))).toBe(true);
  });

  it("gives every item without an id a different id", () => {
    const { map } = parseMapFile("- a\n- b\n- c\n- d\n", sequenceRandom());

    expect(new Set(map.nodes.keys()).size).toBe(4);
  });

  it("keeps ids of other lengths and shapes as they are", () => {
    const { map } = parseMapFile("- a ^ab12\n- b ^Long_Id-1234567\n", sequenceRandom());

    expect([...map.nodes.keys()]).toEqual(["ab12", "Long_Id-1234567"]);
  });

  it("never generates an id that an item of the file already has", () => {
    const firstGenerated = [...parseMapFile("- x\n", sequenceRandom()).map.nodes.keys()][0] ?? "";

    const { map } = parseMapFile(`- taken ^${firstGenerated}\n- fresh\n`, sequenceRandom());

    const fresh = [...map.nodes.values()].find((node) => node.text === "fresh");
    expect(fresh?.id).not.toBe(firstGenerated);
    expect(map.nodes.size).toBe(2);
  });

  it("never generates an id that a later item of the file has", () => {
    const firstGenerated = [...parseMapFile("- x\n", sequenceRandom()).map.nodes.keys()][0] ?? "";

    const { map } = parseMapFile(`- fresh\n- taken ^${firstGenerated}\n`, sequenceRandom());

    expect(map.nodes.size).toBe(2);
    expect(map.nodes.get(firstGenerated)?.text).toBe("taken");
  });

  it("gives a repeated id to the first item and a new id to the later ones", () => {
    const { map } = parseMapFile("- one ^dup\n- two ^dup\n- three ^dup\n", sequenceRandom());

    expect(map.nodes.get("dup")?.text).toBe("one");
    expect(map.nodes.size).toBe(3);
    expect([...map.nodes.values()].map((node) => node.text)).toEqual(["one", "two", "three"]);
  });
});

describe("parseMapFile json block", () => {
  it("attaches the state of an id to its node", () => {
    const file = `- a ^a1\n- b ^b1\n\n${jsonBlock('{"version": 1, "nodes": {"b1": {"collapsed": true}}}')}\n`;

    const { map, isLayoutUnreadable } = parseMapFile(file);

    expect(map.nodes.get("b1")?.state).toEqual({ collapsed: true });
    expect(map.nodes.get("a1")?.state).toBeUndefined();
    expect(isLayoutUnreadable).toBe(false);
  });

  it("ignores state entries for ids that are not in the list", () => {
    const file = `- a ^a1\n\n${jsonBlock('{"nodes": {"gone": {"left": true}}}')}\n`;

    const { map } = parseMapFile(file);

    expect([...map.nodes.keys()]).toEqual(["a1"]);
    expect(map.nodes.get("a1")?.state).toBeUndefined();
  });

  it("uses the last block when there are several", () => {
    const file = `- a ^a1\n\n${jsonBlock('{"nodes": {"a1": {"color": "old"}}}')}\nmid\n${jsonBlock('{"nodes": {"a1": {"color": "new"}}}')}\n`;

    expect(parseMapFile(file).map.nodes.get("a1")?.state).toEqual({ color: "new" });
  });

  it("treats an earlier block as outside text, not as state", () => {
    const earlier = jsonBlock('{"nodes": {"a1": {"color": "old"}}}');
    const file = `- a ^a1\n\n${earlier}\nmid\n${jsonBlock('{"nodes": {}}')}\n`;

    const { map, source } = parseMapFile(file);

    expect(map.nodes.get("a1")?.state).toBeUndefined();
    expect(source.tail).toContain(earlier);
  });

  it("uses a readable block placed before the list when the tail has none and keeps it in the head", () => {
    const headBlock = `${jsonBlock('{"nodes": {"a1": {"left": true}}}')}\n`;

    const { map, source, isLayoutUnreadable } = parseMapFile(`---\nmindmap: true\n---\n${headBlock}- a ^a1\n`);

    expect(map.nodes.get("a1")?.state).toEqual({ left: true });
    expect(source.head).toContain(headBlock);
    expect(source.json.location).toBe("head");
    expect(isLayoutUnreadable).toBe(false);
  });

  it("uses the last of several blocks in the head", () => {
    const head = `${jsonBlock('{"nodes": {"a1": {"color": "old"}}}')}\n${jsonBlock('{"nodes": {"a1": {"color": "new"}}}')}\n`;

    const { map } = parseMapFile(`${head}- a ^a1\n`);

    expect(map.nodes.get("a1")?.state).toEqual({ color: "new" });
  });

  it("lets the tail block win over a head block when both exist", () => {
    const headBlock = `${jsonBlock('{"nodes": {"a1": {"color": "head"}}}')}\n`;
    const tailBlock = jsonBlock('{"nodes": {"a1": {"color": "tail"}}}');

    const { map, source } = parseMapFile(`${headBlock}- a ^a1\n\n${tailBlock}\n`);

    expect(map.nodes.get("a1")?.state).toEqual({ color: "tail" });
    expect(source.json.location).toBe("tail");
  });

  it("flags the layout as unreadable when the head block is corrupt and the tail has none", () => {
    const headBlock = `${jsonBlock("{broken")}\n`;

    const { map, source, isLayoutUnreadable } = parseMapFile(`${headBlock}- a ^a1\n`);

    expect(map.nodes.get("a1")?.state).toBeUndefined();
    expect(source.head).toBe(headBlock);
    expect(isLayoutUnreadable).toBe(true);
  });

  it("flags a corrupt tail block even when the head block is readable", () => {
    const headBlock = `${jsonBlock('{"nodes": {"a1": {"left": true}}}')}\n`;

    const { map, isLayoutUnreadable } = parseMapFile(`${headBlock}- a ^a1\n\n${jsonBlock("{broken")}\n`);

    expect(isLayoutUnreadable).toBe(true);
    expect(map.nodes.get("a1")?.state).toBeUndefined();
  });

  it("reads a block in a CRLF file", () => {
    const block = jsonBlock('{"nodes": {"a1": {"left": true}}}').replace(/\n/g, "\r\n");

    const { map } = parseMapFile(`- a ^a1\r\n\r\n${block}\r\n`);

    expect(map.nodes.get("a1")?.state).toEqual({ left: true });
  });

  it("reads a block without a final line break", () => {
    const { map } = parseMapFile(`- a ^a1\n\n${jsonBlock('{"nodes": {"a1": {"left": true}}}')}`);

    expect(map.nodes.get("a1")?.state).toEqual({ left: true });
  });

  it("keeps unknown state fields of future versions", () => {
    const state = { left: true, future: { nested: [1, "x", null] } };
    const file = `- a ^a1\n\n${jsonBlock(JSON.stringify({ version: 9, nodes: { a1: state } }))}\n`;

    expect(parseMapFile(file).map.nodes.get("a1")?.state).toEqual(state);
  });

  it("gives the state of a repeated id to the node of the first item", () => {
    const file = `- one ^dup\n- two ^dup\n\n${jsonBlock('{"nodes": {"dup": {"collapsed": true}}}')}\n`;

    const { map } = parseMapFile(file, sequenceRandom());

    const states = [...map.nodes.values()].map((node) => [node.text, node.state]);
    expect(states).toEqual([
      ["one", { collapsed: true }],
      ["two", undefined],
    ]);
  });

  it("does not attach state to a node whose entry is an empty object", () => {
    const file = `- a ^a1\n\n${jsonBlock('{"nodes": {"a1": {}}}')}\n`;

    expect(parseMapFile(file).map.nodes.get("a1")?.state).toBeUndefined();
  });
});

describe("parseMapFile with a corrupt json block", () => {
  it.each([
    ["invalid JSON", '{"nodes": {'],
    ["an array", "[]"],
    ["nodes that is not an object", '{"nodes": 5}'],
  ])("opens the map without state and flags the layout as unreadable for %s", (_name, body) => {
    const { map, isLayoutUnreadable } = parseMapFile(`- a ^a1\n- b ^b1\n\n${jsonBlock(body)}\n`);

    expect(isLayoutUnreadable).toBe(true);
    expect([...map.nodes.values()].map((node) => node.text)).toEqual(["a", "b"]);
    expect([...map.nodes.values()].every((node) => node.state === undefined)).toBe(true);
  });

  it("keeps the corrupt block in the text outside the map", () => {
    const corrupt = jsonBlock("{broken");

    const { source } = parseMapFile(`- a ^a1\n${corrupt}\n`);

    expect(source.tail).toContain(corrupt);
  });

  it("does not flag a file without any block", () => {
    expect(parseMapFile("- a ^a1\n").isLayoutUnreadable).toBe(false);
  });

  it("flags the layout as unreadable when the last block is corrupt even if an earlier one is valid", () => {
    const file = `- a ^a1\n${jsonBlock('{"nodes": {"a1": {"left": true}}}')}\n${jsonBlock("{broken")}\n`;

    const { map, isLayoutUnreadable } = parseMapFile(file);

    expect(isLayoutUnreadable).toBe(true);
    expect(map.nodes.get("a1")?.state).toBeUndefined();
  });

  it("does not flag the layout when a valid block follows a corrupt one", () => {
    const file = `- a ^a1\n${jsonBlock("{broken")}\n${jsonBlock('{"nodes": {"a1": {"left": true}}}')}\n`;

    const { map, isLayoutUnreadable } = parseMapFile(file);

    expect(isLayoutUnreadable).toBe(false);
    expect(map.nodes.get("a1")?.state).toEqual({ left: true });
  });
});

describe("parseMapFile loaded map identity", () => {
  it("remembers the parsed map so that an unedited map can be recognised", () => {
    const { map, source } = parseMapFile("- a\n");

    expect(source.loadedMap).toBe(map);
  });
});

describe("parseMapFile pending branch sides", () => {
  function pendingTexts(text: string): string[] {
    const { map } = parseMapFile(text);
    return [...map.nodes.values()].filter((node) => node.isSidePending === true).map((node) => node.text);
  }

  it("marks first-level branches without a written id as side pending", () => {
    expect(pendingTexts("- root ^r1\n  - added\n  - also added\n")).toEqual(["added", "also added"]);
  });

  it("does not mark a first-level branch with a written id, even without a record", () => {
    expect(pendingTexts("- root ^r1\n  - known ^b1\n")).toEqual([]);
  });

  it("does not mark roots without a written id", () => {
    expect(pendingTexts("- root\n")).toEqual([]);
  });

  it("does not mark deeper nodes without a written id", () => {
    expect(pendingTexts("- root ^r1\n  - known ^b1\n    - deep\n      - deeper\n")).toEqual([]);
  });

  it("keeps a first-level branch with a written id on the right when the json has no record for it", () => {
    const { map } = parseMapFile("- root ^r1\n  - known ^b1\n");

    expect(map.nodes.get("b1")?.state).toBeUndefined();
  });

  it("reads the left side of a branch from the json block", () => {
    const text = '- root ^r1\n  - l ^b1\n\n%%\n```json\n{\n"version": 1,\n"nodes": {\n"b1": {"side": "left"}\n}\n}\n```\n%%\n';

    expect(parseMapFile(text).map.nodes.get("b1")?.state).toEqual({ side: "left" });
  });
});
