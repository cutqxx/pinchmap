import { describe, expect, it } from "vitest";
import { buildMindMap, getNode, withNodeText } from "../model";
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
    "\t\t- Grandchild",
    "\t- Sibling ^c00002",
    "- Second root",
    "",
    "Outro",
    "",
    "%%",
    '```json',
    '{"version": 1}',
    "```",
    "%%",
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

  it("changes only the edited line when the item has no id", () => {
    const after = editNodeText(file, "Grandchild", "Edited");

    expect(changedLineIndexes(file, after)).toEqual([8]);
    expect(after.split("\n")[8]).toMatch(/^\t\t- Edited/);
  });

  it("changes only the edited line for a root item", () => {
    const after = editNodeText(file, "Root", "New root");

    expect(changedLineIndexes(file, after)).toEqual([6]);
    expect(after.split("\n")[6]).toBe("- New root ^r00t01");
  });

  it("keeps frontmatter, text outside the list and the JSON block byte for byte", () => {
    const after = editNodeText(file, "Sibling", "Changed");

    expect(after.startsWith("---\nmindmap: true\ntags: [a]\n---\nIntro\n\n")).toBe(true);
    expect(after.endsWith("\nOutro\n\n%%\n```json\n{\"version\": 1}\n```\n%%\n")).toBe(true);
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
    expect(editNodeText("- a\n- b ^x1", "b", "c")).toBe("- a\n- c ^x1");
  });

  it("keeps four-space indentation of the edited item", () => {
    expect(editNodeText("- a\n    - b\n", "b", "c")).toBe("- a\n    - c\n");
  });

  it("keeps the original bullet character of the edited item", () => {
    expect(editNodeText("* a\n+ b\n", "b", "c")).toBe("* a\n+ c\n");
  });
});

describe("serializeMapFile with duplicated ids", () => {
  it("changes only the edited line, even if its id was duplicated", () => {
    const file = "- one ^dup\n- two ^dup\n";

    const after = editNodeText(file, "one", "uno");

    expect(after.split("\n")[1]).toBe("- two ^dup");
  });
});

describe("serializeMapFile with trailing caret-words in text", () => {
  it("keeps the typed text and writes the item's own id when an item without id is edited to end in a caret-word", () => {
    const { map, source } = parseMapFile("- Plain\n", () => 0.5);
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

  it("writes no id for edited plain text without a trailing caret-word", () => {
    const { map, source } = parseMapFile("- Plain\n");
    const id = [...map.nodes.keys()][0] as string;

    expect(serializeMapFile(withNodeText(map, id, "a ^b c"), source)).toBe("- a ^b c\n");
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

    expect(serializeMapFile(map, emptySource)).toBe("- root\n\t- child\n\t\t- grandchild\n");
  });

  it("writes no id for new node text without a trailing caret-word", () => {
    const map = buildMindMap([{ id: "n1", text: "a ^b c", parentId: null }]);

    expect(serializeMapFile(map, emptySource)).toBe("- a ^b c\n");
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
    expect(setText("- r\n\t- a ^a1\n", "a1", "one\ntwo")).toBe("- r\n\t- one ^a1\n\t  two\n");
  });

  it("aligns continuation lines under the text of a four-space item", () => {
    expect(setText("- r\n    - a ^a1\n", "a1", "one\ntwo")).toBe("- r\n    - one ^a1\n      two\n");
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
    expect(setText("- a ^a1\n  b\n  c\n- d\n", "a1", "single")).toBe("- single ^a1\n- d\n");
  });

  it("changes only the lines of the edited multi-line item", () => {
    const file = "- a\n- b ^b1\n  more\n- c\n";

    expect(setText(file, "b1", "b\nchanged")).toBe("- a\n- b ^b1\n  changed\n- c\n");
  });

  it("keeps blank lines that follow the edited item", () => {
    expect(setText("- a ^a1\n  b\n\n- c\n", "a1", "x\ny")).toBe("- x ^a1\n  y\n\n- c\n");
  });

  it("keeps CRLF on all lines of an edited multi-line item", () => {
    expect(setText("- a ^a1\r\n- b\r\n", "a1", "x\ny")).toBe("- x ^a1\r\n  y\r\n- b\r\n");
  });

  it("keeps a missing trailing newline after a multi-line edit of the last item", () => {
    expect(setText("- a\n- b ^b1", "b1", "x\ny")).toBe("- a\n- x ^b1\n  y");
  });

  it("returns an unedited multi-line item byte for byte", () => {
    const file = "- a ^a1\n    b\n\n    c\n\n- d\n";
    const { map, source } = parseMapFile(file);

    expect(serializeMapFile(map, source)).toBe(file);
  });
});

describe("serializeMapFile keeps untouched lines when editing elsewhere", () => {
  const file = "- a\n    - b ^b1\n\t- c\n  - d\r\n* e";

  it("keeps the indentation, bullets and line endings of all other items", () => {
    expect(setText(file, "b1", "B")).toBe("- a\n    - B ^b1\n\t- c\n  - d\r\n* e");
  });

  it("keeps a missing trailing newline when editing a different item", () => {
    expect(setText("- a ^a1\n- b", "a1", "A")).toBe("- A ^a1\n- b");
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
    expect(withNewChild("- a ^a1\n  - b\n", "a1", "new")).toBe("- a ^a1\n  - b\n  - new\n");
  });

  it("uses the indent of the first nested item when it is four spaces", () => {
    expect(withNewChild("- a ^a1\n    - b\n", "a1", "new")).toBe("- a ^a1\n    - b\n    - new\n");
  });

  it("uses a tab when the first nested item is tab-indented", () => {
    expect(withNewChild("- a ^a1\n\t- b\n", "a1", "new")).toBe("- a ^a1\n\t- b\n\t- new\n");
  });

  it("repeats the indent unit per level for deeper new items", () => {
    const { map, source } = parseMapFile("- a ^a1\n  - b ^b1\n");
    const edited = buildMindMap([
      { id: "a1", text: "a", parentId: null },
      { id: "b1", text: "b", parentId: "a1" },
      { id: "n1", text: "deep", parentId: "b1" },
    ]);

    expect(map.nodes.size).toBe(2);
    expect(serializeMapFile(edited, source)).toBe("- a ^a1\n  - b ^b1\n    - deep\n");
  });

  it("uses a tab for the first nested item in a file with no nested items", () => {
    expect(withNewChild("- a ^a1\n- b\n", "a1", "new")).toBe("- a ^a1\n\t- new\n- b\n");
  });

  it("writes multi-line text of a new nested item with continuation lines under its text", () => {
    expect(withNewChild("- a ^a1\n", "a1", "x\ny")).toBe("- a ^a1\n\t- x\n\t  y\n");
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
    "%%",
    "```json",
    '{"version": 1, "nodes": {}}',
    "```",
    "%%",
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
