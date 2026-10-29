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
