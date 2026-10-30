import { describe, expect, it } from "vitest";
import { splitLines } from "./lines";
import { findListRegion, groupIntoItemBlocks } from "./listRegion";

function regionOf(text: string): { start: number; end: number } {
  return findListRegion(splitLines(text));
}

describe("findListRegion", () => {
  it("covers the whole list when the file is only a list", () => {
    expect(regionOf("- a\n- b\n")).toEqual({ start: 0, end: 2 });
  });

  it("starts after frontmatter and text before the list", () => {
    expect(regionOf("---\nmindmap: true\n---\nIntro\n\n- a\n- b\n")).toEqual({ start: 5, end: 7 });
  });

  it("includes indented continuation lines in the region", () => {
    expect(regionOf("- a\n  more\n- b\n")).toEqual({ start: 0, end: 3 });
  });

  it("ends at the first non-blank line that is neither an item nor an indented continuation", () => {
    expect(regionOf("- a\nplain\n- b\n")).toEqual({ start: 0, end: 1 });
  });

  it("keeps a blank line inside the region when an item follows it", () => {
    expect(regionOf("- a\n\n- b\n")).toEqual({ start: 0, end: 3 });
  });

  it("keeps several blank lines inside the region when an indented continuation follows them", () => {
    expect(regionOf("- a\n\n\n  more\n")).toEqual({ start: 0, end: 4 });
  });

  it("leaves trailing blank lines outside the region", () => {
    expect(regionOf("- a\n\n\ntext\n")).toEqual({ start: 0, end: 1 });
  });

  it("treats a whitespace-only line as blank, not as continuation", () => {
    expect(regionOf("- a\n   \ntext\n")).toEqual({ start: 0, end: 1 });
  });

  it("does not extend the region over a later list separated by text", () => {
    expect(regionOf("- a\n\ntext\n\n- other\n")).toEqual({ start: 0, end: 1 });
  });

  it("is empty and positioned at the end when the file has no list", () => {
    expect(regionOf("just text\n")).toEqual({ start: 1, end: 1 });
  });

  it("is empty for an empty file", () => {
    expect(regionOf("")).toEqual({ start: 0, end: 0 });
  });

  it("does not read list-like lines inside frontmatter as the list start", () => {
    expect(regionOf("---\n- x\n---\n- a\n")).toEqual({ start: 3, end: 4 });
  });
});

describe("findListRegion with Unicode spaces", () => {
  it.each(["\u00A0", "\u3000", "\u2003", "\u202F", "\uFEFF"])(
    "counts an indented line led by %j as a continuation",
    (space) => {
      expect(regionOf(`- a\n  ${space}x\n- b\n`)).toEqual({ start: 0, end: 3 });
    },
  );

  it("counts an indented line of only U+00A0 as a trailing blank line of its item", () => {
    const [block] = groupIntoItemBlocks(splitLines("- a\n  b\n  \u00A0\n"));

    expect(block?.continuationLines).toEqual(["  b\n"]);
    expect(block?.trailingBlankLines).toEqual(["  \u00A0\n"]);
  });

  it("counts a line of only U+00A0 as blank so the list continues past it", () => {
    expect(regionOf("- a\n\u00A0\n- b\n")).toEqual({ start: 0, end: 3 });
  });
});

describe("groupIntoItemBlocks", () => {
  it("groups continuation lines under their item", () => {
    const [block] = groupIntoItemBlocks(splitLines("- a\n  b\n  c\n"));

    expect(block).toEqual({ firstLine: "- a\n", continuationLines: ["  b\n", "  c\n"], trailingBlankLines: [] });
  });

  it("keeps blank lines between continuation lines as part of the item", () => {
    const [block] = groupIntoItemBlocks(splitLines("- a\n  b\n\n  c\n"));

    expect(block?.continuationLines).toEqual(["  b\n", "\n", "  c\n"]);
  });

  it("separates blank lines after the last content line as trailing blanks", () => {
    const blocks = groupIntoItemBlocks(splitLines("- a\n  b\n\n\n- c\n"));

    expect(blocks[0]?.trailingBlankLines).toEqual(["\n", "\n"]);
    expect(blocks[0]?.continuationLines).toEqual(["  b\n"]);
  });

  it("makes a blank line after an item without continuation a trailing blank", () => {
    const blocks = groupIntoItemBlocks(splitLines("- a\n\n- b\n"));

    expect(blocks.map((block) => block.trailingBlankLines)).toEqual([["\n"], []]);
  });

  it("starts a new block for every list line, nested or not", () => {
    const blocks = groupIntoItemBlocks(splitLines("- a\n\t- b\n- c\n"));

    expect(blocks.map((block) => block.firstLine)).toEqual(["- a\n", "\t- b\n", "- c\n"]);
  });
});
