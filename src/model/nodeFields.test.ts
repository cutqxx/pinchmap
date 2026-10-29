import { describe, expect, it } from "vitest";
import { readRootPosition, readSide, withRootPosition, withSide } from ".";

describe("readSide", () => {
  it("reads left when the state says left", () => {
    expect(readSide({ side: "left" })).toBe("left");
  });

  it("reads right when the state has no side", () => {
    expect(readSide({ color: "red" })).toBe("right");
  });

  it("reads right when there is no state at all", () => {
    expect(readSide(undefined)).toBe("right");
  });

  it.each([["right"], ["LEFT"], [1], [null], [true]])("reads right for the unknown side value %j", (value) => {
    expect(readSide({ side: value })).toBe("right");
  });
});

describe("withSide", () => {
  it("writes side left into a state", () => {
    expect(withSide({ color: "red" }, "left")).toEqual({ color: "red", side: "left" });
  });

  it("creates a state holding only the side for a left branch without state", () => {
    expect(withSide(undefined, "left")).toEqual({ side: "left" });
  });

  it("writes nothing for a right branch without state", () => {
    expect(withSide(undefined, "right")).toBeUndefined();
  });

  it("removes a stale left side when the branch is right", () => {
    expect(withSide({ color: "red", side: "left" }, "right")).toEqual({ color: "red" });
  });

  it("drops the state entirely when only the side was in it and the branch is right", () => {
    expect(withSide({ side: "left" }, "right")).toBeUndefined();
  });

  it("keeps unknown fields untouched", () => {
    const state = { future: { nested: [1, 2] }, pinned: true };

    expect(withSide(state, "left")).toEqual({ ...state, side: "left" });
  });

  it("does not mutate the input state", () => {
    const state = { color: "red" };

    withSide(state, "left");

    expect(state).toEqual({ color: "red" });
  });
});

describe("readRootPosition", () => {
  it("reads finite x and y", () => {
    expect(readRootPosition({ x: 10, y: -20.5 })).toEqual({ x: 10, y: -20.5 });
  });

  it("accepts zero coordinates", () => {
    expect(readRootPosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("returns nothing without state", () => {
    expect(readRootPosition(undefined)).toBeUndefined();
  });

  it("returns nothing when only one coordinate is present", () => {
    expect(readRootPosition({ x: 5 })).toBeUndefined();
    expect(readRootPosition({ y: 5 })).toBeUndefined();
  });

  it.each([["10"], [null], [true], [[1]], [{}]])("ignores the non-number coordinate %j", (bad) => {
    expect(readRootPosition({ x: bad, y: 1 })).toBeUndefined();
    expect(readRootPosition({ x: 1, y: bad })).toBeUndefined();
  });

  it("ignores NaN and infinite coordinates", () => {
    expect(readRootPosition({ x: Number.NaN, y: 1 })).toBeUndefined();
    expect(readRootPosition({ x: 1, y: Number.POSITIVE_INFINITY })).toBeUndefined();
    expect(readRootPosition({ x: Number.NEGATIVE_INFINITY, y: 1 })).toBeUndefined();
  });
});

describe("withRootPosition", () => {
  it("creates a state holding only x and y when there is no state", () => {
    expect(withRootPosition(undefined, { x: 10, y: -4 })).toEqual({ x: 10, y: -4 });
  });

  it("keeps the other state keys", () => {
    expect(withRootPosition({ color: "red", side: "left" }, { x: 1, y: 2 })).toEqual({
      color: "red",
      side: "left",
      x: 1,
      y: 2,
    });
  });

  it("replaces a previous position", () => {
    expect(withRootPosition({ x: 5, y: 6 }, { x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
  });

  it("does not mutate the input state", () => {
    const state = { x: 5, y: 6 };

    withRootPosition(state, { x: 7, y: 8 });

    expect(state).toEqual({ x: 5, y: 6 });
  });

  it("produces a state that readRootPosition reads back", () => {
    expect(readRootPosition(withRootPosition(undefined, { x: 3.5, y: -9 }))).toEqual({ x: 3.5, y: -9 });
  });
});
