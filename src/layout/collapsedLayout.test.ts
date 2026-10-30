import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { JsonObject, NodeEntry, NodeId } from "../model";
import { computeLayout } from "./computeLayout";
import type { LayoutResult, LayoutSpacing } from "./computeLayout";
import { findDropTarget } from "./dropTarget";
import type { Size } from "./geometry";

const SPACING: LayoutSpacing = { levelGap: 40, siblingGap: 10, rootGap: 30 };
const SIZE: Size = { width: 100, height: 20 };
const COLLAPSED = { collapsed: true };

function sizesFor(entries: NodeEntry[]): Map<NodeId, Size> {
  return new Map(entries.map((entry) => [entry.id, SIZE]));
}

function layoutOf(entries: NodeEntry[]): LayoutResult {
  return computeLayout(buildMindMap(entries), sizesFor(entries), SPACING);
}

function yOf(layout: LayoutResult, id: NodeId): number {
  const point = layout.positions.get(id);
  if (point === undefined) throw new Error(`No position for ${id}`);
  return point.y;
}

// root r; a (a1, a2, a3) then b, both on the right
function tree(aState?: JsonObject, rootState?: JsonObject): NodeEntry[] {
  return [
    { id: "r", text: "", parentId: null, ...(rootState ? { state: rootState } : {}) },
    { id: "a", text: "", parentId: "r", ...(aState ? { state: aState } : {}) },
    { id: "a1", text: "", parentId: "a" },
    { id: "a2", text: "", parentId: "a" },
    { id: "a3", text: "", parentId: "a" },
    { id: "b", text: "", parentId: "r" },
  ];
}

describe("layout of a collapsed branch", () => {
  it("brings the next sibling closer than when the branch is expanded", () => {
    const expanded = yOf(layoutOf(tree()), "b") - yOf(layoutOf(tree()), "a");
    const collapsed = yOf(layoutOf(tree(COLLAPSED)), "b") - yOf(layoutOf(tree(COLLAPSED)), "a");

    expect(collapsed).toBeLessThan(expanded);
  });

  it("gives a collapsed branch the room of only its own node", () => {
    const layout = layoutOf(tree(COLLAPSED));

    expect(yOf(layout, "b") - yOf(layout, "a")).toBe(SIZE.height + SPACING.siblingGap);
  });

  it("leaves no positions for the hidden descendants", () => {
    const layout = layoutOf(tree(COLLAPSED));

    expect([...layout.positions.keys()].sort()).toEqual(["a", "b", "r"]);
  });

  it("keeps the collapsed node itself placed", () => {
    expect(layoutOf(tree(COLLAPSED)).positions.has("a")).toBe(true);
  });

  it("hides nodes at every depth below a collapsed node", () => {
    const entries = [...tree(COLLAPSED), { id: "a1x", text: "", parentId: "a1" }];

    expect(layoutOf(entries).positions.has("a1x")).toBe(false);
  });

  it("still lays out an expanded child of an expanded branch beside a collapsed deeper one", () => {
    const entries = [...tree(), { id: "a1x", text: "", parentId: "a1" }];
    const withInnerCollapsed = entries.map((entry) => (entry.id === "a1" ? { ...entry, state: COLLAPSED } : entry));

    const layout = layoutOf(withInnerCollapsed);

    expect(layout.positions.has("a1")).toBe(true);
    expect(layout.positions.has("a1x")).toBe(false);
  });

  it("does not leak a hidden node's manual position", () => {
    const entries = tree(COLLAPSED).map((entry) => (entry.id === "a2" ? { ...entry, state: { x: 500, y: 500 } } : entry));

    expect(layoutOf(entries).positions.has("a2")).toBe(false);
  });

  it("is laid out exactly as when the hidden descendants did not exist", () => {
    const withoutChildren = tree().filter((entry) => !entry.id.startsWith("a") || entry.id === "a");

    const collapsed = layoutOf(tree(COLLAPSED));
    const bare = layoutOf(withoutChildren);

    expect(collapsed.positions).toEqual(bare.positions);
  });
});

describe("layout of a collapsed root", () => {
  it("places only the root", () => {
    const layout = layoutOf(tree(undefined, COLLAPSED));

    expect([...layout.positions.keys()]).toEqual(["r"]);
  });

  it("reports zero side heights for the collapsed root", () => {
    expect(layoutOf(tree(undefined, COLLAPSED)).sideHeights.get("r")).toEqual({ left: 0, right: 0 });
  });

  it("gives the collapsed root the room of only its own node, so the next root sits right below", () => {
    const entries = [...tree(undefined, COLLAPSED), { id: "r2", text: "", parentId: null }];

    const layout = layoutOf(entries);

    expect(yOf(layout, "r2") - yOf(layout, "r")).toBe(SIZE.height + SPACING.rootGap);
  });

  it("keeps a pinned collapsed root where it was pinned", () => {
    const layout = layoutOf(tree(undefined, { collapsed: true, x: 300, y: 200 }));

    expect(layout.positions.get("r")).toEqual({ x: 300, y: 200 });
  });
});

describe("drop target lookup with collapsed branches", () => {
  it("ignores a hidden node even where its stale position would be", () => {
    const entries = tree(COLLAPSED);
    const map = buildMindMap(entries);
    const expandedLayout = layoutOf(tree());
    const hiddenSpot = expandedLayout.positions.get("a2");
    if (hiddenSpot === undefined) throw new Error("no spot");
    const collapsedLayout = layoutOf(entries);
    const point = { x: hiddenSpot.x + 1, y: hiddenSpot.y + 1 };

    const target = findDropTarget(map, collapsedLayout, sizesFor(entries), point, "b");

    expect(target === "a2" || target === "a1" || target === "a3").toBe(false);
  });

  it("still finds the collapsed node itself", () => {
    const entries = tree(COLLAPSED);
    const layout = layoutOf(entries);
    const a = layout.positions.get("a");
    if (a === undefined) throw new Error("no a");

    expect(findDropTarget(buildMindMap(entries), layout, sizesFor(entries), { x: a.x + 1, y: a.y + 1 }, "b")).toBe("a");
  });
});
