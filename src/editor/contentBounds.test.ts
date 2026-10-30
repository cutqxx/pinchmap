import { describe, expect, it } from "vitest";
import type { LayoutResult } from "../layout";
import { contentBounds } from "./contentBounds";

function layoutAt(points: Record<string, { x: number; y: number }>): LayoutResult {
  return { positions: new Map(Object.entries(points)), sides: new Map(), sideHeights: new Map() };
}

describe("contentBounds", () => {
  it("returns null for an empty layout", () => {
    expect(contentBounds(layoutAt({}), new Map())).toBeNull();
  });

  it("returns the rect of a single node", () => {
    const bounds = contentBounds(layoutAt({ a: { x: 10, y: 20 } }), new Map([["a", { width: 100, height: 30 }]]));

    expect(bounds).toEqual({ left: 10, top: 20, right: 110, bottom: 50 });
  });

  it("returns the union of all node rects", () => {
    const layout = layoutAt({ a: { x: 0, y: 0 }, b: { x: 300, y: -50 }, c: { x: -80, y: 200 } });
    const sizes = new Map([
      ["a", { width: 100, height: 20 }],
      ["b", { width: 40, height: 10 }],
      ["c", { width: 60, height: 30 }],
    ]);

    expect(contentBounds(layout, sizes)).toEqual({ left: -80, top: -50, right: 340, bottom: 230 });
  });

  it("treats a node without a measured size as a zero-size point", () => {
    const layout = layoutAt({ a: { x: 0, y: 0 }, b: { x: 500, y: 400 } });

    const bounds = contentBounds(layout, new Map([["a", { width: 100, height: 20 }]]));

    expect(bounds).toEqual({ left: 0, top: 0, right: 500, bottom: 400 });
  });

  it("handles negative coordinates", () => {
    const bounds = contentBounds(layoutAt({ a: { x: -200, y: -100 } }), new Map([["a", { width: 50, height: 50 }]]));

    expect(bounds).toEqual({ left: -200, top: -100, right: -150, bottom: -50 });
  });
});
