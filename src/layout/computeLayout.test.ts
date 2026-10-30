import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { NodeEntry, NodeId } from "../model";
import { chooseSideForNewBranch, computeLayout } from "./computeLayout";
import type { LayoutResult } from "./computeLayout";
import type { LayoutSpacing } from "./computeLayout";
import type { Point, Size } from "./geometry";

const SPACING: LayoutSpacing = { levelGap: 40, siblingGap: 10, rootGap: 30 };

function fullLayout(entries: NodeEntry[], sizes: Record<NodeId, Size>): LayoutResult {
  return computeLayout(buildMindMap(entries), new Map(Object.entries(sizes)), SPACING);
}

function layout(entries: NodeEntry[], sizes: Record<NodeId, Size>): Map<NodeId, Point> {
  return new Map(fullLayout(entries, sizes).positions);
}

function pointOf(positions: Map<NodeId, Point>, id: NodeId): Point {
  const point = positions.get(id);
  if (point === undefined) throw new Error(`No position for ${id}`);
  return point;
}

const box = (width: number, height: number): Size => ({ width, height });

describe("computeLayout", () => {
  it("returns no positions for an empty map", () => {
    expect(layout([], {}).size).toBe(0);
  });

  it("places a lone root at the origin", () => {
    const positions = layout([{ id: "r", text: "", parentId: null }], { r: box(100, 20) });

    expect(pointOf(positions, "r")).toEqual({ x: 0, y: 0 });
  });

  it("places a child to the right of its parent separated by the level gap", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
      ],
      { r: box(100, 20), c: box(60, 20) },
    );

    expect(pointOf(positions, "c").x).toBe(140);
  });

  it("places grandchildren one level further right", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
        { id: "g", text: "", parentId: "c" },
      ],
      { r: box(100, 20), c: box(60, 20), g: box(10, 20) },
    );

    expect(pointOf(positions, "g").x).toBe(100 + 40 + 60 + 40);
  });

  it("stacks children of one parent in list order with the sibling gap", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
        { id: "c", text: "", parentId: "r" },
      ],
      { r: box(100, 20), a: box(50, 30), b: box(50, 40), c: box(50, 20) },
    );

    expect(pointOf(positions, "a").y).toBeLessThan(pointOf(positions, "b").y);
    expect(pointOf(positions, "b").y).toBeLessThan(pointOf(positions, "c").y);
    expect(pointOf(positions, "b").y - pointOf(positions, "a").y).toBe(30 + 10);
    expect(pointOf(positions, "c").y - pointOf(positions, "b").y).toBe(40 + 10);
  });

  it("keeps all children of a parent in one column", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
      ],
      { r: box(100, 20), a: box(50, 30), b: box(80, 30) },
    );

    expect(pointOf(positions, "a").x).toBe(pointOf(positions, "b").x);
  });

  it("centers the parent vertically against the block of its children", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
      ],
      { r: box(100, 20), a: box(50, 30), b: box(50, 50) },
    );

    const childrenTop = pointOf(positions, "a").y;
    const childrenBottom = pointOf(positions, "b").y + 50;
    const parentCenter = pointOf(positions, "r").y + 10;
    expect(parentCenter).toBe((childrenTop + childrenBottom) / 2);
  });

  it("centers a single child against its parent", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
      ],
      { r: box(100, 60), c: box(50, 20) },
    );

    expect(pointOf(positions, "c").y + 10).toBe(pointOf(positions, "r").y + 30);
  });

  it("does not let sibling subtrees overlap vertically when one has many descendants", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "a1", text: "", parentId: "a" },
        { id: "a2", text: "", parentId: "a" },
        { id: "a3", text: "", parentId: "a" },
        { id: "b", text: "", parentId: "r" },
      ],
      { r: box(50, 20), a: box(50, 20), a1: box(50, 40), a2: box(50, 40), a3: box(50, 40), b: box(50, 20) },
    );

    const lowestOfA = Math.max(...["a", "a1", "a2", "a3"].map((id) => pointOf(positions, id).y + (id === "a" ? 20 : 40)));
    expect(pointOf(positions, "b").y).toBeGreaterThanOrEqual(lowestOfA + 10);
  });

  it("places several roots one under another without overlap", () => {
    const positions = layout(
      [
        { id: "r1", text: "", parentId: null },
        { id: "c1", text: "", parentId: "r1" },
        { id: "c2", text: "", parentId: "r1" },
        { id: "r2", text: "", parentId: null },
      ],
      { r1: box(50, 20), c1: box(50, 40), c2: box(50, 40), r2: box(50, 20) },
    );

    const firstTreeBottom = Math.max(pointOf(positions, "c1").y + 40, pointOf(positions, "c2").y + 40, pointOf(positions, "r1").y + 20);
    expect(pointOf(positions, "r2").y).toBeGreaterThanOrEqual(firstTreeBottom + 30);
    expect(pointOf(positions, "r2").x).toBe(0);
  });

  it("gives every node a position", () => {
    const entries: NodeEntry[] = [
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r" },
      { id: "b", text: "", parentId: "a" },
      { id: "r2", text: "", parentId: null },
    ];

    expect([...layout(entries, {}).keys()].sort()).toEqual(["a", "b", "r", "r2"]);
  });

  it("treats nodes without a measured size as zero sized instead of failing", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "c", text: "", parentId: "r" },
      ],
      {},
    );

    expect(pointOf(positions, "c")).toEqual({ x: 40, y: 0 });
  });

  it("uses default spacing when none is given", () => {
    const map = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "c", text: "", parentId: "r" },
    ]);

    const { positions } = computeLayout(map, new Map([["r", box(100, 20)], ["c", box(10, 20)]]));

    expect(positions.get("c")?.x).toBeGreaterThan(100);
  });
});

