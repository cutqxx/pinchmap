import { describe, expect, it } from "vitest";
import { findNodeLinks } from "./nodeLinks";

describe("findNodeLinks detection", () => {
  it("finds a wiki link", () => {
    expect(findNodeLinks("see [[Note]]")).toEqual([{ kind: "wiki", target: "Note", label: "Note" }]);
  });

  it("uses the alias as label of a wiki link", () => {
    expect(findNodeLinks("[[Note|the alias]]")).toEqual([{ kind: "wiki", target: "Note", label: "the alias" }]);
  });

  it("keeps the heading in the target of a wiki link", () => {
    expect(findNodeLinks("[[Note#Heading]]")).toEqual([{ kind: "wiki", target: "Note#Heading", label: "Note#Heading" }]);
  });

  it("finds a markdown link with its text as label", () => {
    expect(findNodeLinks("[site](https://example.com/a)")).toEqual([
      { kind: "external", target: "https://example.com/a", label: "site" },
    ]);
  });

  it("falls back to the url as label when markdown link text is empty", () => {
    expect(findNodeLinks("[](https://example.com)")).toEqual([
      { kind: "external", target: "https://example.com", label: "https://example.com" },
    ]);
  });

  it("finds a bare url", () => {
    expect(findNodeLinks("go to https://example.com/x now")).toEqual([
      { kind: "external", target: "https://example.com/x", label: "https://example.com/x" },
    ]);
  });

  it("strips trailing punctuation from a bare url", () => {
    expect(findNodeLinks("see https://example.com.")[0]?.target).toBe("https://example.com");
  });

  it("accepts plain http", () => {
    expect(findNodeLinks("http://example.com")).toHaveLength(1);
  });

  it("does not count non-http schemes as external links", () => {
    expect(findNodeLinks("[x](ftp://example.com) [y](mailto:a@b.c) [z](obsidian://open)")).toEqual([]);
  });

  it("returns no links for plain text", () => {
    expect(findNodeLinks("just text")).toEqual([]);
  });

  it("returns links in reading order", () => {
    const links = findNodeLinks("[[A]] then https://b.example then [c](https://c.example)");
    expect(links.map((link) => link.target)).toEqual(["A", "https://b.example", "https://c.example"]);
  });
});

describe("findNodeLinks exclusions", () => {
  it("ignores links in inline code", () => {
    expect(findNodeLinks("`[[Note]]` and `https://example.com`")).toEqual([]);
  });

  it("still finds links outside inline code on the same line", () => {
    expect(findNodeLinks("`[[Hidden]]` [[Shown]]").map((link) => link.target)).toEqual(["Shown"]);
  });

  it("ignores links in a backtick code fence", () => {
    expect(findNodeLinks("```\n[[Note]]\nhttps://example.com\n```")).toEqual([]);
  });

  it("ignores links in a tilde code fence and finds those after it", () => {
    expect(findNodeLinks("~~~\n[[Hidden]]\n~~~\n[[Shown]]").map((link) => link.target)).toEqual(["Shown"]);
  });

  it.each(["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif", "PNG"])("does not count an embedded .%s image", (ext) => {
    expect(findNodeLinks(`![[img.${ext}]]`)).toEqual([]);
  });

  it("does not count an image embed with a size or alias", () => {
    expect(findNodeLinks("![[img.png|200]]")).toEqual([]);
  });

  it("does not count a markdown image embed", () => {
    expect(findNodeLinks("![](https://example.com/a.png)")).toEqual([]);
  });

  it("counts a note embed as a link to that note", () => {
    expect(findNodeLinks("![[Note]]")).toEqual([{ kind: "wiki", target: "Note", label: "Note" }]);
  });

  it("counts a plain link to an image file (not an embed)", () => {
    expect(findNodeLinks("[[img.png]]")).toHaveLength(1);
  });

  it("ignores an empty wiki link", () => {
    expect(findNodeLinks("[[]] [[ |alias]]")).toEqual([]);
  });
});

describe("findNodeLinks deduplication", () => {
  it("lists repeated links once, keeping the first label", () => {
    expect(findNodeLinks("[[Note|first]] [[Note|second]]")).toEqual([{ kind: "wiki", target: "Note", label: "first" }]);
  });

  it("treats different headings of a note as different links", () => {
    expect(findNodeLinks("[[Note#A]] [[Note#B]]")).toHaveLength(2);
  });

  it("deduplicates a markdown link and the same bare url", () => {
    expect(findNodeLinks("[site](https://e.com) https://e.com")).toHaveLength(1);
  });

  it("keeps a wiki and an external link with equal target text apart", () => {
    expect(findNodeLinks("[[https://e.com]] https://e.com").map((link) => link.kind)).toEqual(["wiki", "external"]);
  });
});
