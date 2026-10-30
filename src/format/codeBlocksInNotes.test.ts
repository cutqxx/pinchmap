import { describe, expect, it } from "vitest";
import { convertNoteToMap } from "./convertNoteToMap";
import { splitLines } from "./lines";
import { findListRegion } from "./listRegion";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function rootTexts(text: string): string[] {
  const { map } = parseMapFile(text);
  return map.rootIds.map((id) => map.nodes.get(id)?.text ?? "?");
}

function allTexts(text: string): string[] {
  return [...parseMapFile(text).map.nodes.values()].map((node) => node.text);
}

function regionOf(text: string): { start: number; end: number } {
  return findListRegion(splitLines(text));
}

function roundTrip(text: string): string {
  const { map, source } = parseMapFile(text);
  return serializeMapFile(map, source);
}

describe("list lines inside code", () => {
  it("does not start the list at a list line inside a fenced code block", () => {
    expect(rootTexts("```\n- fake\n```\n\n- real\n")).toEqual(["real"]);
  });

  it("does not start the list at a list line inside a tilde fence", () => {
    expect(rootTexts("~~~\n- fake\n~~~\n- real\n")).toEqual(["real"]);
  });

  it("does not start the list at a list line inside a %% comment", () => {
    expect(rootTexts("%%\n- hidden\n%%\n- real\n")).toEqual(["real"]);
  });

  it("finds the list after a code block that comes after frontmatter and text", () => {
    const text = "---\nmindmap: true\n---\nIntro\n```\n- fake\n```\n- real\n";

    expect(rootTexts(text)).toEqual(["real"]);
    expect(regionOf(text)).toEqual({ start: 7, end: 8 });
  });

  it("has no list when the only list lines are inside code", () => {
    expect(rootTexts("```\n- a\n- b\n```\n")).toEqual([]);
  });

  it("reads a list line after an unclosed fence as a list", () => {
    expect(rootTexts("```\n- a\n- b\n")).toEqual(["a", "b"]);
  });

  it("is not fooled by a longer fence containing a shorter one", () => {
    expect(rootTexts("````\n```\n- fake\n```\n````\n- real\n")).toEqual(["real"]);
  });

  it("ends a fence only on a fence of the same character", () => {
    expect(rootTexts("~~~\n```\n- fake\n~~~\n- real\n")).toEqual(["real"]);
  });

  it("is not fooled by a fence line with an info string inside the block", () => {
    expect(rootTexts("```\n```js\n- fake\n```\n- real\n")).toEqual(["real"]);
  });
});

describe("code blocks inside and after the list", () => {
  it("keeps an indented fence, with the list lines in it, inside the item above", () => {
    const text = "- a\n  ```\n  - fake\n  ```\n- b\n";

    expect(allTexts(text)).toEqual(["a\n```\n- fake\n```", "b"]);
    expect(regionOf(text)).toEqual({ start: 0, end: 5 });
  });

  it("keeps an indented tilde fence inside the item above", () => {
    expect(rootTexts("- a\n  ~~~\n  - fake\n  ~~~\n- b\n")).toHaveLength(2);
  });

  it("keeps an indented %% block inside the item above", () => {
    expect(rootTexts("- a\n  %%\n  - hidden\n  %%\n- b\n")).toHaveLength(2);
  });

  it("keeps a blank line inside an indented fence", () => {
    expect(allTexts("- a\n  ```\n\n  - fake\n  ```\n- b\n")).toHaveLength(2);
  });

  it("ends the list at a fence in the margin", () => {
    const text = "- a\n```\n- fake\n```\n- late\n";

    expect(rootTexts(text)).toEqual(["a"]);
    expect(regionOf(text)).toEqual({ start: 0, end: 1 });
  });

  it("ends the list at a %% block in the margin", () => {
    expect(rootTexts("- a\n%%\n- hidden\n%%\n- late\n")).toEqual(["a"]);
  });

  it("does not let a margin fence swallow a list line when the fence never closes", () => {
    expect(regionOf("- a\n```\n- b\n")).toEqual({ start: 0, end: 1 });
  });

  it("keeps an item after an indented unclosed fence as an item", () => {
    expect(rootTexts("- a\n  ```\n- b\n")).toEqual(["a\n```", "b"]);
  });
});

