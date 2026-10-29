import { describe, expect, it } from "vitest";
import { buildMindMap, withNodeText } from "../model";
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
