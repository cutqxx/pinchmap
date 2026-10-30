import { describe, expect, it } from "vitest";
import { computeLayout } from "../layout";
import { EMPTY_MIND_MAP, buildMindMap } from "../model";
import type { NodeEntry } from "../model";
import { navigate } from "./navigation";
import type { NavigationDirection } from "./navigation";

const SIZE = { width: 100, height: 20 };

function node(id: string, parentId: string | null, side?: "left"): NodeEntry {
  return { id, text: id, parentId, ...(side === undefined ? {} : { state: { side } }) };
}

function press(entries: NodeEntry[], selectedId: string | null, direction: NavigationDirection): string | null {
  const map = buildMindMap(entries);
  const sizes = new Map(entries.map((entry) => [entry.id, SIZE]));
  return navigate(map, computeLayout(map, sizes), selectedId, direction);
}

// root r; right: a (children a1, a2 (child a2x)), b; left: l1 (children l1a, l1b), l2
const TREE: NodeEntry[] = [
  node("r", null),
  node("a", "r"),
  node("a1", "a"),
  node("a2", "a"),
  node("a2x", "a2"),
  node("b", "r"),
  node("l1", "r", "left"),
  node("l1a", "l1"),
  node("l1b", "l1"),
  node("l1bx", "l1b"),
  node("l2", "r", "left"),
];

describe("navigate with nothing selected", () => {
  it.each(["up", "down", "left", "right"] as const)("selects the first root on %s", (direction) => {
    const entries = [node("first", null), node("second", null)];

    expect(press(entries, null, direction)).toBe("first");
  });

  it("returns null for an empty map", () => {
    const layout = computeLayout(EMPTY_MIND_MAP, new Map());

    expect(navigate(EMPTY_MIND_MAP, layout, null, "down")).toBeNull();
  });
});

describe("navigate up and down among siblings", () => {
  it("moves down to the next sibling", () => {
    expect(press(TREE, "a1", "down")).toBe("a2");
  });

  it("moves up to the previous sibling", () => {
    expect(press(TREE, "a2", "up")).toBe("a1");
  });

  it("stays on the first sibling when moving up", () => {
    expect(press(TREE, "a1", "up")).toBe("a1");
  });

  it("stays on the last sibling when moving down", () => {
    expect(press(TREE, "a2", "down")).toBe("a2");
  });

  it("stays on an only child in both vertical directions", () => {
    expect(press(TREE, "a2x", "up")).toBe("a2x");
    expect(press(TREE, "a2x", "down")).toBe("a2x");
  });

  it("moves between siblings on the left side", () => {
    expect(press(TREE, "l1a", "down")).toBe("l1b");
    expect(press(TREE, "l1b", "up")).toBe("l1a");
  });
});

describe("navigate up and down among root children", () => {
  it("stays on the right side when moving down from the last right child", () => {
    expect(press(TREE, "b", "down")).toBe("b");
  });

  it("stays on the left side when moving up from the first left child", () => {
    expect(press(TREE, "l1", "up")).toBe("l1");
  });

  it("skips children of the other side when moving down", () => {
    const entries = [node("r", null), node("a", "r"), node("l", "r", "left"), node("b", "r")];

    expect(press(entries, "a", "down")).toBe("b");
  });

  it("skips children of the other side when moving up", () => {
    const entries = [node("r", null), node("l", "r", "left"), node("a", "r"), node("l2", "r", "left")];

    expect(press(entries, "l2", "up")).toBe("l");
  });
});

describe("navigate up and down among roots", () => {
  const roots = [node("r1", null), node("r2", null), node("r3", null)];

  it("moves down to the next root", () => {
    expect(press(roots, "r1", "down")).toBe("r2");
  });

  it("moves up to the previous root", () => {
    expect(press(roots, "r3", "up")).toBe("r2");
  });

  it("stays on the first root when moving up", () => {
    expect(press(roots, "r1", "up")).toBe("r1");
  });

  it("stays on the last root when moving down", () => {
    expect(press(roots, "r3", "down")).toBe("r3");
  });
});

describe("navigate right and left on the right side", () => {
  it("moves right to the first child", () => {
    expect(press(TREE, "a", "right")).toBe("a1");
  });

  it("moves left to the parent", () => {
    expect(press(TREE, "a1", "left")).toBe("a");
  });

  it("moves left from a right root child to the root", () => {
    expect(press(TREE, "a", "left")).toBe("r");
  });

  it("stays on a leaf when moving right", () => {
    expect(press(TREE, "b", "right")).toBe("b");
  });

  it("mirrors correctly for deep nesting", () => {
    expect(press(TREE, "a2", "right")).toBe("a2x");
    expect(press(TREE, "a2x", "left")).toBe("a2");
  });
});

