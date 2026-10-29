import { describe, expect, it } from "vitest";
import { buildMindMap, getNode, withNodeText, withSidesResolved } from "../model";
import type { MindMap, NodeState } from "../model";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

function editNodeText(fileText: string, findText: string, newText: string): string {
  const { map, source } = parseMapFile(fileText);
  const target = [...map.nodes.values()].find((node) => node.text === findText);
  if (target === undefined) throw new Error(`No node with text ${findText}`);
  const edited = newText === target.text ? map : withNodeText(map, target.id, newText);
  return serializeMapFile(edited, source);
}

function changedLineIndexes(before: string, after: string): number[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  expect(afterLines.length).toBe(beforeLines.length);
  return beforeLines.flatMap((line, index) => (line === afterLines[index] ? [] : [index]));
}

function withNodeState(map: MindMap, id: string, state: NodeState): MindMap {
  return buildMindMap([...map.nodes.values()].map((node) => ({ id: node.id, text: node.text, parentId: node.parentId, ...(node.id === id ? { state } : {}) })));
}

const canonicalJsonBlock = ["%%", "```json", "{", '"version": 1,', '"nodes": {}', "}", "```", "%%"];

describe("serializeMapFile after editing one node", () => {
  const file = [
    "---",
    "mindmap: true",
    "tags: [a]",
    "---",
    "Intro",
    "",
    "- Root ^r00t01",
    "\t- Child ^c00001",
    "\t\t- Grandchild ^g00001",
    "\t- Sibling ^c00002",
    "- Second root ^r00t02",
    "",
    "Outro",
    "",
    ...canonicalJsonBlock,
    "",
  ].join("\n");

  it("changes only the line of the edited item", () => {
    const after = editNodeText(file, "Child", "Edited child");

    expect(changedLineIndexes(file, after)).toEqual([7]);
  });

  it("writes the new text and keeps the id and indentation on the edited line", () => {
    const after = editNodeText(file, "Child", "Edited child");

    expect(after.split("\n")[7]).toBe("\t- Edited child ^c00001");
  });

  it("changes only the edited line for a deeply nested item", () => {
    const after = editNodeText(file, "Grandchild", "Edited");

    expect(changedLineIndexes(file, after)).toEqual([8]);
    expect(after.split("\n")[8]).toBe("\t\t- Edited ^g00001");
  });

  it("changes only the edited line for a root item", () => {
    const after = editNodeText(file, "Root", "New root");

    expect(changedLineIndexes(file, after)).toEqual([6]);
    expect(after.split("\n")[6]).toBe("- New root ^r00t01");
  });

  it("keeps frontmatter, text outside the list and the JSON block byte for byte", () => {
    const after = editNodeText(file, "Sibling", "Changed");

    expect(after.startsWith("---\nmindmap: true\ntags: [a]\n---\nIntro\n\n")).toBe(true);
    expect(after.endsWith(`\nOutro\n\n${canonicalJsonBlock.join("\n")}\n`)).toBe(true);
  });

  it("returns the file unchanged when the text is set to the same value", () => {
    expect(editNodeText(file, "Child", "Child")).toBe(file);
  });

  it("allows the edited text to become empty and keeps the id", () => {
    const after = editNodeText(file, "Child", "");

    expect(after.split("\n")[7]).toBe("\t- ^c00001");
  });

  it("makes an edited text readable again after another parse", () => {
    const after = editNodeText(file, "Child", "Edited child");

    const reparsed = parseMapFile(after).map;
    expect(reparsed.nodes.get("c00001")?.text).toBe("Edited child");
  });
});

describe("serializeMapFile preserves line style of the edited item", () => {
  it("keeps CRLF on the edited line", () => {
    const file = "---\r\nmindmap: true\r\n---\r\n- Root ^r1\r\n    - Child ^c1\r\n";

    expect(editNodeText(file, "Child", "New")).toBe(
      "---\r\nmindmap: true\r\n---\r\n- Root ^r1\r\n    - New ^c1\r\n",
    );
  });

  it("keeps a missing trailing newline when editing the last item", () => {
    expect(editNodeText("- a ^a1\n- b ^x1", "b", "c")).toBe("- a ^a1\n- c ^x1");
  });

  it("keeps four-space indentation of the edited item", () => {
    expect(editNodeText("- a ^a1\n    - b ^b1\n", "b", "c")).toBe("- a ^a1\n    - c ^b1\n");
  });

  it("keeps the original bullet character of the edited item", () => {
    expect(editNodeText("* a ^a1\n+ b ^b1\n", "b", "c")).toBe("* a ^a1\n+ c ^b1\n");
  });
});

