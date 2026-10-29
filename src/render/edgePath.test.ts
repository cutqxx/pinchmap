import { describe, expect, it } from "vitest";
import { edgePath } from "./edgePath";

describe("edgePath", () => {
  it("builds a cubic curve from start to end with horizontal tangents", () => {
    expect(edgePath({ x: 0, y: 0 }, { x: 100, y: 50 })).toBe("M 0 0 C 50 0, 50 50, 100 50");
  });

  it("starts at the start point and ends at the end point", () => {
    const path = edgePath({ x: 10, y: 20 }, { x: 70, y: -40 });

    expect(path.startsWith("M 10 20 ")).toBe(true);
    expect(path.endsWith(", 70 -40")).toBe(true);
  });

  it("draws a straight horizontal line when both points share the same y", () => {
    expect(edgePath({ x: 0, y: 5 }, { x: 40, y: 5 })).toBe("M 0 5 C 20 5, 20 5, 40 5");
  });

  it("handles an end point to the left of the start point", () => {
    expect(edgePath({ x: 100, y: 0 }, { x: 0, y: 10 })).toBe("M 100 0 C 50 0, 50 10, 0 10");
  });
});
