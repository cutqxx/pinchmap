import { describe, expect, it } from "vitest";
import { hasMindmapFlag, withMindmapFlag } from "./frontmatter";

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

describe("withMindmapFlag", () => {
  it("creates frontmatter when the note has none", () => {
    expect(withMindmapFlag("Hello\n")).toBe("---\nmindmap: true\n---\nHello\n");
  });

  it("creates frontmatter for an empty note", () => {
    expect(withMindmapFlag("")).toBe("---\nmindmap: true\n---\n");
  });

  it("inserts the flag before the closing fence of existing frontmatter", () => {
    expect(withMindmapFlag("---\ntags: [a]\n---\nBody\n")).toBe("---\ntags: [a]\nmindmap: true\n---\nBody\n");
  });

  it("inserts the flag into empty frontmatter", () => {
    expect(withMindmapFlag("---\n---\nBody")).toBe("---\nmindmap: true\n---\nBody");
  });

  it("replaces mindmap: false in place", () => {
    expect(withMindmapFlag("---\ntags: a\nmindmap: false\nauthor: me\n---\n")).toBe(
      "---\ntags: a\nmindmap: true\nauthor: me\n---\n",
    );
  });

  it("leaves other fields untouched", () => {
    const original = "---\ntitle: \"X: y\"\ntags:\n  - a\n  - b\nmindmapper: 1\n---\n- item\n";

    const result = withMindmapFlag(original);

    expect(result).toBe("---\ntitle: \"X: y\"\ntags:\n  - a\n  - b\nmindmapper: 1\nmindmap: true\n---\n- item\n");
  });

  it("is idempotent when the flag is already set", () => {
    const flagged = "---\nmindmap: true\n---\n- a\n";

    expect(withMindmapFlag(flagged)).toBe(flagged);
  });

  it("keeps CRLF line endings when creating frontmatter", () => {
    expect(withMindmapFlag("a\r\nb\r\n")).toBe("---\r\nmindmap: true\r\n---\r\na\r\nb\r\n");
  });

  it("keeps CRLF line endings when inserting into existing frontmatter", () => {
    expect(withMindmapFlag("---\r\ntags: a\r\n---\r\nBody\r\n")).toBe("---\r\ntags: a\r\nmindmap: true\r\n---\r\nBody\r\n");
  });

  it("keeps CRLF line endings when replacing mindmap: false", () => {
    expect(withMindmapFlag("---\r\nmindmap: false\r\n---\r\n")).toBe("---\r\nmindmap: true\r\n---\r\n");
  });

  it("treats frontmatter closed with three dots as frontmatter", () => {
    expect(withMindmapFlag("---\ntags: a\n...\nBody")).toBe("---\ntags: a\nmindmap: true\n...\nBody");
  });

  it("treats unclosed frontmatter as plain text and prepends a new frontmatter block", () => {
    expect(withMindmapFlag("---\ntags: a\nBody\n")).toBe("---\nmindmap: true\n---\n---\ntags: a\nBody\n");
  });

  it("produces text that hasMindmapFlag recognises", () => {
    for (const original of ["", "x", "---\na: 1\n---\n", "---\nmindmap: false\n---\n"]) {
      expect(hasMindmapFlag(withMindmapFlag(original))).toBe(true);
    }
  });
});

describe("mindmap key case sensitivity", () => {
  it.each(["MindMap: true", "MINDMAP: true"])("hasMindmapFlag is false for %s", (line) => {
    expect(hasMindmapFlag(`---\n${line}\n---\n`)).toBe(false);
  });

  it("hasMindmapFlag is true for lowercase mindmap: true", () => {
    expect(hasMindmapFlag("---\nmindmap: true\n---\n")).toBe(true);
  });

  it("withMindmapFlag keeps a MindMap field and adds a separate mindmap: true", () => {
    expect(withMindmapFlag("---\nMindMap: x\n---\n- a\n")).toBe("---\nMindMap: x\nmindmap: true\n---\n- a\n");
  });
});