describe("node texts with code that the plugin wrote", () => {
  const json = '%%\n```json\n{\n"version": 1,\n"nodes": {\n"b2": {"color": "red"}\n},\n"style": {}\n}\n```\n%%\n';

  it("keeps the next node, the note text and the JSON block out of a node whose text ends in an unclosed fence", () => {
    const { map, source } = parseMapFile(`- a ^a1\n  \`\`\`\n- b ^b2\n\nOutro\n\n${json}`);

    expect([...map.nodes.values()].map((node) => [node.id, node.text, node.state])).toEqual([
      ["a1", "a\n```", undefined],
      ["b2", "b", { color: "red" }],
    ]);
    expect(source.tail).toBe(`\nOutro\n\n${json}`);
  });

  it("keeps the child of a node whose text is a whole code block as a child", () => {
    expect(allTexts("- ```js ^a1\n  const a = 1;\n  ```\n\t- ```js ^b2\n\t  const b = 2;\n\t  ```\n\t\t- c ^c3\n")).toEqual([
      "```js\nconst a = 1;\n```",
      "```js\nconst b = 2;\n```",
      "c",
    ]);
  });

  it("keeps the child of a node whose text is a whole %% comment as a child", () => {
    expect(allTexts("- %% ^a1\n  hidden\n  %%\n\t- %% ^b2\n\t  hidden\n\t  %%\n")).toEqual(["%%\nhidden\n%%", "%%\nhidden\n%%"]);
  });

  it("keeps a child that closes the unclosed fence of its parent as a node", () => {
    expect(allTexts("- code: ^a1\n  ```\n\t- x ^b2\n\t  ```\n")).toEqual(["code:\n```", "x\n```"]);
  });

  it("deleting a node whose text ends in an unclosed fence keeps the nodes and text after it", () => {
    const { map, source } = parseMapFile(`- a ^a1\n  \`\`\`\n- b ^b2\n\nOutro\n\n${json}`);

    const saved = serializeMapFile({ rootIds: ["b2"], nodes: new Map([["b2", map.nodes.get("b2")!]]) }, source);

    expect(saved).toBe(`- b ^b2\n\nOutro\n\n${json.replace('{"color": "red"}', '{"color":"red"}')}`);
  });
});

describe("saving a note that has code blocks", () => {
  it.each([
    ["a fenced block before the list", "```\n- fake\n```\n\n- real\n"],
    ["a fenced block in an item", "- a\n  ```\n  - fake\n  ```\n- b\n"],
    ["a fenced block after the list", "- a\n```\n- fake\n```\n"],
    ["a %% block before the list", "%%\n- hidden\n%%\n- real\n"],
    ["a longer fence around a shorter one", "````\n```\n- fake\n```\n````\n- real\n"],
    ["an unclosed fence", "```\n- a\n"],
    ["a fence opened on an item line", "- ```js\n  - code\n  ```\n\t- child\n- b\n"],
    ["an unclosed fence in an item before the JSON block", "- a ^a1\n  ```\n- b ^b2\n\n%%\n```json\n{\"version\": 1, \"nodes\": {}}\n```\n%%\n"],
  ])("returns %s byte for byte", (_name, text) => {
    expect(roundTrip(text)).toBe(text);
  });

  it("keeps the code block when an item is edited", () => {
    const { map, source } = parseMapFile("```\n- fake\n```\n\n- real ^r1\n");
    const edited = serializeMapFile({ ...map, nodes: new Map([["r1", { ...map.nodes.get("r1")!, text: "changed" }]]) }, source);

    expect(edited.startsWith("```\n- fake\n```\n\n- changed ^r1\n")).toBe(true);
  });
});

describe("convertNoteToMap with code blocks", () => {
  it("gives no id to a list line inside code", () => {
    const text = "```\n- fake\n```\n\n- real\n";

    const result = convertNoteToMap(text, "Note", seededRandom(3));

    expect(result).toMatch(/^---\nmindmap: true\n---\n```\n- fake\n```\n\n- real \^[a-z0-9]{6}\n$/);
  });

  it("leaves a %% block untouched", () => {
    const result = convertNoteToMap("%%\n- hidden\n%%\n- real\n", "Note", seededRandom(3));

    expect(result).toContain("%%\n- hidden\n%%\n");
  });

  it("makes a map with a single note-named root when the only list is in code", () => {
    const text = "```\n- fake\n```\n";

    const result = convertNoteToMap(text, "My note", seededRandom(3));

    expect(rootTexts(result)).toEqual(["My note"]);
    expect(result).toContain("```\n- fake\n```\n");
  });

  it("does not turn list lines in a fenced block into nodes of the converted map", () => {
    const result = convertNoteToMap("~~~\n- a\n  - b\n~~~\n\n- real\n  - child\n", "Note", seededRandom(3));

    expect(allTexts(result)).toEqual(["real", "child"]);
  });
});

describe("thematic breaks", () => {
  it.each(["* * *", "- - -", "_ _ _", "***", "---", "___", "*  *  *", " * * *", "* * * * *"])("%j is not a list item", (rule) => {
    expect(rootTexts(`${rule}\n- real\n`)).toEqual(["real"]);
  });

  it("ends the list at a margin thematic break", () => {
    expect(rootTexts("- a\n* * *\n- late\n")).toEqual(["a"]);
  });

  it("does not start the list at a thematic break after frontmatter", () => {
    expect(rootTexts("---\nmindmap: true\n---\n- - -\n- real\n")).toEqual(["real"]);
  });

  it("keeps a thematic break line in the saved file byte for byte", () => {
    const text = "* * *\n- real\n";

    expect(roundTrip(text)).toBe(text);
  });

  it.each([
    ["a single dash", "- -"],
    ["two dashes", "- --x"],
    ["mixed markers", "- * -"],
    ["dashes with text", "- - - x"],
    ["a dash item with a dash in the text", "- a - b"],
  ])("still reads %s as an item", (_name, line) => {
    expect(rootTexts(`${line}\n`)).toHaveLength(1);
  });

  it("reads the text of a '- -' item as a dash", () => {
    expect(rootTexts("- -\n")).toEqual(["-"]);
  });
});