describe("computeLayout branch sides", () => {
  const root: NodeEntry = { id: "r", text: "", parentId: null };
  const branch = (id: string, extra: Partial<NodeEntry> = {}): NodeEntry => ({ id, text: "", parentId: "r", ...extra });
  const pending = { isSidePending: true } as const;

  it("puts the first pending branch on the right", () => {
    const result = fullLayout([root, branch("a", pending)], { r: box(100, 20), a: box(50, 20) });

    expect(result.sides.get("a")).toBe("right");
  });

  it("puts the next pending branch on the left when the right side is taller", () => {
    const result = fullLayout([root, branch("a", pending), branch("b", pending)], {
      r: box(100, 20),
      a: box(50, 40),
      b: box(50, 20),
    });

    expect(result.sides.get("b")).toBe("left");
  });

  it("puts the next pending branch on the right when both sides are equally tall", () => {
    const result = fullLayout(
      [root, branch("a", pending), branch("b", pending), branch("c", pending)],
      { r: box(100, 20), a: box(50, 40), b: box(50, 40), c: box(50, 40) },
    );

    expect(result.sides.get("c")).toBe("right");
  });

  it("puts the next pending branch on the right when the left side is taller", () => {
    const result = fullLayout(
      [root, branch("l", { state: { side: "left" } }), branch("p", pending)],
      { r: box(100, 20), l: box(50, 80), p: box(50, 20) },
    );

    expect(result.sides.get("p")).toBe("right");
  });

  it("counts the height of descendants when comparing sides", () => {
    const result = fullLayout(
      [root, branch("a", pending), { id: "a1", text: "", parentId: "a" }, { id: "a2", text: "", parentId: "a" }, branch("b", pending)],
      { r: box(100, 20), a: box(50, 20), a1: box(50, 50), a2: box(50, 50), b: box(50, 20) },
    );

    expect(result.sides.get("b")).toBe("left");
  });

  it("keeps a branch with a written id and no record on the right", () => {
    const result = fullLayout([root, branch("a"), branch("b")], { r: box(100, 20), a: box(50, 200), b: box(50, 20) });

    expect(result.sides.get("a")).toBe("right");
    expect(result.sides.get("b")).toBe("right");
  });

  it("puts a branch with side left in its state on the left", () => {
    const result = fullLayout([root, branch("a", { state: { side: "left" } })], { r: box(100, 20), a: box(50, 20) });

    expect(result.sides.get("a")).toBe("left");
  });

  it("keeps a branch on the right when its state has an unrecognised side", () => {
    const result = fullLayout([root, branch("a", { state: { side: "up" } })], { r: box(100, 20), a: box(50, 20) });

    expect(result.sides.get("a")).toBe("right");
  });

  it("assigns pending branches by the rule after the decided ones, in list order", () => {
    const result = fullLayout(
      [root, branch("p1", pending), branch("p2", pending), branch("d", { state: { side: "left" } })],
      { r: box(100, 20), p1: box(50, 30), p2: box(50, 30), d: box(50, 100) },
    );

    expect(result.sides.get("p1")).toBe("right");
    expect(result.sides.get("p2")).toBe("right");
  });

  it("keeps decided sides when sibling branches grow or shrink", () => {
    const entries = [root, branch("a", { state: { side: "left" } }), branch("b")];
    const sizesFor = (bHeight: number): Record<string, Size> => ({ r: box(100, 20), a: box(50, 20), b: box(50, bHeight) });

    const small = fullLayout(entries, sizesFor(10));
    const large = fullLayout(entries, sizesFor(900));

    expect(large.sides.get("a")).toBe(small.sides.get("a"));
    expect(large.sides.get("b")).toBe(small.sides.get("b"));
  });

  it("does not assign sides to roots or to deeper nodes", () => {
    const result = fullLayout(
      [root, branch("a"), { id: "g", text: "", parentId: "a" }],
      { r: box(100, 20), a: box(50, 20), g: box(50, 20) },
    );

    expect([...result.sides.keys()]).toEqual(["a"]);
  });

  it("reports the stacked heights of both sides for every root", () => {
    const result = fullLayout(
      [root, branch("a"), branch("b"), branch("l", { state: { side: "left" } }), { id: "r2", text: "", parentId: null }],
      { r: box(100, 20), a: box(50, 30), b: box(50, 40), l: box(50, 25), r2: box(10, 10) },
    );

    expect(result.sideHeights.get("r")).toEqual({ left: 25, right: 80 });
    expect(result.sideHeights.get("r2")).toEqual({ left: 0, right: 0 });
  });
});

