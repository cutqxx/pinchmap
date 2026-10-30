import { describe, expect, it } from "vitest";
import type { BranchDraft } from "../model";
import { parsePastedBranches } from "./pastedBranches";

function leaf(text: string): BranchDraft {
  return { text, children: [] };
}

function node(text: string, ...children: BranchDraft[]): BranchDraft {
  return { text, children };
}

describe("parsePastedBranches nested lists", () => {
  it("keeps the structure of a nested list", () => {
    const text = ["- Root", "\t- A", "\t\t- A1", "\t- B"].join("\n");

    expect(parsePastedBranches(text)).toEqual([node("Root", node("A", leaf("A1")), leaf("B"))]);
  });

  it("returns every top-level item as its own branch", () => {
    expect(parsePastedBranches("- One\n- Two\n- Three")).toEqual([leaf("One"), leaf("Two"), leaf("Three")]);
  });

  it.each(["-", "*", "+", "1.", "1)", "12."])("reads %s as a list marker", (marker) => {
    expect(parsePastedBranches(`${marker} Item\n\t${marker} Sub`)).toEqual([node("Item", leaf("Sub"))]);
  });

  it.each([
    ["two spaces", "  "],
    ["four spaces", "    "],
    ["a tab", "\t"],
  ])("nests by %s of indent", (_name, indent) => {
    expect(parsePastedBranches(`- A\n${indent}- B\n${indent}${indent}- C`)).toEqual([node("A", node("B", leaf("C")))]);
  });

  it("counts a tab as four columns, the same as four spaces", () => {
    expect(parsePastedBranches("- A\n\t- B\n    - C")).toEqual([node("A", leaf("B"), leaf("C"))]);
  });

  it("nests a list that starts indented", () => {
    expect(parsePastedBranches("    - A\n        - B")).toEqual([node("A", leaf("B"))]);
  });

  it("drops back to the nearest shallower ancestor when the indent shrinks", () => {
    const text = ["- A", "    - B", "        - C", "  - D"].join("\n");

    expect(parsePastedBranches(text)).toEqual([node("A", node("B", leaf("C")), leaf("D"))]);
  });

  it("treats an item indented deeper than the first as a top-level one when it comes first", () => {
    expect(parsePastedBranches("        - A\n- B")).toEqual([leaf("A"), leaf("B")]);
  });

  it("strips task checkboxes", () => {
    expect(parsePastedBranches("- [ ] todo\n- [x] done\n- [X] DONE")).toEqual([leaf("todo"), leaf("done"), leaf("DONE")]);
  });

  it("strips a trailing block id", () => {
    expect(parsePastedBranches("- Main ^a1b2c3\n\t- Sub ^d4e5f6")).toEqual([node("Main", leaf("Sub"))]);
  });

  it("reads an escaped caret at the end of an item as the plain text a note shows", () => {
    expect(parsePastedBranches("- see \\^abc\n  and \\^def")).toEqual([leaf("see ^abc\nand ^def")]);
  });

  it("reads CRLF and bare CR line breaks", () => {
    expect(parsePastedBranches("- A\r\n\t- B\r- C")).toEqual([node("A", leaf("B")), leaf("C")]);
  });

  it("ignores blank lines between items", () => {
    expect(parsePastedBranches("- A\n\n\n- B")).toEqual([leaf("A"), leaf("B")]);
  });

  it("makes an empty node from a bare marker", () => {
    expect(parsePastedBranches("- A\n\t-\n\t- B")).toEqual([node("A", leaf(""), leaf("B"))]);
  });

  it("does not take a dash glued to a word for a list marker", () => {
    expect(parsePastedBranches("-A\n- B")).toEqual([leaf("-A"), leaf("B")]);
  });

  it("keeps numbers inside the text", () => {
    expect(parsePastedBranches("- 3 apples\n- v1.2 release")).toEqual([leaf("3 apples"), leaf("v1.2 release")]);
  });
});

describe("parsePastedBranches multi-line items", () => {
  it("joins indented non-list lines to the previous item as extra text lines", () => {
    expect(parsePastedBranches("- Title\n  second line\n- Next")).toEqual([leaf("Title\nsecond line"), leaf("Next")]);
  });

  it("keeps a blank line between extra lines", () => {
    expect(parsePastedBranches("- Title\n  one\n\n  two")).toEqual([leaf("Title\none\n\ntwo")]);
  });

  it("removes the escape from extra lines that look like list items", () => {
    expect(parsePastedBranches("- Title\n  \\- not a child\n  1\\. nor this")).toEqual([leaf("Title\n- not a child\n1. nor this")]);
  });

  it("keeps the relative indent of extra lines", () => {
    expect(parsePastedBranches("- Title\n  code\n    indented")).toEqual([leaf("Title\ncode\n  indented")]);
  });

  it("makes text before the first list item a top item", () => {
    expect(parsePastedBranches("Intro\n- A\n\t- B")).toEqual([leaf("Intro"), node("A", leaf("B"))]);
  });

  it("makes an unindented line between list items a new top item", () => {
    expect(parsePastedBranches("- A\nbreak\n- B")).toEqual([leaf("A"), leaf("break"), leaf("B")]);
  });
});

describe("parsePastedBranches plain text", () => {
  it("makes one node per non-empty line, in order", () => {
    expect(parsePastedBranches("one\n\ntwo\nthree")).toEqual([leaf("one"), leaf("two"), leaf("three")]);
  });

  it("makes the nodes flat even when lines are indented", () => {
    expect(parsePastedBranches("one\n    two")).toEqual([leaf("one"), leaf("two")]);
  });

  it("trims each line", () => {
    expect(parsePastedBranches("  padded  \r\n\tother\t")).toEqual([leaf("padded"), leaf("other")]);
  });

  it("keeps a block id lookalike in plain text", () => {
    expect(parsePastedBranches("see ^abc")).toEqual([leaf("see ^abc")]);
  });

  it.each(["", "\n", "   \r\n\t  \n"])("returns nothing for blank input %j", (text) => {
    expect(parsePastedBranches(text)).toEqual([]);
  });
});
