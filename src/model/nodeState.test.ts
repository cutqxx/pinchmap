import { describe, expect, it } from "vitest";
import { isJsonObject } from "./nodeState";

describe("isJsonObject", () => {
  it.each([
    ["a plain object", { collapsed: true }, true],
    ["an empty object", {}, true],
    ["an array", [1], false],
    ["null", null, false],
    ["a string", "x", false],
    ["a number", 1, false],
    ["undefined", undefined, false],
  ])("answers for %s", (_name, value, expected) => {
    expect(isJsonObject(value)).toBe(expected);
  });
});