describe("chooseSideForNewBranch", () => {
  const entries: NodeEntry[] = [
    { id: "r", text: "", parentId: null },
    { id: "a", text: "", parentId: "r" },
    { id: "r2", text: "", parentId: null },
  ];

  it("chooses left for a root whose right side is taller", () => {
    const result = fullLayout(entries, { r: box(50, 20), a: box(50, 40), r2: box(50, 20) });

    expect(chooseSideForNewBranch(result, "r")).toBe("left");
  });

  it("chooses right for a root without branches", () => {
    const result = fullLayout(entries, { r: box(50, 20), a: box(50, 40), r2: box(50, 20) });

    expect(chooseSideForNewBranch(result, "r2")).toBe("right");
  });

  it("chooses right for an unknown root", () => {
    const result = fullLayout(entries, {});

    expect(chooseSideForNewBranch(result, "missing")).toBe("right");
  });
});

describe("computeLayout left side mirroring", () => {
  const entries: NodeEntry[] = [
    { id: "r", text: "", parentId: null },
    { id: "l", text: "", parentId: "r", state: { side: "left" } },
    { id: "l1", text: "", parentId: "l" },
    { id: "l2", text: "", parentId: "l1" },
    { id: "rt", text: "", parentId: "r" },
    { id: "rt1", text: "", parentId: "rt" },
  ];
  const sizes = { r: box(100, 20), l: box(60, 20), l1: box(30, 20), l2: box(20, 20), rt: box(60, 20), rt1: box(30, 20) };

  it("places a left branch to the left of the root separated by the level gap", () => {
    const positions = layout(entries, sizes);

    expect(pointOf(positions, "l").x + 60).toBe(pointOf(positions, "r").x - 40);
  });

  it("places children of a left branch to the left of their parent at every depth", () => {
    const positions = layout(entries, sizes);

    expect(pointOf(positions, "l1").x + 30).toBe(pointOf(positions, "l").x - 40);
    expect(pointOf(positions, "l2").x + 20).toBe(pointOf(positions, "l1").x - 40);
  });

  it("mirrors the right side horizontally for the same shapes", () => {
    const positions = layout(entries, sizes);

    expect(pointOf(positions, "rt").x).toBe(140);
    expect(pointOf(positions, "rt1").x).toBe(140 + 60 + 40);
    expect(pointOf(positions, "l").x).toBe(-40 - 60);
    expect(pointOf(positions, "l1").x).toBe(-40 - 60 - 40 - 30);
  });

  it("centers a left branch's children block on the branch", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "l", text: "", parentId: "r", state: { side: "left" } },
        { id: "a", text: "", parentId: "l" },
        { id: "b", text: "", parentId: "l" },
      ],
      { r: box(100, 20), l: box(60, 20), a: box(30, 30), b: box(30, 50) },
    );

    const blockCenter = (pointOf(positions, "a").y + pointOf(positions, "b").y + 50) / 2;
    expect(pointOf(positions, "l").y + 10).toBe(blockCenter);
  });

  it("centers the root on the taller of its two sides", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
        { id: "l", text: "", parentId: "r", state: { side: "left" } },
      ],
      { r: box(100, 20), a: box(50, 40), b: box(50, 40), l: box(50, 20) },
    );

    const rightTop = pointOf(positions, "a").y;
    const rightBottom = pointOf(positions, "b").y + 40;
    expect(pointOf(positions, "r").y + 10).toBe((rightTop + rightBottom) / 2);
  });

  it("centers a left stack on the root even when it is shorter than the right stack", () => {
    const positions = layout(
      [
        { id: "r", text: "", parentId: null },
        { id: "a", text: "", parentId: "r" },
        { id: "l", text: "", parentId: "r", state: { side: "left" } },
      ],
      { r: box(100, 20), a: box(50, 100), l: box(50, 20) },
    );

    expect(pointOf(positions, "l").y + 10).toBe(pointOf(positions, "r").y + 10);
  });
});

