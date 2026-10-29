import { describe, expect, it } from "vitest";
import { getNode, listNodesInDocumentOrder } from "../model";
import type { MindMap } from "../model";
import { parseMapFile } from "./parseMapFile";

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
