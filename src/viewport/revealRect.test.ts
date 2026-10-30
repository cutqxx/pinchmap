import { describe, expect, it } from "vitest";
import { intersectRects, panDeltaToReveal } from "./revealRect";
import type { Rect } from "./revealRect";

const MARGIN = 8;
const VISIBLE: Rect = { left: 0, top: 0, right: 800, bottom: 600 };

function rect(left: number, top: number, right: number, bottom: number): Rect {
  return { left, top, right, bottom };
}

describe("panDeltaToReveal", () => {
  it("does not pan when the node is well inside the visible area", () => {
    expect(panDeltaToReveal(rect(100, 100, 200, 120), VISIBLE, MARGIN)).toEqual({ x: 0, y: 0 });
  });

  it("does not pan when the node exactly touches the margin on every side", () => {
    expect(panDeltaToReveal(rect(8, 8, 792, 592), VISIBLE, MARGIN)).toEqual({ x: 0, y: 0 });
  });

  it("pans up by the minimal amount when the node is below the visible area", () => {
    expect(panDeltaToReveal(rect(100, 590, 200, 610), VISIBLE, MARGIN)).toEqual({ x: 0, y: -18 });
  });

  it("pans up when the node lies fully below the visible area", () => {
    expect(panDeltaToReveal(rect(100, 700, 200, 720), VISIBLE, MARGIN)).toEqual({ x: 0, y: -128 });
  });

  it("pans down by the minimal amount when the node is above the visible area", () => {
    expect(panDeltaToReveal(rect(100, -20, 200, 0), VISIBLE, MARGIN)).toEqual({ x: 0, y: 28 });
  });

  it("pans left by the minimal amount when the node is right of the visible area", () => {
    expect(panDeltaToReveal(rect(700, 100, 810, 120), VISIBLE, MARGIN)).toEqual({ x: -18, y: 0 });
  });

  it("pans right by the minimal amount when the node is left of the visible area", () => {
    expect(panDeltaToReveal(rect(-50, 100, 50, 120), VISIBLE, MARGIN)).toEqual({ x: 58, y: 0 });
  });

  it("pans on both axes when the node is outside in both", () => {
    expect(panDeltaToReveal(rect(790, 595, 850, 615), VISIBLE, MARGIN)).toEqual({ x: -58, y: -23 });
  });

  it("measures the margin from a visible area that does not start at the origin", () => {
    const visible = rect(100, 200, 500, 400);

    expect(panDeltaToReveal(rect(120, 395, 200, 415), visible, MARGIN)).toEqual({ x: 0, y: -23 });
  });

  it("aligns the top when the node is taller than the visible area", () => {
    expect(panDeltaToReveal(rect(100, 100, 200, 800), VISIBLE, MARGIN)).toEqual({ x: 0, y: -92 });
  });

  it("aligns the left when the node is wider than the visible area", () => {
    expect(panDeltaToReveal(rect(-100, 100, 1000, 120), VISIBLE, MARGIN)).toEqual({ x: 108, y: 0 });
  });

  it("aligns the top when the node is taller than the visible area even if it starts above it", () => {
    expect(panDeltaToReveal(rect(100, -300, 200, 900), VISIBLE, MARGIN)).toEqual({ x: 0, y: 308 });
  });

  it("treats a node that fits only without the margin as larger than the visible area", () => {
    expect(panDeltaToReveal(rect(0, 0, 100, 600), VISIBLE, MARGIN)).toEqual({ x: 8, y: 8 });
  });
});

describe("panDeltaToReveal overflowAlign", () => {
  const taller = rect(100, 100, 200, 800);
  const wider = rect(-100, 100, 1000, 120);

  it("aligns the bottom edge of a taller node with end", () => {
    expect(panDeltaToReveal(taller, VISIBLE, MARGIN, { overflowAlign: "end" })).toEqual({ x: 0, y: -208 });
  });

  it("aligns the top edge of a taller node with start", () => {
    expect(panDeltaToReveal(taller, VISIBLE, MARGIN, { overflowAlign: "start" })).toEqual({ x: 0, y: -92 });
  });

  it("aligns the right edge of a wider node with end", () => {
    expect(panDeltaToReveal(wider, VISIBLE, MARGIN, { overflowAlign: "end" })).toEqual({ x: -208, y: 0 });
  });

  it("aligns the left edge of a wider node with start", () => {
    expect(panDeltaToReveal(wider, VISIBLE, MARGIN, { overflowAlign: "start" })).toEqual({ x: 108, y: 0 });
  });

  it("defaults to start when no options are given", () => {
    expect(panDeltaToReveal(taller, VISIBLE, MARGIN)).toEqual(
      panDeltaToReveal(taller, VISIBLE, MARGIN, { overflowAlign: "start" }),
    );
  });

  it.each([
    ["below", rect(100, 590, 200, 610), { x: 0, y: -18 }],
    ["above", rect(100, -20, 200, 0), { x: 0, y: 28 }],
    ["right of", rect(700, 100, 810, 120), { x: -18, y: 0 }],
    ["inside", rect(100, 100, 200, 120), { x: 0, y: 0 }],
  ])("gives the same result for both values when the node fits and is %s the area", (_name, node, expected) => {
    expect(panDeltaToReveal(node, VISIBLE, MARGIN, { overflowAlign: "end" })).toEqual(expected);
    expect(panDeltaToReveal(node, VISIBLE, MARGIN, { overflowAlign: "start" })).toEqual(expected);
  });
});

describe("intersectRects", () => {
  it("returns the overlapping part of two rects", () => {
    expect(intersectRects(rect(0, 0, 100, 100), rect(50, 20, 150, 80))).toEqual(rect(50, 20, 100, 80));
  });

  it("returns the inner rect when one contains the other", () => {
    expect(intersectRects(rect(0, 0, 100, 100), rect(10, 10, 20, 20))).toEqual(rect(10, 10, 20, 20));
  });

  it("returns an inverted rect when the rects do not overlap", () => {
    const result = intersectRects(rect(0, 0, 10, 10), rect(50, 60, 70, 80));

    expect(result.left).toBeGreaterThan(result.right);
    expect(result.top).toBeGreaterThan(result.bottom);
  });
});