describe("computeLayout root positions", () => {
  const rootEntry = (id: string, state?: NodeEntry["state"]): NodeEntry => ({
    id,
    text: "",
    parentId: null,
    ...(state === undefined ? {} : { state }),
  });

  it("places a root with a saved position at exactly those absolute coordinates", () => {
    const positions = layout([rootEntry("r", { x: 250, y: -80 })], { r: box(100, 20) });

    expect(pointOf(positions, "r")).toEqual({ x: 250, y: -80 });
  });

  it("keeps the saved root position when the root has children on both sides", () => {
    const positions = layout(
      [
        rootEntry("r", { x: 250, y: -80 }),
        { id: "a", text: "", parentId: "r" },
        { id: "b", text: "", parentId: "r" },
        { id: "l", text: "", parentId: "r", state: { side: "left" } },
      ],
      { r: box(100, 20), a: box(50, 100), b: box(50, 100), l: box(50, 20) },
    );

    expect(pointOf(positions, "r")).toEqual({ x: 250, y: -80 });
  });

  it("places children relative to a positioned root", () => {
    const positions = layout(
      [rootEntry("r", { x: 250, y: 100 }), { id: "c", text: "", parentId: "r" }],
      { r: box(100, 20), c: box(60, 20) },
    );

    expect(pointOf(positions, "c")).toEqual({ x: 250 + 100 + 40, y: 100 });
  });

  it("places a root without a saved position below the bottom of every other tree plus the root gap", () => {
    const positions = layout(
      [
        rootEntry("r1", { x: 0, y: 0 }),
        { id: "c1", text: "", parentId: "r1" },
        { id: "c2", text: "", parentId: "r1" },
        rootEntry("r2", { x: 500, y: 300 }),
        rootEntry("free"),
      ],
      { r1: box(50, 20), c1: box(50, 100), c2: box(50, 100), r2: box(50, 20), free: box(50, 20) },
    );

    const r1Bottom = Math.max(pointOf(positions, "c2").y + 100, pointOf(positions, "r1").y + 20);
    const r2Bottom = pointOf(positions, "r2").y + 20;
    expect(pointOf(positions, "free").y).toBe(Math.max(r1Bottom, r2Bottom) + 30);
  });

  it("clears a positioned tree whose bottom is higher than a negative-coordinate sibling", () => {
    const positions = layout([rootEntry("a", { x: 0, y: -500 }), rootEntry("free")], { a: box(50, 20), free: box(50, 20) });

    expect(pointOf(positions, "free").y).toBe(-500 + 20 + 30);
  });

  it("stacks several unpositioned roots below each other starting at the top", () => {
    const positions = layout([rootEntry("a"), rootEntry("b"), rootEntry("c")], {
      a: box(50, 20),
      b: box(50, 40),
      c: box(50, 10),
    });

    expect(pointOf(positions, "a").y).toBe(0);
    expect(pointOf(positions, "b").y).toBe(20 + 30);
    expect(pointOf(positions, "c").y).toBe(20 + 30 + 40 + 30);
  });

  it("includes both sides of a tree when measuring where the next root starts", () => {
    const positions = layout(
      [
        rootEntry("a"),
        { id: "l1", text: "", parentId: "a", state: { side: "left" } },
        { id: "l2", text: "", parentId: "a", state: { side: "left" } },
        rootEntry("b"),
      ],
      { a: box(50, 20), l1: box(50, 60), l2: box(50, 60), b: box(50, 20) },
    );

    expect(pointOf(positions, "b").y).toBe(60 + 10 + 60 + 30);
  });

  it.each([
    ["string coordinates", { x: "10", y: "20" }],
    ["null coordinates", { x: null, y: null }],
    ["only x", { x: 10 }],
    ["only y", { y: 10 }],
    ["NaN", { x: Number.NaN, y: 0 }],
    ["Infinity", { x: 0, y: Number.POSITIVE_INFINITY }],
    ["negative Infinity", { x: Number.NEGATIVE_INFINITY, y: 0 }],
  ])("ignores a root position with %s and stacks the root below the others", (_label, state) => {
    const positions = layout([rootEntry("first"), rootEntry("bad", state)], { first: box(50, 20), bad: box(50, 20) });

    expect(pointOf(positions, "bad")).toEqual({ x: 0, y: 50 });
  });

  it("ignores the root position of a root whose position is invalid even when another root is positioned", () => {
    const positions = layout(
      [rootEntry("fixed", { x: 300, y: 40 }), rootEntry("bad", { x: "a", y: 1 })],
      { fixed: box(50, 20), bad: box(50, 20) },
    );

    expect(pointOf(positions, "fixed")).toEqual({ x: 300, y: 40 });
    expect(pointOf(positions, "bad")).toEqual({ x: 0, y: 40 + 20 + 30 });
  });
});

