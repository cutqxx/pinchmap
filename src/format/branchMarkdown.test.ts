import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import { branchToMarkdown } from "./branchMarkdown";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "a2", text: "A2", parentId: "a" },
  { id: "b", text: "B", parentId: "r" },
  { id: "other", text: "Other root", parentId: null },
]);

describe("branchToMarkdown", () => {
  it("writes a single node as one bullet", () => {
    expect(branchToMarkdown(MAP, "b")).toBe("- B");
  });

  it("nests descendants with one tab per level", () => {
    expect(branchToMarkdown(MAP, "r")).toBe(["- Root", "\t- A", "\t\t- A1", "\t\t- A2", "\t- B"].join("\n"));
  });

  it("starts the list at the copied node, whatever its depth", () => {
    expect(branchToMarkdown(MAP, "a")).toBe(["- A", "\t- A1", "\t- A2"].join("\n"));
  });

  it("leaves out other branches of the map", () => {
    expect(branchToMarkdown(MAP, "r")).not.toContain("Other root");
  });

  it("never writes node ids", () => {
    expect(branchToMarkdown(MAP, "r")).not.toMatch(/\^/);
  });

  it("writes an empty node as a bare bullet without trailing space", () => {
    const map = buildMindMap([{ id: "r", text: "", parentId: null }]);

    expect(branchToMarkdown(map, "r")).toBe("-");
  });

  it("indents extra lines of a node under its bullet", () => {
    const map = buildMindMap([
      { id: "r", text: "Title\nsecond\n\nfourth", parentId: null },
      { id: "c", text: "Child", parentId: "r" },
    ]);

    expect(branchToMarkdown(map, "r")).toBe(["- Title", "  second", "", "  fourth", "\t- Child"].join("\n"));
  });

  it("escapes extra lines that look like list items so they stay part of the node", () => {
    const map = buildMindMap([{ id: "r", text: "Title\n- not a child\n1. nor this", parentId: null }]);

    expect(branchToMarkdown(map, "r")).toBe(["- Title", "  \\- not a child", "  1\\. nor this"].join("\n"));
  });

  it("escapes a node text that ends like an id instead of writing the node's real id", () => {
    const map = buildMindMap([{ id: "xyz", text: "see ^abc\n^def", parentId: null }]);

    expect(branchToMarkdown(map, "xyz")).toBe(["- see \\^abc", "  \\^def"].join("\n"));
  });

  it("adds one more backslash to text that already ends in an escaped id", () => {
    const map = buildMindMap([{ id: "xyz", text: "see \\^abc", parentId: null }]);

    expect(branchToMarkdown(map, "xyz")).toBe("- see \\\\^abc");
  });

  it("leaves a caret that is not at the end of the line alone", () => {
    const map = buildMindMap([{ id: "xyz", text: "x^2 and ^note here", parentId: null }]);

    expect(branchToMarkdown(map, "xyz")).toBe("- x^2 and ^note here");
  });
});