describe("navigate right and left on the left side", () => {
  it("moves left to the first child", () => {
    expect(press(TREE, "l1", "left")).toBe("l1a");
  });

  it("moves right to the parent", () => {
    expect(press(TREE, "l1a", "right")).toBe("l1");
  });

  it("moves right from a left root child to the root", () => {
    expect(press(TREE, "l1", "right")).toBe("r");
  });

  it("stays on a leaf when moving left", () => {
    expect(press(TREE, "l2", "left")).toBe("l2");
  });

  it("mirrors correctly for deep nesting", () => {
    expect(press(TREE, "l1b", "left")).toBe("l1bx");
    expect(press(TREE, "l1bx", "right")).toBe("l1b");
  });

  it("does not descend into a left branch when moving right", () => {
    expect(press(TREE, "l1b", "right")).toBe("l1");
  });
});

describe("navigate with a pending branch placed on the left by the height rule", () => {
  const PENDING_LEFT: NodeEntry[] = [
    node("r", null),
    node("a", "r"),
    { id: "p", text: "p", parentId: "r", isSidePending: true },
    node("b", "r"),
    node("pc", "p"),
    node("pcc", "pc"),
    node("pccc", "pcc"),
  ];

  function sideOf(id: string): "left" | "right" {
    const map = buildMindMap(PENDING_LEFT);
    const sizes = new Map(PENDING_LEFT.map((entry) => [entry.id, SIZE]));
    const layout = computeLayout(map, sizes);
    return (layout.positions.get(id)?.x ?? 0) < (layout.positions.get("r")?.x ?? 0) ? "left" : "right";
  }

  it("is placed on the left by the layout", () => {
    expect(sideOf("p")).toBe("left");
  });

  it("is reached by left from the root and its child by left again", () => {
    expect(press(PENDING_LEFT, "r", "left")).toBe("p");
    expect(press(PENDING_LEFT, "p", "left")).toBe("pc");
  });

  it("is skipped by up and down among the right-side children", () => {
    expect(press(PENDING_LEFT, "a", "down")).toBe("b");
    expect(press(PENDING_LEFT, "b", "down")).toBe("b");
    expect(press(PENDING_LEFT, "b", "up")).toBe("a");
  });
});

describe("navigate from a root horizontally", () => {
  it("moves right to the first right child", () => {
    expect(press(TREE, "r", "right")).toBe("a");
  });

  it("moves left to the first left child", () => {
    expect(press(TREE, "r", "left")).toBe("l1");
  });

  it("stays when the root has no child on the right", () => {
    expect(press([node("r", null), node("l", "r", "left")], "r", "right")).toBe("r");
  });

  it("stays when the root has no child on the left", () => {
    expect(press([node("r", null), node("a", "r")], "r", "left")).toBe("r");
  });

  it("stays on a childless root in both horizontal directions", () => {
    expect(press([node("r", null)], "r", "left")).toBe("r");
    expect(press([node("r", null)], "r", "right")).toBe("r");
  });
});

function collapsed(entries: NodeEntry[], ...ids: string[]): NodeEntry[] {
  return entries.map((entry) => (ids.includes(entry.id) ? { ...entry, state: { ...entry.state, collapsed: true } } : entry));
}

describe("navigate with collapsed branches", () => {
  it("stays on a collapsed right node instead of entering its hidden children", () => {
    expect(press(collapsed(TREE, "a"), "a", "right")).toBe("a");
  });

  it("stays on a collapsed left node instead of entering its hidden children", () => {
    expect(press(collapsed(TREE, "l1"), "l1", "left")).toBe("l1");
  });

  it("stays on a collapsed root when moving toward its right branches", () => {
    expect(press(collapsed(TREE, "r"), "r", "right")).toBe("r");
  });

  it("stays on a collapsed root when moving toward its left branches", () => {
    expect(press(collapsed(TREE, "r"), "r", "left")).toBe("r");
  });

  it("still moves back to the parent from a collapsed node", () => {
    expect(press(collapsed(TREE, "a"), "a", "left")).toBe("r");
  });

  it("still moves between siblings from a collapsed node", () => {
    expect(press(collapsed(TREE, "a"), "a", "down")).toBe("b");
  });

  it("still enters the children of an expanded sibling of a collapsed node", () => {
    expect(press(collapsed(TREE, "b"), "a", "right")).toBe("a1");
  });
});