interface Rect {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMap(random: () => number): { entries: NodeEntry[]; sizes: Record<NodeId, Size> } {
  const entries: NodeEntry[] = [];
  const sizes: Record<NodeId, Size> = {};
  const pick = (max: number): number => Math.floor(random() * max);
  const add = (parentId: NodeId | null, depth: number): void => {
    const id = `n${entries.length}`;
    const isBranch = depth === 1;
    const isLeft = isBranch && random() < 0.4;
    const isPending = isBranch && !isLeft && random() < 0.4;
    entries.push({
      id,
      text: "",
      parentId,
      ...(isLeft ? { state: { side: "left" } } : {}),
      ...(isPending ? { isSidePending: true } : {}),
    });
    sizes[id] = box(10 + pick(190), 5 + pick(120));
    const childCount = depth >= 3 ? 0 : pick(4);
    for (let index = 0; index < childCount; index += 1) add(id, depth + 1);
  };
  const rootCount = 1 + pick(4);
  for (let index = 0; index < rootCount; index += 1) add(null, 0);
  return { entries, sizes };
}

function rectsOf(result: LayoutResult, sizes: Record<NodeId, Size>): Rect[] {
  return [...result.positions].map(([id, point]) => {
    const size = sizes[id] ?? box(0, 0);
    return { id, left: point.x, top: point.y, right: point.x + size.width, bottom: point.y + size.height };
  });
}

function overlappingPairs(rects: Rect[]): string[] {
  const pairs: string[] = [];
  rects.forEach((first, index) => {
    for (const second of rects.slice(index + 1)) {
      const overlapsHorizontally = first.left < second.right && second.left < first.right;
      const overlapsVertically = first.top < second.bottom && second.top < first.bottom;
      if (overlapsHorizontally && overlapsVertically) pairs.push(`${first.id}/${second.id}`);
    }
  });
  return pairs;
}

describe("computeLayout over generated trees", () => {
  const seeds = Array.from({ length: 200 }, (_, index) => index + 1);

  it.each(seeds)("never overlaps two nodes, whatever the sizes and sides (seed %i)", (seed) => {
    const { entries, sizes } = generateMap(seededRandom(seed));
    const map = buildMindMap(entries);

    const result = computeLayout(map, new Map(Object.entries(sizes)), SPACING);

    expect(overlappingPairs(rectsOf(result, sizes))).toEqual([]);
  });

  it.each(seeds)("keeps the level gap between a node and its children on the correct side (seed %i)", (seed) => {
    const { entries, sizes } = generateMap(seededRandom(seed));
    const map = buildMindMap(entries);

    const result = computeLayout(map, new Map(Object.entries(sizes)), SPACING);

    for (const entry of entries) {
      if (entry.parentId === null) continue;
      const parent = result.positions.get(entry.parentId);
      const child = result.positions.get(entry.id);
      const parentWidth = sizes[entry.parentId]?.width ?? 0;
      const childWidth = sizes[entry.id]?.width ?? 0;
      if (parent === undefined || child === undefined) throw new Error("missing position");
      const side = result.sides.get(entry.id) ?? inheritedSide(entry, entries, result);
      if (side === "right") expect(child.x).toBe(parent.x + parentWidth + SPACING.levelGap);
      else expect(child.x + childWidth).toBe(parent.x - SPACING.levelGap);
    }
  });

  it.each(seeds)("centers every parent of leaf children on the block of those children (seed %i)", (seed) => {
    const { entries, sizes } = generateMap(seededRandom(seed));
    const result = computeLayout(buildMindMap(entries), new Map(Object.entries(sizes)), SPACING);

    for (const entry of entries) {
      const children = entries.filter((candidate) => candidate.parentId === entry.id);
      const isRoot = entry.parentId === null;
      const hasOnlyLeafChildren = children.every((child) => entries.every((candidate) => candidate.parentId !== child.id));
      if (children.length === 0 || isRoot || !hasOnlyLeafChildren) continue;
      const rects = rectsOf(result, sizes);
      const childRects = children.map((child) => rects.find((rect) => rect.id === child.id));
      const top = Math.min(...childRects.map((rect) => rect?.top ?? 0));
      const bottom = Math.max(...childRects.map((rect) => rect?.bottom ?? 0));
      const parentRect = rects.find((rect) => rect.id === entry.id);
      const parentCenter = ((parentRect?.top ?? 0) + (parentRect?.bottom ?? 0)) / 2;
      const blockHeight = bottom - top;
      const parentHeight = (parentRect?.bottom ?? 0) - (parentRect?.top ?? 0);
      if (blockHeight >= parentHeight) expect(parentCenter).toBeCloseTo((top + bottom) / 2, 6);
    }
  });
});

function inheritedSide(entry: NodeEntry, entries: NodeEntry[], result: LayoutResult): "left" | "right" {
  const parent = entries.find((candidate) => candidate.id === entry.parentId);
  if (parent === undefined) return "right";
  return result.sides.get(parent.id) ?? inheritedSide(parent, entries, result);
}
