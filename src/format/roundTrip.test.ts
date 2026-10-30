/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { canonicalNodeText, getNode, withNodeText } from "../model";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

const fixtures = import.meta.glob<string>("./__fixtures__/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function roundTrip(text: string): string {
  const { map, source } = parseMapFile(text);
  return serializeMapFile(map, source);
}

describe("round trip of fixture files", () => {
  const fixtureNames = Object.keys(fixtures);

  it("has fixtures to check", () => {
    expect(fixtureNames.length).toBeGreaterThanOrEqual(6);
  });

  it.each(fixtureNames)("returns %s byte for byte after parse and serialize", (name) => {
    const original = fixtures[name] ?? "";

    expect(roundTrip(original)).toBe(original);
  });
});

describe("round trip of edge case files", () => {
  const cases: Record<string, string> = {
    "empty file": "",
    "frontmatter only": "---\nmindmap: true\n---\n",
    "frontmatter only without trailing newline": "---\nmindmap: true\n---",
    "list without frontmatter": "- a\n- b\n",
    "no trailing newline": "---\nmindmap: true\n---\n- a\n- b",
    "CRLF line endings": "---\r\nmindmap: true\r\n---\r\n- a ^x1\r\n    - b\r\n",
    "mixed line endings": "- a\r\n- b\n- c\r\n",
    "tabs": "- a\n\t- b\n\t\t- c\n",
    "two spaces": "- a\n  - b\n    - c\n",
    "four spaces": "- a\n    - b\n        - c\n",
    "mixed tabs and spaces": "- a\n\t- b\n    - c\n  - d\n",
    "star and plus bullets": "* a\n+ b\n- c\n",
    "text before the list": "---\nmindmap: true\n---\nIntro\n\n- a\n",
    "text after the list": "- a\n\nOutro\n",
    "a second list after text": "- a\n\ntext\n\n- other\n  - nested\n",
    "duplicate ids": "- one ^dup\n- two ^dup\n",
    "ids of different lengths": "- a ^ab12\n- b ^abcdef\n- c ^x\n",
    "trailing spaces in items": "- a   \n- b ^id1   \n",
    "empty item text": "- \n- b\n",
    "corrupt json block": "- a ^id1\n\n%%\n```json\n{ not json\n```\n%%\n",
    "blank lines and unicode": "\n\n- Привет мир ^id1\n- 日本語\n\n\n",
    "extra frontmatter fields": "---\nmindmap: true\ntags: [a, b]\ncssclasses:\n  - wide\n---\n- a\n",
    "unterminated frontmatter": "---\nmindmap: true\n- a\n",
    "multi-line item": "- a ^a1\n  b\n  c\n- d\n",
    "multi-line item with tab nesting": "- a\n\t- b\n\t  more\n\t\t  deeper\n",
    "multi-line item with four-space continuation": "- a\n    b\n",
    "multi-line item with irregular continuation indent": "- a\n  b\n      c\n \td\n",
    "blank lines inside an item": "- a\n  b\n\n\n  c\n- d\n",
    "blank lines between items": "- a\n\n\n- b\n",
    "whitespace-only line after the list": "- a\n   \nText\n",
    "multi-line item without trailing newline": "- a\n  b",
    "multi-line item in a CRLF file": "- a\r\n  b\r\n  - c\r\n    d\r\n",
    "multi-line item before outside text": "- a\n  b\n\nOutro\n- not a map item\n",
    "empty list file with frontmatter": "---\nmindmap: true\n---\n\n",
  };

  it.each(Object.entries(cases))("returns the file unchanged: %s", (_name, text) => {
    expect(roundTrip(text)).toBe(text);
  });

  it("survives repeated open and save cycles", () => {
    const original = "---\nmindmap: true\n---\n- a\n\t- b ^b1\n- c\n\ntail\n";
    let current = original;

    for (let cycle = 0; cycle < 5; cycle++) {
      current = roundTrip(current);
    }

    expect(current).toBe(original);
  });
});

