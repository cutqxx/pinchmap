/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
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
    expect(fixtureNames.length).toBeGreaterThanOrEqual(4);
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
