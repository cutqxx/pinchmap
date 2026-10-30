import { describe, expect, it } from "vitest";
import { buildMindMap, effectiveColor, NODE_COLORS, readColor, withColor } from ".";

const TREE = buildMindMap([
  { id: "r", text: "", parentId: null, state: { color: "red" } },
  { id: "a", text: "", parentId: "r" },
  { id: "a1", text: "", parentId: "a" },
  { id: "b", text: "", parentId: "r", state: { color: "green" } },
  { id: "b1", text: "", parentId: "b" },
  { id: "r2", text: "", parentId: null },
  { id: "r2c", text: "", parentId: "r2" },
]);

describe("NODE_COLORS", () => {
  it("lists the six colours in menu order", () => {
    expect(NODE_COLORS).toEqual(["red", "orange", "yellow", "green", "cyan", "purple"]);
  });
});

describe("readColor", () => {
  it.each(NODE_COLORS)("reads the stored name %s", (color) => {
    expect(readColor({ color })).toBe(color);
  });

  it.each([[undefined], [{}], [{ color: null }], [{ color: "magenta" }], [{ color: "RED" }], [{ color: 3 }], [{ color: ["red"] }], [{ color: { red: 1 } }], [{ color: true }]])(
    "reads no colour for the state %j",
    (state) => {
      expect(readColor(state)).toBeUndefined();
    },
  );
});

describe("withColor", () => {
  it("sets the colour and keeps the other fields", () => {
    expect(withColor({ x: 1, collapsed: true }, "cyan")).toEqual({ x: 1, collapsed: true, color: "cyan" });
  });

  it("creates a state holding only the colour when there was none", () => {
    expect(withColor(undefined, "purple")).toEqual({ color: "purple" });
  });

  it("replaces an existing colour", () => {
    expect(withColor({ color: "red" }, "green")).toEqual({ color: "green" });
  });

  it("removes the key when clearing, keeping the other fields", () => {
    const cleared = withColor({ color: "red", x: 1 }, undefined);

    expect(cleared).toEqual({ x: 1 });
    expect(cleared).not.toHaveProperty("color");
  });

  it("leaves no state at all when clearing the only field", () => {
    expect(withColor({ color: "red" }, undefined)).toBeUndefined();
  });

  it("leaves no state when clearing an undefined state", () => {
    expect(withColor(undefined, undefined)).toBeUndefined();
  });

  it("does not change the given state", () => {
    const state = { color: "red", x: 1 };

    withColor(state, "green");

    expect(state).toEqual({ color: "red", x: 1 });
  });
});

describe("effectiveColor", () => {
  it("is the node's own colour", () => {
    expect(effectiveColor(TREE, "r")).toBe("red");
  });

  it("is inherited from the parent by a child without its own colour", () => {
    expect(effectiveColor(TREE, "a")).toBe("red");
  });

  it("is inherited from the nearest coloured ancestor through several levels", () => {
    expect(effectiveColor(TREE, "a1")).toBe("red");
    expect(effectiveColor(TREE, "b1")).toBe("green");
  });

  it("keeps a descendant's own colour over the ancestor's", () => {
    expect(effectiveColor(TREE, "b")).toBe("green");
  });

  it("keeps the descendant's own colour when the ancestor's colour changes", () => {
    const recoloured = buildMindMap([
      { id: "r", text: "", parentId: null, state: { color: "purple" } },
      { id: "b", text: "", parentId: "r", state: { color: "green" } },
      { id: "b1", text: "", parentId: "b" },
    ]);

    expect(effectiveColor(recoloured, "b")).toBe("green");
    expect(effectiveColor(recoloured, "b1")).toBe("green");
  });

  it("falls back to the ancestor's colour once the own colour is removed", () => {
    const cleared = buildMindMap([
      { id: "r", text: "", parentId: null, state: { color: "red" } },
      { id: "b", text: "", parentId: "r", state: withColor({ color: "green" }, undefined) },
    ]);

    expect(effectiveColor(cleared, "b")).toBe("red");
  });

  it("is undefined when no ancestor has a colour", () => {
    expect(effectiveColor(TREE, "r2")).toBeUndefined();
    expect(effectiveColor(TREE, "r2c")).toBeUndefined();
  });

  it("skips an unknown stored value and inherits from the ancestor instead", () => {
    const map = buildMindMap([
      { id: "r", text: "", parentId: null, state: { color: "red" } },
      { id: "a", text: "", parentId: "r", state: { color: "magenta" } },
    ]);

    expect(effectiveColor(map, "a")).toBe("red");
  });
});
