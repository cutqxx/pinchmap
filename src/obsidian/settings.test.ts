import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseLongPressSeconds, readSettings } from "./settings";

describe("parseLongPressSeconds", () => {
  it.each([
    ["0.5", 0.5],
    ["0,5", 0.5],
    ["0.2", 0.2],
    ["2.0", 2],
    ["2", 2],
    [" 1.25 ", 1.25],
    ["1,25", 1.25],
  ])("accepts %j as %d seconds", (input, expected) => {
    expect(parseLongPressSeconds(input, 0.7)).toBe(expected);
  });

  it.each(["0.19", "0,19", "2.01", "0", "-1", "-0.5", "", "   ", "abc", "NaN", "Infinity", "1.5s", "1,2,3"])(
    "keeps the previous value for %j",
    (input) => {
      expect(parseLongPressSeconds(input, 0.7)).toBe(0.7);
    },
  );
});

describe("readSettings", () => {
  it("returns the default 0.5 s when nothing is stored", () => {
    expect(readSettings(null)).toEqual({ longPressSeconds: 0.5 });
    expect(readSettings(undefined)).toEqual({ longPressSeconds: 0.5 });
    expect(DEFAULT_SETTINGS.longPressSeconds).toBe(0.5);
  });

  it("returns the default when the stored object has no duration", () => {
    expect(readSettings({})).toEqual({ longPressSeconds: 0.5 });
  });

  it("keeps a valid stored duration", () => {
    expect(readSettings({ longPressSeconds: 1.2 })).toEqual({ longPressSeconds: 1.2 });
  });

  it.each([0.2, 2])("keeps the boundary value %d", (seconds) => {
    expect(readSettings({ longPressSeconds: seconds })).toEqual({ longPressSeconds: seconds });
  });

  it.each([0.19, 2.01, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, "1", null, {}])(
    "falls back to 0.5 for the invalid stored value %j",
    (stored) => {
      expect(readSettings({ longPressSeconds: stored })).toEqual({ longPressSeconds: 0.5 });
    },
  );

  it("falls back to 0.5 when the stored data is not an object", () => {
    expect(readSettings("garbage")).toEqual({ longPressSeconds: 0.5 });
  });
});
