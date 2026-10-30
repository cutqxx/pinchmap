import { describe, expect, it } from "vitest";
import { getNode, withNewChild, withNewRoot, withNewSibling, withNodeText, withoutBranch, withOnlyBlankRoot } from "../model";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

function edit(text: string, change: (map: ReturnType<typeof parseMapFile>["map"]) => ReturnType<typeof parseMapFile>["map"]): string {
  const { map, source } = parseMapFile(text);
  return serializeMapFile(change(map), source);
}

function bareLineFeeds(text: string): number {
  return (text.match(/(?<!\r)\n/g) ?? []).length;
}

describe("new items in a CRLF file", () => {
  const FILE = "---\r\nmindmap: true\r\n---\r\n- a ^a1\r\n- b ^b2\r\n";

  it("writes a new child with CRLF line endings", () => {
    const result = edit(FILE, (map) => withNewChild(map, { id: "c3", text: "child", parentId: "a1" }));

    expect(result.startsWith("---\r\nmindmap: true\r\n---\r\n- a ^a1\r\n\t- child ^c3\r\n- b ^b2\r\n")).toBe(true);
  });

  it("writes a new root with CRLF line endings", () => {
    const result = edit(FILE, (map) => withNewRoot(map, { id: "r3", text: "root" }));

    expect(result).toContain("- b ^b2\r\n- root ^r3\r\n");
  });

  it("writes a new sibling with CRLF line endings", () => {
    const result = edit(FILE, (map) => withNewSibling(map, "a1", { id: "s3", text: "sib" }));

    expect(result).toContain("- a ^a1\r\n- sib ^s3\r\n- b ^b2\r\n");
  });

  it("writes every line of a multi-line new item with CRLF", () => {
    const result = edit(FILE, (map) => withNewRoot(map, { id: "r3", text: "one\ntwo" }));

    expect(result).toContain("- one ^r3\r\n  two\r\n");
  });

  it("leaves no bare line feed anywhere in the edited file", () => {
    const result = edit(FILE, (map) => withNewChild(map, { id: "c3", text: "x\ny", parentId: "b2" }));

    expect(bareLineFeeds(result)).toBe(0);
  });

  it("separates a new item from a last line that has no line ending with CRLF", () => {
    const result = edit("- a ^a1\r\n- b ^b2", (map) => withNewSibling(map, "b2", { id: "s3", text: "sib" }));

    expect(result).toContain("- b ^b2\r\n- sib ^s3\r\n");
    expect(bareLineFeeds(result)).toBe(0);
  });

  it("returns the file byte for byte when nothing was edited", () => {
    const { map, source } = parseMapFile(FILE);

    expect(serializeMapFile(map, source)).toBe(FILE);
  });

  it("returns a CRLF file with a JSON block and a code block byte for byte", () => {
    const file = "```\r\n- fake\r\n```\r\n- a ^a1\r\n\r\n%%\r\n```json\r\n{}\r\n```\r\n%%\r\n";
    const { map, source } = parseMapFile(file);

    expect(serializeMapFile(map, source)).toBe(file);
  });
});

describe("new items in an LF file", () => {
  it("writes LF only", () => {
    const result = edit("- a ^a1\n", (map) => withNewRoot(map, { id: "r2", text: "b" }));

    expect(result).toContain("- a ^a1\n- b ^r2\n");
    expect(result).not.toContain("\r");
  });
});

describe("the first item of a file that has no list", () => {
  it("starts on its own line after text without a final line ending", () => {
    const { map, source } = parseMapFile("Just a note");

    const result = serializeMapFile(withNewRoot(map, { id: "r1", text: "root" }), source);

    expect(result.startsWith("Just a note\n- root ^r1\n")).toBe(true);
  });

  it("starts on its own line after frontmatter that has no final line ending", () => {
    const { map, source } = parseMapFile("---\nmindmap: true\n---");

    const result = serializeMapFile(withNewRoot(map, { id: "r1", text: "root" }), source);

    expect(result.startsWith("---\nmindmap: true\n---\n- root ^r1\n")).toBe(true);
  });

  it("uses CRLF to end that line in a CRLF file", () => {
    const { map, source } = parseMapFile("---\r\nmindmap: true\r\n---");

    const result = serializeMapFile(withNewRoot(map, { id: "r1", text: "root" }), source);

    expect(result.startsWith("---\r\nmindmap: true\r\n---\r\n- root ^r1\r\n")).toBe(true);
  });

  it("does not insert a blank line when the head already ends with a line ending", () => {
    const { map, source } = parseMapFile("Intro\n");

    const result = serializeMapFile(withNewRoot(map, { id: "r1", text: "root" }), source);

    expect(result.startsWith("Intro\n- root ^r1\n")).toBe(true);
  });

  it("adds nothing to an empty file head", () => {
    const { map, source } = parseMapFile("");

    const result = serializeMapFile(withNewRoot(map, { id: "r1", text: "root" }), source);

    expect(result.startsWith("- root ^r1\n")).toBe(true);
  });

  it("keeps the JSON block after the first item", () => {
    const { map, source } = parseMapFile("Note text");

    const result = serializeMapFile(
      withNewRoot(map, { id: "r1", text: "root", state: { x: 1, y: 2 } }),
      source,
    );

    expect(result.indexOf("- root ^r1")).toBeLessThan(result.indexOf("%%"));
    expect(parseMapFile(result).map.rootIds).toEqual(["r1"]);
  });

  it("reads back as a map with that one root", () => {
    const { map, source } = parseMapFile("Just a note");

    const reparsed = parseMapFile(serializeMapFile(withNewRoot(map, { id: "r1", text: "root" }), source));

    expect(reparsed.map.rootIds.map((id) => getNode(reparsed.map, id).text)).toEqual(["root"]);
  });
});

describe("a map reduced to one blank root", () => {
  it("is saved as an empty list item that is read back as the same root", () => {
    const { map, source } = parseMapFile("- a ^a1\n\t- b ^b2\n- c ^c3\n");
    const blank = withOnlyBlankRoot(map, "a1");

    const reparsed = parseMapFile(serializeMapFile(blank, source));

    expect([...reparsed.map.nodes.values()].map((node) => [node.id, node.text, node.childIds.length])).toEqual([["a1", "", 0]]);
  });

  it("is stable when saved again", () => {
    const { map, source } = parseMapFile("- a ^a1\n- c ^c3\n");
    const once = serializeMapFile(withOnlyBlankRoot(map, "a1"), source);
    const second = parseMapFile(once);

    expect(serializeMapFile(second.map, second.source)).toBe(once);
  });

  it("keeps a list item in the file after all branches were removed one by one down to a blank root", () => {
    const { map, source } = parseMapFile("- a ^a1\n- b ^b2\n");
    const blank = withNodeText(withoutBranch(map, "b2"), "a1", "");

    expect(serializeMapFile(blank, source)).toMatch(/^- ?\s*\^a1\n/m);
  });
});
