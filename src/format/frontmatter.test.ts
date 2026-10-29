import { describe, expect, it } from "vitest";
import { hasMindmapFlag } from "./frontmatter";

describe("hasMindmapFlag", () => {
  it("is true when frontmatter contains mindmap: true", () => {
    expect(hasMindmapFlag("---\nmindmap: true\n---\n- a\n")).toBe(true);
  });

  it("is true when the flag sits among other fields", () => {
    expect(hasMindmapFlag("---\ntags: [a]\nmindmap: true\nauthor: me\n---\n")).toBe(true);
  });

  it("is true for CRLF files", () => {
    expect(hasMindmapFlag("---\r\nmindmap: true\r\n---\r\n- a")).toBe(true);
  });

  it("is true when frontmatter is closed with three dots", () => {
    expect(hasMindmapFlag("---\nmindmap: true\n...\n")).toBe(true);
  });

  it("is false when there is no frontmatter", () => {
    expect(hasMindmapFlag("- a\n- b\n")).toBe(false);
  });

  it("is false when frontmatter lacks the flag", () => {
    expect(hasMindmapFlag("---\ntags: [a]\n---\n- a\n")).toBe(false);
  });

  it("is false when the flag is false", () => {
    expect(hasMindmapFlag("---\nmindmap: false\n---\n")).toBe(false);
  });

  it("is false when the flag appears only in the body", () => {
    expect(hasMindmapFlag("---\ntags: []\n---\nmindmap: true\n")).toBe(false);
  });

  it("is false when the flag is outside a frontmatter block that is not at the file start", () => {
    expect(hasMindmapFlag("intro\n---\nmindmap: true\n---\n")).toBe(false);
  });

  it("is false when frontmatter is never closed", () => {
    expect(hasMindmapFlag("---\nmindmap: true\n- a\n")).toBe(false);
  });

  it("is false for an empty file", () => {
    expect(hasMindmapFlag("")).toBe(false);
  });

  it("is false for a nested key that merely ends with mindmap: true", () => {
    expect(hasMindmapFlag("---\nx:\n  mindmap: true\n---\n")).toBe(false);
  });
});