describe("serializeMapFile with duplicated ids", () => {
  it("keeps the shared id on the edited first item even if its id was duplicated", () => {
    const file = "- one ^dup\n- two ^dup\n";

    const after = editNodeText(file, "one", "uno");

    expect(after.split("\n")[0]).toBe("- uno ^dup");
  });
});

describe("serializeMapFile with trailing caret-words in text", () => {
  it("keeps the typed text and writes the item's own id when an item without id is edited to end in a caret-word", () => {
    const { map, source } = parseMapFile("- Plain\n", sequenceRandom());
    const id = [...map.nodes.keys()][0] as string;

    const after = serializeMapFile(withNodeText(map, id, "see ^ref"), source);

    const reloaded = parseMapFile(after).map.nodes.get(id);
    expect(reloaded?.text).toBe("see ^ref");
    expect(after).toBe(`- see ^ref ^${id}\n`);
  });

  it("does not move an existing id away from another item when an id-less item is edited to end in that id", () => {
    const file = "- Plain\n- Other ^keep01\n";
    const { map, source } = parseMapFile(file);
    const plain = [...map.nodes.values()].find((node) => node.text === "Plain");
    if (plain === undefined) throw new Error("Plain node missing");

    const after = serializeMapFile(withNodeText(map, plain.id, "x ^keep01"), source);

    const reloaded = parseMapFile(after).map;
    expect(reloaded.nodes.get("keep01")?.text).toBe("Other");
    expect(reloaded.nodes.get(plain.id)?.text).toBe("x ^keep01");
  });

  it("round-trips an item that has a written id and text ending in a caret-word", () => {
    const { map, source } = parseMapFile("- Base ^abc1\n");
    const edited = withNodeText(map, "abc1", "note ^word");

    const after = serializeMapFile(edited, source);

    expect(after).toBe("- note ^word ^abc1\n");
    expect(parseMapFile(after).map.nodes.get("abc1")?.text).toBe("note ^word");
  });

  it("keeps a non-trailing caret-word as plain text and still writes the item id", () => {
    const { map, source } = parseMapFile("- Plain ^p1\n");

    const after = serializeMapFile(withNodeText(map, "p1", "a ^b c"), source);

    expect(after).toBe("- a ^b c ^p1\n");
    expect(parseMapFile(after).map.nodes.get("p1")?.text).toBe("a ^b c");
  });
});

describe("serializeMapFile for nodes without a source item", () => {
  const emptySource = parseMapFile("").source;

  it("indents new nodes with one tab per depth level", () => {
    const map = buildMindMap([
      { id: "n1", text: "root", parentId: null },
      { id: "n2", text: "child", parentId: "n1" },
      { id: "n3", text: "grandchild", parentId: "n2" },
    ]);

    expect(serializeMapFile(map, emptySource)).toBe("- root ^n1\n\t- child ^n2\n\t\t- grandchild ^n3\n");
  });

  it("writes the id of a new node whose text has a non-trailing caret-word", () => {
    const map = buildMindMap([{ id: "n1", text: "a ^b c", parentId: null }]);

    expect(serializeMapFile(map, emptySource)).toBe("- a ^b c ^n1\n");
  });

  it("writes the node's id when new node text ends in a caret-word", () => {
    const map = buildMindMap([{ id: "n1", text: "see ^ref", parentId: null }]);

    expect(serializeMapFile(map, emptySource)).toBe("- see ^ref ^n1\n");
  });
});

function setText(fileText: string, nodeId: string, newText: string): string {
  const { map, source } = parseMapFile(fileText);
  return serializeMapFile(withNodeText(map, nodeId, newText), source);
}

