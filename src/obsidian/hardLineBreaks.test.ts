import { describe, expect, it } from "vitest";
import { withHardLineBreaks } from "./hardLineBreaks";

describe("withHardLineBreaks", () => {
  it.each([
    ["single line is unchanged", "one", "one"],
    ["a line break between text lines becomes a hard break", "a\nb", "a  \nb"],
    ["every inner break of three lines is hardened, the last line is not", "a\nb\nc", "a  \nb  \nc"],
    ["a blank line (paragraph break) is kept as is", "a\n\nb", "a\n\nb"],
    ["a whitespace-only line counts as blank", "a\n  \nb", "a\n  \nb"],
    ["an existing hard break is not doubled", "a  \nb", "a  \nb"],
    ["a trailing backslash break is kept", "a\\\nb", "a\\\nb"],
    ["a trailing newline gets no hard break", "a\n", "a\n"],
    ["backtick fence content is untouched", "```\nx\ny\n```", "```\nx\ny\n```"],
    ["tilde fence content is untouched", "~~~\nx\ny\n~~~", "~~~\nx\ny\n~~~"],
    ["text before and after a fence is hardened, text inside is not", "a\nb\n```\nx\ny\n```\nc\nd", "a  \nb  \n```\nx\ny\n```\nc  \nd"],
    ["an unclosed fence protects the rest of the text", "```\nx\ny", "```\nx\ny"],
    ["list items get hard breaks", "- a\n- b", "- a  \n- b"],
  ])("%s", (_name, source, expected) => {
    expect(withHardLineBreaks(source)).toBe(expected);
  });
});
