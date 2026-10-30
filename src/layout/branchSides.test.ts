import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { NodeEntry, NodeId, Side } from "../model";
import { pickSideForNewBranch, resolveRootSides } from "./branchSides";

describe("pickSideForNewBranch", () => {
  it("puts the first branch of a root on the right", () => {
    expect(pickSideForNewBranch({ left: 0, right: 0 })).toBe("right");
  });

  it("puts the branch on the right when heights are equal", () => {
    expect(pickSideForNewBranch({ left: 120, right: 120 })).toBe("right");
  });

  it("puts the branch on the left when the right side is strictly taller", () => {
    expect(pickSideForNewBranch({ left: 119, right: 120 })).toBe("left");
  });

  it("puts the branch on the right when the left side is taller", () => {
    expect(pickSideForNewBranch({ left: 200, right: 20 })).toBe("right");
  });

  it("puts the branch on the right when the heights are unknown", () => {
    expect(pickSideForNewBranch(undefined)).toBe("right");
  });
});

describe("resolveRootSides", () => {
  const GAP = 10;

  function resolve(entries: NodeEntry[], heights: Record<NodeId, number>) {
    const map = buildMindMap([{ id: "r", text: "", parentId: null }, ...entries]);
    return resolveRootSides(map, "r", new Map(Object.entries(heights)), GAP);
  }

  const branch = (id: string, extra: Partial<NodeEntry> = {}): NodeEntry => ({ id, text: "", parentId: "r", ...extra });
  const sidesOf = (sides: ReadonlyMap<NodeId, Side>): Record<string, Side> => Object.fromEntries(sides);

  it("keeps a decided branch without a state on the right", () => {
    const { sides } = resolve([branch("a")], { a: 30 });

    expect(sidesOf(sides)).toEqual({ a: "right" });
  });

  it("keeps a decided branch with side left on the left", () => {
    const { sides } = resolve([branch("a", { state: { side: "left" } })], { a: 30 });

    expect(sidesOf(sides)).toEqual({ a: "left" });
  });

  it("places pending branches by the rule in list order, first to the right", () => {
    const { sides } = resolve(
      [branch("a", { isSidePending: true }), branch("b", { isSidePending: true }), branch("c", { isSidePending: true })],
      { a: 50, b: 50, c: 50 },
    );

    expect(sidesOf(sides)).toEqual({ a: "right", b: "left", c: "right" });
  });

  it("places pending branches after decided ones even when they come first in the list", () => {
    const { sides } = resolve(
      [branch("p", { isSidePending: true }), branch("d", { state: { side: "left" } })],
      { p: 40, d: 100 },
    );

    expect(sidesOf(sides)).toEqual({ p: "right", d: "left" });
  });

  it("balances pending branches against the heights of decided stacks", () => {
    const { sides } = resolve(
      [branch("d1"), branch("d2"), branch("p", { isSidePending: true })],
      { d1: 100, d2: 100, p: 10 },
    );

    expect(sides.get("p")).toBe("left");
  });

  it("puts a pending branch on the right when right is exactly as tall as left after decided ones", () => {
    const { sides } = resolve(
      [branch("l", { state: { side: "left" } }), branch("r1"), branch("p", { isSidePending: true })],
      { l: 70, r1: 70, p: 10 },
    );

    expect(sides.get("p")).toBe("right");
  });

  it("reports side heights including the sibling gaps", () => {
    const { heights } = resolve(
      [branch("a"), branch("b"), branch("c", { state: { side: "left" } })],
      { a: 30, b: 40, c: 25 },
    );

    expect(heights).toEqual({ left: 25, right: 30 + GAP + 40 });
  });

  it("reports zero heights for a root without branches", () => {
    expect(resolve([], {}).heights).toEqual({ left: 0, right: 0 });
  });

  it("does not change the side of a decided branch when siblings grow", () => {
    const entries = [branch("a", { state: { side: "left" } }), branch("b")];

    const before = resolve(entries, { a: 20, b: 20 });
    const after = resolve(entries, { a: 20, b: 500 });

    expect(sidesOf(after.sides)).toEqual(sidesOf(before.sides));
  });
});