describe("serializeMapFile multi-line text", () => {
  it("writes multi-line text as the item line followed by continuation lines", () => {
    expect(setText("- a ^a1\n", "a1", "one\ntwo\nthree")).toBe("- one ^a1\n  two\n  three\n");
  });

  it("aligns continuation lines under the text of a tab-indented item", () => {
    expect(setText("- r ^r1\n\t- a ^a1\n", "a1", "one\ntwo")).toBe("- r ^r1\n\t- one ^a1\n\t  two\n");
  });

  it("aligns continuation lines under the text of a four-space item", () => {
    expect(setText("- r ^r1\n    - a ^a1\n", "a1", "one\ntwo")).toBe("- r ^r1\n    - one ^a1\n      two\n");
  });

  it("reuses the continuation indent the item already had", () => {
    expect(setText("- a ^a1\n    b\n", "a1", "a\nb\nc")).toBe("- a ^a1\n    b\n    c\n");
  });

  it("writes an empty text line as a truly empty line", () => {
    expect(setText("- a ^a1\n", "a1", "one\n\nthree")).toBe("- one ^a1\n\n  three\n");
  });

  it("reads multi-line text back identical to what was written", () => {
    const written = setText("- a ^a1\n- b\n", "a1", "one\n\ntwo\nlast");

    const { map } = parseMapFile(written);

    expect(getNode(map, "a1").text).toBe("one\n\ntwo\nlast");
  });

  it("reads back a continuation line that starts with spaces identical to what was written", () => {
    const written = setText("- a ^a1\n", "a1", "one\n  indented\nlast");

    expect(getNode(parseMapFile(written).map, "a1").text).toBe("one\n  indented\nlast");
  });

  it("collapses a multi-line item to one line and removes the old continuation lines", () => {
    expect(setText("- a ^a1\n  b\n  c\n- d ^d1\n", "a1", "single")).toBe("- single ^a1\n- d ^d1\n");
  });

  it("changes only the lines of the edited multi-line item", () => {
    const file = "- a ^a0\n- b ^b1\n  more\n- c ^c0\n";

    expect(setText(file, "b1", "b\nchanged")).toBe("- a ^a0\n- b ^b1\n  changed\n- c ^c0\n");
  });

  it("keeps blank lines that follow the edited item", () => {
    expect(setText("- a ^a1\n  b\n\n- c ^c1\n", "a1", "x\ny")).toBe("- x ^a1\n  y\n\n- c ^c1\n");
  });

  it("keeps CRLF on all lines of an edited multi-line item", () => {
    expect(setText("- a ^a1\r\n- b ^b2\r\n", "a1", "x\ny")).toBe("- x ^a1\r\n  y\r\n- b ^b2\r\n");
  });

  it("keeps a missing trailing newline after a multi-line edit of the last item", () => {
    expect(setText("- a ^a0\n- b ^b1", "b1", "x\ny")).toBe("- a ^a0\n- x ^b1\n  y");
  });

  it("returns an unedited multi-line item byte for byte", () => {
    const file = "- a ^a1\n    b\n\n    c\n\n- d\n";
    const { map, source } = parseMapFile(file);

    expect(serializeMapFile(map, source)).toBe(file);
  });
});

describe("serializeMapFile keeps untouched lines when editing elsewhere", () => {
  const file = "- a ^a0\n    - b ^b1\n\t- c ^c0\n  - d ^d0\r\n* e ^e0";

  it("keeps the indentation, bullets and line endings of all other items", () => {
    expect(setText(file, "b1", "B")).toBe("- a ^a0\n    - B ^b1\n\t- c ^c0\n  - d ^d0\r\n* e ^e0");
  });

  it("keeps a missing trailing newline when editing a different item", () => {
    expect(setText("- a ^a1\n- b ^b0", "a1", "A")).toBe("- A ^a1\n- b ^b0");
  });
});

describe("serializeMapFile indentation of new nested items", () => {
  function withNewChild(fileText: string, parentId: string, text: string): string {
    const { map, source } = parseMapFile(fileText);
    const entries = [...map.nodes.values()].map(({ id, text: nodeText, parentId: parent }) => ({
      id,
      text: nodeText,
      parentId: parent,
    }));
    return serializeMapFile(buildMindMap([...entries, { id: "new001", text, parentId }]), source);
  }

  it("uses the indent of the first nested item when it is two spaces", () => {
    expect(withNewChild("- a ^a1\n  - b ^b1\n", "a1", "new")).toBe("- a ^a1\n  - b ^b1\n  - new ^new001\n");
  });

  it("uses the indent of the first nested item when it is four spaces", () => {
    expect(withNewChild("- a ^a1\n    - b ^b1\n", "a1", "new")).toBe("- a ^a1\n    - b ^b1\n    - new ^new001\n");
  });

  it("uses a tab when the first nested item is tab-indented", () => {
    expect(withNewChild("- a ^a1\n\t- b ^b1\n", "a1", "new")).toBe("- a ^a1\n\t- b ^b1\n\t- new ^new001\n");
  });

  it("repeats the indent unit per level for deeper new items", () => {
    const { map, source } = parseMapFile("- a ^a1\n  - b ^b1\n");
    const edited = buildMindMap([
      { id: "a1", text: "a", parentId: null },
      { id: "b1", text: "b", parentId: "a1" },
      { id: "n1", text: "deep", parentId: "b1" },
    ]);

    expect(map.nodes.size).toBe(2);
    expect(serializeMapFile(edited, source)).toBe("- a ^a1\n  - b ^b1\n    - deep ^n1\n");
  });

  it("uses a tab for the first nested item in a file with no nested items", () => {
    expect(withNewChild("- a ^a1\n- b ^b1\n", "a1", "new")).toBe("- a ^a1\n\t- new ^new001\n- b ^b1\n");
  });

  it("writes multi-line text of a new nested item with continuation lines under its text", () => {
    expect(withNewChild("- a ^a1\n", "a1", "x\ny")).toBe("- a ^a1\n\t- x ^new001\n\t  y\n");
  });
});