describe("round trip of edited multi-line node text", () => {
  const edits: readonly { raw: string; canonical: string }[] = [
    { raw: "one\n  a\n  b", canonical: "one\na\nb" },
    { raw: "a\nx\ny", canonical: "a\nx\ny" },
    { raw: "one\n\ttab", canonical: "one\ntab" },
    { raw: "one\n- two", canonical: "one\n- two" },
    { raw: "one\n* two", canonical: "one\n* two" },
    { raw: "one\n+ two", canonical: "one\n+ two" },
    { raw: "one\n\\- two", canonical: "one\n\\- two" },
    { raw: "one\n\\\\- two", canonical: "one\n\\\\- two" },
    { raw: "a\n\nb", canonical: "a\n\nb" },
    { raw: "a   \nb", canonical: "a\nb" },
    { raw: "a\n\tx\n  y", canonical: "a\n\tx\n  y" },
    { raw: "a\n  x\n \ty", canonical: "a\n x\n\ty" },
    { raw: "a\n\u00A0x", canonical: "a\n\u00A0x" },
    { raw: "a\n\u3000x", canonical: "a\n\u3000x" },
  ];
  const shapes: Record<string, string> = {
    "no continuation": "- head\n",
    "four-space continuation": "- head\n    cont\n",
    "four-space continuation then a sibling": "- head\n    cont\n- sibling\n",
    "tab continuation": "- head\n\tcont\n",
  };
  const cases = edits.flatMap((edit) => Object.entries(shapes).map(([shape, file]) => ({ ...edit, shape, file })));

  function editFirstNode(file: string, text: string): { before: number; after: ReturnType<typeof parseMapFile> } {
    const { map, source } = parseMapFile(file);
    const first = [...map.nodes.values()][0];
    if (first === undefined) throw new Error("expected a node");
    const written = serializeMapFile(withNodeText(map, first.id, text), source);
    return { before: map.nodes.size, after: parseMapFile(written) };
  }

  it.each(cases)("keeps canonical text $canonical (from $raw) on a file with $shape", ({ raw, canonical, file }) => {
    expect(canonicalNodeText(raw)).toBe(canonical);

    const { before, after } = editFirstNode(file, canonical);

    const first = [...after.map.nodes.values()][0];
    expect(after.map.nodes.size).toBe(before);
    expect(first?.text).toBe(canonical);
  });

  it("writes a bullet-like continuation line escaped so it stays part of the node", () => {
    const { map, source } = parseMapFile("- head ^h1\n");
    const id = [...map.nodes.keys()][0] ?? "";

    const written = serializeMapFile(withNodeText(map, id, "one\n- two"), source);

    expect(written).toBe("- one ^h1\n  \\- two\n");
    expect(parseMapFile(written).map.nodes.size).toBe(1);
  });

  it("reads an escaped bullet-like continuation line as the plain bullet text", () => {
    const { map } = parseMapFile("- one\n  \\- two\n");

    expect([...map.nodes.values()].map((node) => node.text)).toEqual(["one\n- two"]);
  });

  it("removes only one backslash when reading a doubly escaped continuation line", () => {
    const { map } = parseMapFile("- one\n  \\\\- two\n");

    expect([...map.nodes.values()].map((node) => node.text)).toEqual(["one\n\\- two"]);
  });

  it("leaves a backslash that is not followed by a bullet marker and space", () => {
    const { map } = parseMapFile("- one\n  \\-two\n");

    expect([...map.nodes.values()].map((node) => node.text)).toEqual(["one\n\\-two"]);
  });

  it("uses the indentation derived from the item prefix when edited text has mixed indentation", () => {
    const { map, source } = parseMapFile("- head ^h1\n        cont\n");
    const id = [...map.nodes.keys()][0] ?? "";

    const written = serializeMapFile(withNodeText(map, id, "a\n\tx\n  y"), source);

    expect(written).toBe("- a ^h1\n  \tx\n    y\n");
  });
});

describe("parsing continuation lines with inconsistent indentation", () => {
  it("strips each line's own leading whitespace when no indent is shared by all lines", () => {
    const { map } = parseMapFile("- x\n  a\n\tb\n");

    expect([...map.nodes.values()].map((node) => node.text)).toEqual(["x\na\nb"]);
  });

  it("uses the child indentation as the indent unit when it does not start with the parent's", () => {
    const { map, source } = parseMapFile("  - a\n\t- b\n");

    expect(source.indentUnit).toBe("\t");
    expect(map.nodes.size).toBe(2);
    expect(getNode(map, [...map.nodes.keys()][1] ?? "")?.parentId).toBe([...map.nodes.keys()][0]);
  });
});
