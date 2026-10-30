import { describe, expect, it } from "vitest";
import { canonicalNodeText } from "./nodeText";

describe("canonicalNodeText", () => {
  it("returns single-line text unchanged", () => {
    expect(canonicalNodeText("hello world")).toBe("hello world");
  });

  it("trims leading and trailing whitespace from single-line text", () => {
    expect(canonicalNodeText("  \t hello  ")).toBe("hello");
  });

  it("returns an empty string for empty or whitespace-only text", () => {
    expect([canonicalNodeText(""), canonicalNodeText(" \n\t \n ")]).toEqual(["", ""]);
  });

  it("converts CRLF line breaks to LF", () => {
    expect(canonicalNodeText("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("converts lone CR line breaks to LF", () => {
    expect(canonicalNodeText("a\rb")).toBe("a\nb");
  });

  it("trims blank lines and whitespace around the whole text", () => {
    expect(canonicalNodeText("\n\n  a\n b\n\n  ")).toBe("a\nb");
  });

  it("trims trailing whitespace from the first line", () => {
    expect(canonicalNodeText("a   \nb")).toBe("a\nb");
  });

  it("keeps trailing whitespace on continuation lines", () => {
    expect(canonicalNodeText("a\nb  \nc")).toBe("a\nb  \nc");
  });

  it("keeps a leading Unicode space on a continuation line", () => {
    expect(canonicalNodeText("a\n\u3000x")).toBe("a\n\u3000x");
  });

  it("turns a continuation line of only Unicode spaces into an empty line", () => {
    expect(canonicalNodeText("a\n\u00A0\u3000\nb")).toBe("a\n\nb");
  });

  it("turns whitespace-only continuation lines into empty lines", () => {
    expect(canonicalNodeText("a\n   \t\nb")).toBe("a\n\nb");
  });

  it("removes the indentation shared by all continuation lines", () => {
    expect(canonicalNodeText("one\n  a\n  b")).toBe("one\na\nb");
  });

  it("keeps relative indentation between continuation lines", () => {
    expect(canonicalNodeText("one\n  a\n    b\n  c")).toBe("one\na\n  b\nc");
  });

  it("ignores blank lines when computing the shared indentation", () => {
    expect(canonicalNodeText("one\n  a\n\n  b")).toBe("one\na\n\nb");
  });

  it("trims the first line independently of the continuation lines", () => {
    expect(canonicalNodeText("  one\n    a")).toBe("one\na");
  });

  it("removes a shared tab prefix", () => {
    expect(canonicalNodeText("one\n\t\tx\n\ty")).toBe("one\n\tx\ny");
  });

  it("removes only the common prefix when tabs and spaces are mixed", () => {
    expect(canonicalNodeText("a\n  x\n \ty")).toBe("a\n x\n\ty");
  });

  it("removes nothing when lines share no leading characters", () => {
    expect(canonicalNodeText("a\n\tx\n  y")).toBe("a\n\tx\n  y");
  });

  it("removes nothing when one continuation line has no indentation", () => {
    expect(canonicalNodeText("a\n  x\ny")).toBe("a\n  x\ny");
  });

  it.each([
    "a",
    "  a  ",
    "one\n  a\n    b",
    "a\r\nb\r\n",
    "a\n  x\n \ty",
    "a   \n\n  \n\tb\n  c  ",
    "one\n- two",
    "\n\n",
  ])("is idempotent for %j", (input) => {
    const once = canonicalNodeText(input);

    expect(canonicalNodeText(once)).toBe(once);
  });
});