describe("serializeMapFile text outside the map", () => {
  const file = [
    "---",
    "mindmap: true",
    "tags: [a, b]",
    "cssclasses:",
    "  - wide",
    "---",
    "Intro  ",
    "",
    "- a ^a1",
    "  more",
    "",
    "Outro",
    "",
    "- second list",
    "",
    ...canonicalJsonBlock,
    "",
  ].join("\n");

  it("keeps frontmatter extra fields unchanged after an edit", () => {
    const after = setText(file, "a1", "changed");

    expect(after.startsWith("---\nmindmap: true\ntags: [a, b]\ncssclasses:\n  - wide\n---\n")).toBe(true);
  });

  it("keeps text before the list byte for byte after an edit", () => {
    expect(setText(file, "a1", "changed").startsWith(file.slice(0, file.indexOf("- a ^a1")))).toBe(true);
  });

  it("keeps text after the list, later lists and the JSON block byte for byte after an edit", () => {
    const tail = file.slice(file.indexOf("\nOutro"));

    expect(setText(file, "a1", "changed\nlines").endsWith(tail)).toBe(true);
  });

  it("keeps outside text byte for byte when a node is removed from the map", () => {
    const { source } = parseMapFile(file);
    const emptied = buildMindMap([]);

    const after = serializeMapFile(emptied, source);

    expect(after).toBe(source.head + source.tail);
  });
});

const ID_SUFFIX = "[a-z0-9]{6}";

function idsOf(fileText: string): string[] {
  return [...parseMapFile(fileText).map.nodes.keys()];
}

function jsonBlock(...lines: string[]): string {
  return ["%%", "```json", ...lines, "```", "%%"].join("\n");
}

describe("serializeMapFile without edits", () => {
  it.each([
    ["items without ids", "- a\n\t- b\n- c\n"],
    ["items without ids and CRLF", "---\r\nmindmap: true\r\n---\r\n- a\r\n    - b\r\n"],
    ["items without ids and no final line break", "- a\n- b"],
    ["a non-canonical json block", `- a ^a1\n${jsonBlock('{"version":1,"nodes":{"a1":{"left":true}, "zz":{"left":true}}}')}\n`],
    ["a corrupt json block", `- a\n${jsonBlock("{broken")}\n`],
    ["several json blocks", `- a\n${jsonBlock('{"nodes":{}}')}\nmid\n${jsonBlock('{"nodes":{}}')}`],
    ["a json block inside the head", `---\nmindmap: true\n---\n${jsonBlock('{"nodes":{}}')}\n- a\n`],
    ["duplicated ids", "- a ^dup\n- b ^dup\n"],
  ])("returns %s byte for byte", (_name, file) => {
    const { map, source } = parseMapFile(file);

    expect(serializeMapFile(map, source)).toBe(file);
  });
});

