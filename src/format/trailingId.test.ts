import { describe, expect, it } from "vitest";
import { composeItemContent } from "./trailingId";

describe("composeItemContent", () => {
  it("returns plain text unchanged when no id was written before", () => {
    expect(composeItemContent("hello", "id1", false)).toBe("hello");
  });

  it("appends the id when the item already had a written id", () => {
    expect(composeItemContent("hello", "id1", true)).toBe("hello ^id1");
  });

  it("writes only the id for empty text with a written id", () => {
    expect(composeItemContent("", "id1", true)).toBe("^id1");
  });

  it("appends the id when text ends in a caret-word even without a written id", () => {
    expect(composeItemContent("see ^ref", "id1", false)).toBe("see ^ref ^id1");
  });

  it("treats text that is only a caret-word as needing an id", () => {
    expect(composeItemContent("^ref", "id1", false)).toBe("^ref ^id1");
  });

  it("does not treat a caret in the middle of a word as a trailing id", () => {
    expect(composeItemContent("a^b", "id1", false)).toBe("a^b");
  });

  it("does not treat a caret-word followed by more text as a trailing id", () => {
    expect(composeItemContent("^ref more", "id1", false)).toBe("^ref more");
  });
});
