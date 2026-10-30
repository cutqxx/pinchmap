import { describe, expect, it } from "vitest";
import { findCodeBlocks, findCodeLines } from "./codeLines";
import { splitLines } from "./lines";

function blocksOf(text: string): { start: number; end: number }[] {
  return findCodeBlocks(splitLines(text));
}

describe("findCodeBlocks fenced code", () => {
  it("covers a backtick fence from its opening to its closing line", () => {
    expect(blocksOf("a\n```\ncode\n```\nb\n")).toEqual([{ start: 1, end: 4 }]);
  });

  it("covers a tilde fence", () => {
    expect(blocksOf("~~~\ncode\n~~~\n")).toEqual([{ start: 0, end: 3 }]);
  });

  it("accepts an info string after the opening fence", () => {
    expect(blocksOf("```ts\ncode\n```\n")).toEqual([{ start: 0, end: 3 }]);
  });

  it("is closed by a longer fence of the same character", () => {
    expect(blocksOf("```\ncode\n`````\nafter\n")).toEqual([{ start: 0, end: 3 }]);
  });

  it("is not closed by a shorter fence", () => {
    expect(blocksOf("````\n```\nstill code\n````\n")).toEqual([{ start: 0, end: 4 }]);
  });

  it("is not closed by a fence of the other character", () => {
    expect(blocksOf("~~~\n```\nstill code\n~~~\n")).toEqual([{ start: 0, end: 4 }]);
  });

  it("is not closed by a fence line that carries an info string", () => {
    expect(blocksOf("```\n```js\nstill code\n```\n")).toEqual([{ start: 0, end: 4 }]);
  });

  it("is closed by an indented fence line", () => {
    expect(blocksOf("```\ncode\n   ```\n")).toEqual([{ start: 0, end: 3 }]);
  });

  it("finds an indented opening fence", () => {
    expect(blocksOf("- a\n  ```\n  code\n  ```\n")).toEqual([{ start: 1, end: 4 }]);
  });

  it("does not treat two fence characters as a fence", () => {
    expect(blocksOf("``\ncode\n``\n")).toEqual([]);
  });

  it("does not treat a backtick fence with a backtick in its info string as opening", () => {
    expect(blocksOf("```a`b\ncode\n```\n")).toEqual([]);
  });

  it("allows a backtick in the info string of a tilde fence", () => {
    expect(blocksOf("~~~a`b\ncode\n~~~\n")).toEqual([{ start: 0, end: 3 }]);
  });

  it("finds a fence whose lines end in CRLF", () => {
    expect(blocksOf("```\r\ncode\r\n```\r\n")).toEqual([{ start: 0, end: 3 }]);
  });

  it("finds several separate blocks", () => {
    expect(blocksOf("```\na\n```\ntext\n~~~\nb\n~~~\n")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ]);
  });
});

describe("findCodeBlocks unclosed fences", () => {
  it("does not treat an unclosed fence as a block", () => {
    expect(blocksOf("```\n- a\n- b\n")).toEqual([]);
  });

  it("keeps a later closed block when an earlier fence never closes", () => {
    expect(blocksOf("~~~\n- a\n```\ncode\n```\n")).toEqual([{ start: 2, end: 5 }]);
  });
});

describe("findCodeBlocks inside list items", () => {
  it("does not let an indented fence close past a line indented less than it", () => {
    expect(blocksOf("- a\n  ```\n- b\n  ```\n")).toEqual([]);
  });

  it("does not let an indented fence close on a fence at the margin", () => {
    expect(blocksOf("- a\n  ```\n- b\n\n```\n")).toEqual([]);
  });

  it("keeps lines indented deeper than the fence inside it", () => {
    expect(blocksOf("- a\n  ```\n    deeper\n  ```\n")).toEqual([{ start: 1, end: 4 }]);
  });

  it("starts a fence opened on the item's own line below that line", () => {
    expect(blocksOf("- ```js ^a1\n  - code\n  ```\n- b\n")).toEqual([{ start: 1, end: 3 }]);
  });

  it("closes a fence opened on a nested item's line at that item's content column", () => {
    expect(blocksOf("- a\n\t- ```\n\t  code\n\t  ```\n")).toEqual([{ start: 2, end: 4 }]);
  });

  it("does not let a fence opened on an item line close past the end of the item", () => {
    expect(blocksOf("- ```\n- b\n  ```\n")).toEqual([]);
  });

  it("starts a %% block opened on the item's own line below that line, ignoring the item id", () => {
    expect(blocksOf("- %% ^a1\n  hidden\n  %%\n")).toEqual([{ start: 1, end: 3 }]);
  });

  it("does not swallow a list line that carries an id into an item's block", () => {
    expect(blocksOf("- a ^a1\n  ```\n\t- b ^b2\n\t  ```\n")).toEqual([]);
  });

  it("keeps a list line without an id inside an item's block", () => {
    expect(blocksOf("- a ^a1\n  ```\n  - code\n  ```\n")).toEqual([{ start: 1, end: 4 }]);
  });

  it("keeps a list line with an id inside a block at the margin", () => {
    expect(blocksOf("```\n- fake ^x1\n```\n")).toEqual([{ start: 0, end: 3 }]);
  });
});

describe("findCodeBlocks comments", () => {
  it("covers a %% comment block with its delimiters", () => {
    expect(blocksOf("a\n%%\nhidden\n%%\nb\n")).toEqual([{ start: 1, end: 4 }]);
  });

  it("does not treat an unclosed %% as a block", () => {
    expect(blocksOf("%%\n- a\n")).toEqual([]);
  });

  it("does not treat an inline %%comment%% as a block", () => {
    expect(blocksOf("text %%note%% more\n")).toEqual([]);
  });

  it("does not look for a fence inside a %% block", () => {
    expect(blocksOf("%%\n```\n%%\nafter\n")).toEqual([{ start: 0, end: 3 }]);
  });

  it("does not look for a %% inside a fence", () => {
    expect(blocksOf("```\n%%\n```\nafter\n")).toEqual([{ start: 0, end: 3 }]);
  });
});

describe("findCodeBlocks starting point", () => {
  it("ignores a fence before the starting line", () => {
    expect(findCodeBlocks(splitLines("```\ncode\n```\n"), 1)).toEqual([]);
  });
});

describe("findCodeLines", () => {
  it("marks exactly the lines of the blocks", () => {
    expect(findCodeLines(splitLines("a\n```\nb\n```\nc\n"))).toEqual([false, true, true, true, false]);
  });
});