describe("serializeMapFile writing ids on edit", () => {
  it("adds an id to every item line in a file without ids and changes nothing else", () => {
    const head = "---\nmindmap: true\ntags: [a]\n---\nIntro\n\n";
    const tail = `\nOutro\n\n${canonicalJsonBlock.join("\n")}\n`;
    const file = `${head}- Root\n\t- Child\n\t\t- Grandchild\n- Second\n${tail}`;

    const after = editNodeText(file, "Child", "Edited");

    const pattern = new RegExp(
      `^- Root \\^${ID_SUFFIX}\\n\\t- Edited \\^${ID_SUFFIX}\\n\\t\\t- Grandchild \\^${ID_SUFFIX}\\n- Second \\^${ID_SUFFIX}\\n$`,
    );
    expect(after.startsWith(head)).toBe(true);
    expect(after.endsWith(tail)).toBe(true);
    expect(after.slice(head.length, after.length - tail.length)).toMatch(pattern);
  });

  it("writes ids that differ from each other", () => {
    const after = editNodeText("- a\n- b\n- c\n- d\n", "a", "A");

    const ids = idsOf(after);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("writes six-character ids from a-z and 0-9", () => {
    const after = editNodeText("- a\n- b\n", "a", "A");

    expect(idsOf(after).every((id) => /^[a-z0-9]{6}$/.test(id))).toBe(true);
  });

  it("writes an id that differs from every id already in the file", () => {
    const existing = ["aaaaaa", "bbbbbb", "k3k3k3", "x9", "zz"];
    const file = `${existing.map((id, index) => `- keep${index} ^${id}`).join("\n")}\n- fresh\n`;

    const after = editNodeText(file, "fresh", "fresh2");

    const written = idsOf(after).filter((id) => !existing.includes(id));
    expect(written).toHaveLength(1);
    expect(idsOf(after)).toHaveLength(6);
  });

  it("reads back the same node ids that it wrote", () => {
    const { map, source } = parseMapFile("- a\n- b\n");
    const id = [...map.nodes.keys()][0] as string;

    const after = serializeMapFile(withNodeText(map, id, "A"), source);

    expect(idsOf(after)).toEqual([...map.nodes.keys()]);
  });

  it("is stable when the written file is parsed and saved again without edits", () => {
    const after = editNodeText("- a\n\t- b\n", "a", "A");
    const reparsed = parseMapFile(after);

    expect(serializeMapFile(reparsed.map, reparsed.source)).toBe(after);
  });

  it("puts the id on the first line of an item with continuation lines", () => {
    const after = editNodeText("- a\n  more\n- b\n", "b", "B");

    expect(after).toMatch(new RegExp(`^- a \\^${ID_SUFFIX}\\n  more\\n- B \\^${ID_SUFFIX}\\n$`));
  });

  it("keeps CRLF on lines that receive an id", () => {
    const after = editNodeText("- a\r\n- b\r\n", "a", "A");

    expect(after).toMatch(new RegExp(`^- A \\^${ID_SUFFIX}\\r\\n- b \\^${ID_SUFFIX}\\r\\n$`));
  });

  it("adds an id to the last item without adding a final line break", () => {
    const after = editNodeText("- a\n- b", "a", "A");

    expect(after).toMatch(new RegExp(`^- A \\^${ID_SUFFIX}\\n- b \\^${ID_SUFFIX}$`));
  });

  it("keeps the line of an item that already had an id byte for byte", () => {
    const after = editNodeText("- a ^abc123\n- b\n", "b", "B");

    expect(after.split("\n")[0]).toBe("- a ^abc123");
  });

  it("keeps ids of any shape, such as four characters, uppercase or with dashes", () => {
    const file = "- a ^ab12\n- b ^Up_per-9\n- c\n";

    const after = editNodeText(file, "c", "C");

    expect(after.split("\n").slice(0, 2)).toEqual(["- a ^ab12", "- b ^Up_per-9"]);
  });

  it("keeps a four-character id on the edited item itself", () => {
    expect(editNodeText("- a ^ab12\n", "a", "A")).toBe("- A ^ab12\n");
  });

  it("keeps the trailing spaces-and-id spelling of an item that already had an id", () => {
    expect(editNodeText("- a   ^ab12\n- b ^cd34\n", "b", "B")).toBe("- a   ^ab12\n- B ^cd34\n");
  });
});

describe("serializeMapFile with duplicated ids on edit", () => {
  const file = "- one ^dup\n- two ^dup\n- three ^dup\n";

  it("keeps the id on the first item and gives later items new ids", () => {
    const after = editNodeText(file, "one", "ONE");

    expect(after).toMatch(new RegExp(`^- ONE \\^dup\\n- two \\^${ID_SUFFIX}\\n- three \\^${ID_SUFFIX}\\n$`));
  });

  it("gives the later items different new ids", () => {
    const ids = idsOf(editNodeText(file, "one", "ONE"));

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("gives the state of the shared id to the first item only", () => {
    const withState = `${file}\n${jsonBlock('{"version": 1, "nodes": {"dup": {"collapsed": true}}}')}\n`;

    const after = editNodeText(withState, "one", "ONE");

    const reparsed = parseMapFile(after).map;
    expect(reparsed.nodes.get("dup")?.text).toBe("ONE");
    expect(reparsed.nodes.get("dup")?.state).toEqual({ collapsed: true });
    expect([...reparsed.nodes.values()].filter((node) => node.state !== undefined)).toHaveLength(1);
  });

  it("keeps the state on the first item when only a later duplicate is edited", () => {
    const withState = `${file}\n${jsonBlock('{"version": 1, "nodes": {"dup": {"collapsed": true}}}')}\n`;

    const after = editNodeText(withState, "three", "THREE");

    const reparsed = parseMapFile(after).map;
    expect(reparsed.nodes.get("dup")?.text).toBe("one");
    expect(reparsed.nodes.get("dup")?.state).toEqual({ collapsed: true });
  });
});

describe("serializeMapFile rewriting the json block on edit", () => {
  it("writes one node per line in document order", () => {
    const file = `- a ^a1\n- b ^b1\n\n${jsonBlock('{"version": 1, "nodes": {"b1": {"collapsed": true}, "a1": {"color": "red"}}}')}\n`;

    const after = editNodeText(file, "a", "A");

    expect(after).toBe(
      `- A ^a1\n- b ^b1\n\n${jsonBlock("{", '"version": 1,', '"nodes": {', '"a1": {"color":"red"},', '"b1": {"collapsed":true}', "}", "}")}\n`,
    );
  });

  it("leaves a json block that is already canonical byte for byte", () => {
    const canonical = jsonBlock("{", '"version": 1,', '"nodes": {', '"a1": {"color":"red"},', '"b1": {"collapsed":true}', "}", "}");
    const file = `- a ^a1\n- b ^b1\n\n${canonical}\n`;

    const after = editNodeText(file, "b", "B");

    expect(after).toBe(file.replace("- b ^b1", "- B ^b1"));
  });

  it("drops entries of ids that are no longer in the list", () => {
    const file = `- a ^a1\n\n${jsonBlock('{"version": 1, "nodes": {"gone": {"left": true}, "a1": {"left": true}}}')}\n`;

    const after = editNodeText(file, "a", "A");

    expect(after).not.toContain("gone");
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ left: true });
  });

  it("does not write nodes without state", () => {
    const file = `- a ^a1\n- b ^b1\n\n${jsonBlock('{"version": 1, "nodes": {"a1": {"left": true}}}')}\n`;

    const after = editNodeText(file, "b", "B");

    expect(after).not.toContain('"b1": {');
  });

  it("does not add a json block to a file that has none and whose nodes have no state", () => {
    const after = editNodeText("- a ^a1\n", "a", "A");

    expect(after).toBe("- A ^a1\n");
  });

  it("keeps unknown and future fields of states and of the block", () => {
    const file = `- a ^a1\n\n${jsonBlock('{"version": 3, "theme": {"k": [1]}, "nodes": {"a1": {"left": true, "future": {"x": [1, null, "y"]}}}}')}\n`;

    const after = editNodeText(file, "a", "A");

    const reread = parseMapFile(after);
    expect(reread.map.nodes.get("a1")?.state).toEqual({ left: true, future: { x: [1, null, "y"] } });
    expect(reread.source.json.extras).toEqual({ version: 3, theme: { k: [1] } });
  });

  it("writes the block with CRLF in a CRLF file", () => {
    const file = `---\r\nmindmap: true\r\n---\r\n- a ^a1\r\n\r\n${jsonBlock('{"version": 1, "nodes": {"a1": {"left": true}}}').replace(/\n/g, "\r\n")}\r\n`;

    const after = editNodeText(file, "a", "A");

    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
    expect(after).toContain('"a1": {"left":true}\r\n}\r\n}\r\n```\r\n%%\r\n');
  });

  it("appends a new block with CRLF when a CRLF file had none and a node gained state", () => {
    const { map, source } = parseMapFile("- a ^a1\r\n");
    const withState = buildMindMap([{ id: "a1", text: "A", parentId: null, state: { left: true } }]);

    const after = serializeMapFile(withState, source);

    expect(map.nodes.size).toBe(1);
    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
    expect(after.startsWith("- A ^a1\r\n\r\n%%\r\n```json\r\n")).toBe(true);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ left: true });
  });

  it("keeps a missing final line break after the block", () => {
    const file = `- a ^a1\n\n${jsonBlock('{"version": 1, "nodes": {"a1": {"left": true}}}')}`;

    const after = editNodeText(file, "a", "A");

    expect(after.endsWith("```\n%%")).toBe(true);
  });

  it("appends the first block after a list that has no final line break", () => {
    const { source } = parseMapFile("- a ^a1");
    const withState = buildMindMap([{ id: "a1", text: "a", parentId: null, state: { left: true } }]);

    const after = serializeMapFile(withState, source);

    expect(after.startsWith("- a ^a1\n\n%%\n```json\n")).toBe(true);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ left: true });
  });

  it("rewrites only the last of several blocks and keeps earlier blocks as outside text", () => {
    const earlier = `${jsonBlock('{"version": 1, "nodes": {"a1": {"color": "old"}}}')}\n`;
    const file = `- a ^a1\n\n${earlier}between\n${jsonBlock('{"version": 1, "nodes": {"a1": {"color": "new"}}}')}\n`;

    const after = editNodeText(file, "a", "A");

    expect(after.startsWith(`- A ^a1\n\n${earlier}between\n`)).toBe(true);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ color: "new" });
  });

  it("replaces a readable head block in place on an edited save and adds no tail block", () => {
    const file = `---\nmindmap: true\n---\n${jsonBlock('{"version": 1, "nodes": {"a1": {"left": true}}}')}\n- a ^a1\n`;
    const parsed = parseMapFile(file);
    const collapsed = withNodeState(parsed.map, "a1", { collapsed: true });

    const after = serializeMapFile(collapsed, parsed.source);

    const block = jsonBlock("{", '"version": 1,', '"nodes": {', '"a1": {"collapsed":true}', "}", "}");
    expect(after).toBe(`---\nmindmap: true\n---\n${block}\n- a ^a1\n`);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ collapsed: true });
  });

  it("rewrites the head block with the new text when a node is edited", () => {
    const headBlock = jsonBlock("{", '"version": 1,', '"nodes": {', '"a1": {"left":true}', "}", "}");
    const file = `---\nmindmap: true\n---\n${headBlock}\n- a ^a1\n`;
    const parsed = parseMapFile(file);

    const after = serializeMapFile(withNodeText(parsed.map, "a1", "A"), parsed.source);

    expect(parsed.map.nodes.get("a1")?.state).toEqual({ left: true });
    expect(after).toBe(`---\nmindmap: true\n---\n${headBlock}\n- A ^a1\n`);
  });

  it("keeps text after the list unchanged when the head block is rewritten", () => {
    const file = `${jsonBlock('{"version": 1, "nodes": {"a1": {"left": true}}}')}\n- a ^a1\n\nOutro\n`;

    const after = editNodeText(file, "a", "A");

    expect(after.endsWith("- A ^a1\n\nOutro\n")).toBe(true);
    expect(after.split("```json").length - 1).toBe(1);
  });

  it("leaves the tail block alone and rewrites it when both a head and a tail block exist", () => {
    const headBlock = `${jsonBlock('{"nodes": {"a1": {"color": "head"}}}')}\n`;
    const file = `${headBlock}- a ^a1\n\n${jsonBlock('{"version": 1, "nodes": {"a1": {"color": "tail"}}}')}\n`;

    const after = editNodeText(file, "a", "A");

    expect(after.startsWith(`${headBlock}- A ^a1\n`)).toBe(true);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ color: "tail" });
  });

  it("keeps a corrupt head block untouched and appends a new block at the end for state", () => {
    const corruptHead = `${jsonBlock("{broken")}\n`;
    const parsed = parseMapFile(`${corruptHead}- a ^a1\n`);
    const withState = withNodeState(parsed.map, "a1", { collapsed: true });

    const after = serializeMapFile(withState, parsed.source);

    expect(after.startsWith(`${corruptHead}- a ^a1\n`)).toBe(true);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ collapsed: true });
    expect(after.split("{broken").length - 1).toBe(1);
  });

  it("writes the head block with CRLF in a CRLF file", () => {
    const block = jsonBlock('{"version": 1, "nodes": {"a1": {"left": true}}}').replace(/\n/g, "\r\n");
    const file = `${block}\r\n- a ^a1\r\n`;

    const after = editNodeText(file, "a", "A");

    expect(after.replace(/\r\n/g, "")).not.toContain("\n");
    expect(after.endsWith("- A ^a1\r\n")).toBe(true);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ left: true });
  });

  it("keeps a corrupt block in place and appends a new block at the end", () => {
    const corrupt = `${jsonBlock('{"version": 1, "nodes": {')}\n`;
    const file = `- a ^a1\n\nOutro\n${corrupt}`;
    const parsed = parseMapFile(file);
    const withState = buildMindMap([{ id: "a1", text: "a", parentId: null, state: { collapsed: true } }]);

    const after = serializeMapFile(withState, parsed.source);

    expect(after.startsWith(`- a ^a1\n\nOutro\n${corrupt}`)).toBe(true);
    const reparsed = parseMapFile(after);
    expect(reparsed.isLayoutUnreadable).toBe(false);
    expect(reparsed.map.nodes.get("a1")?.state).toEqual({ collapsed: true });
  });

  it("does not repeat the corrupt block when saving twice", () => {
    const corrupt = `${jsonBlock("{broken")}\n`;
    const once = editNodeText(`- a ^a1\n${corrupt}`, "a", "A");

    const twice = editNodeText(once, "A", "AA");

    expect(twice.split("{broken").length - 1).toBe(1);
  });
});

describe("serializeMapFile with a corrupt head-only block", () => {
  const corruptHead = `${jsonBlock("{broken")}\n`;
  const file = `${corruptHead}- a ^a1\n`;

  it("leaves the head block untouched and appends no tail block on an edit without state", () => {
    const after = editNodeText(file, "a", "A");

    expect(after).toBe(`${corruptHead}- A ^a1\n`);
  });

  it("appends a new tail block and keeps the head block untouched when a node has state", () => {
    const parsed = parseMapFile(file);
    const withState = withNodeState(parsed.map, "a1", { collapsed: true });

    const after = serializeMapFile(withState, parsed.source);

    expect(after.startsWith(`${corruptHead}- a ^a1\n`)).toBe(true);
    expect(after.split("{broken").length - 1).toBe(1);
    expect(after.split("```json").length - 1).toBe(2);
    expect(after.endsWith("```\n%%\n")).toBe(true);
    expect(parseMapFile(after).map.nodes.get("a1")?.state).toEqual({ collapsed: true });
  });

  it("returns the file byte for byte on an unedited save", () => {
    const parsed = parseMapFile(file);

    expect(serializeMapFile(parsed.map, parsed.source)).toBe(file);
  });
});

function sequenceRandom(): () => number {
  let counter = 0;
  return () => {
    counter += 1;
    return (counter % 36) / 36;
  };
}

describe("serializeMapFile with branch sides", () => {
  const leftJson = (fields: string): string =>
    `\n%%\n\`\`\`json\n{\n"version": 1,\n"nodes": {\n${fields}\n},\n"style": {}\n}\n\`\`\`\n%%\n`;

  function settleAndSerialize(fileText: string): string {
    const { map, source } = parseMapFile(fileText, sequenceRandom());
    const first = [...map.nodes.values()][0];
    if (first === undefined) throw new Error("empty map");
    const sides = new Map<string, "left" | "right">();
    for (const node of map.nodes.values()) {
      if (node.isSidePending === true) sides.set(node.id, node.text.startsWith("L") ? "left" : "right");
    }
    const settled = withSidesResolved(map, sides);
    return serializeMapFile(withNodeText(settled, first.id, `${first.text}!`), source);
  }

  it("writes side left for a new left branch and nothing for a new right branch", () => {
    const after = settleAndSerialize("- root ^r1\n  - Left one\n  - Right one\n");

    const [, leftId, rightId] = [...parseMapFile(after).map.nodes.keys()];
    const reloaded = parseMapFile(after).map;
    expect(reloaded.nodes.get(leftId ?? "")?.state).toEqual({ side: "left" });
    expect(reloaded.nodes.get(rightId ?? "")?.state).toBeUndefined();
    expect(after).toContain('"side":"left"');
    expect(after.match(/"side"/g)).toHaveLength(1);
  });

  it("preserves unknown state fields of a left branch when it is written back", () => {
    const file = `- root ^r1\n  - Left ^b1\n  - tail\n${leftJson('"b1": {"side": "left", "future": {"a": [1, 2]}}')}`;

    const after = settleAndSerialize(file);

    expect(parseMapFile(after).map.nodes.get("b1")?.state).toEqual({ side: "left", future: { a: [1, 2] } });
  });

  it("keeps the saved side of branches with ids when a pending branch is settled", () => {
    const file = `- root ^r1\n  - Left ^b1\n  - Right ^b2\n  - Rnew\n${leftJson('"b1": {"side": "left"}')}`;

    const reloaded = parseMapFile(settleAndSerialize(file)).map;

    expect(reloaded.nodes.get("b1")?.state).toEqual({ side: "left" });
    expect(reloaded.nodes.get("b2")?.state).toBeUndefined();
  });

  it("writes the decided side only once the branch is settled, so reopening does not re-decide it", () => {
    const after = settleAndSerialize("- root ^r1\n  - Left one\n");

    const reloaded = parseMapFile(after).map;
    const branch = [...reloaded.nodes.values()].find((node) => node.text === "Left one");
    expect(branch?.isSidePending).toBeUndefined();
    expect(branch?.state).toEqual({ side: "left" });
  });

  it("leaves an opened file with pending branches byte-identical when nothing is edited", () => {
    const file = "---\nmindmap: true\n---\n- root ^r1\n  - added\n  - added too\n";

    const { map, source } = parseMapFile(file, sequenceRandom());

    expect(serializeMapFile(map, source)).toBe(file);
  });
});
