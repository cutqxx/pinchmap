import { describe, expect, it } from "vitest";
import { advancePinch, involvesPointer, startPinch } from "./pinch";
import type { ScreenPoint } from "./pinch";

function touches(entries: Array<[number, ScreenPoint]>): Map<number, ScreenPoint> {
  return new Map(entries);
}

describe("startPinch", () => {
  it("returns null with fewer than two touches", () => {
    expect(startPinch(touches([[1, { x: 0, y: 0 }]]))).toBeNull();
    expect(startPinch(touches([]))).toBeNull();
  });

  it("measures the midpoint and distance of two touches", () => {
    const state = startPinch(touches([[1, { x: 0, y: 0 }], [2, { x: 30, y: 40 }]]));

    expect(state?.center).toEqual({ x: 15, y: 20 });
    expect(state?.distance).toBe(50);
    expect(state?.pointerIds).toEqual([1, 2]);
  });

  it("tracks only the first two touches when three are down", () => {
    const state = startPinch(
      touches([[1, { x: 0, y: 0 }], [2, { x: 10, y: 0 }], [3, { x: 500, y: 500 }]]),
    );

    expect(state?.pointerIds).toEqual([1, 2]);
  });
});

describe("involvesPointer", () => {
  it("is true only for the two pinching pointers", () => {
    const state = startPinch(touches([[1, { x: 0, y: 0 }], [2, { x: 10, y: 0 }]]));
    if (state === null) throw new Error("pinch expected");

    expect(involvesPointer(state, 1)).toBe(true);
    expect(involvesPointer(state, 2)).toBe(true);
    expect(involvesPointer(state, 3)).toBe(false);
  });
});

describe("advancePinch", () => {
  function startedPinch() {
    const points = touches([[1, { x: 100, y: 100 }], [2, { x: 200, y: 100 }]]);
    const state = startPinch(points);
    if (state === null) throw new Error("pinch expected");
    return { points, state };
  }

  it("reports scale greater than one when fingers move apart", () => {
    const { points, state } = startedPinch();
    points.set(2, { x: 300, y: 100 });

    const step = advancePinch(state, points);

    expect(step?.scaleDelta).toBe(2);
  });

  it("reports scale less than one when fingers move together", () => {
    const { points, state } = startedPinch();
    points.set(2, { x: 150, y: 100 });

    expect(advancePinch(state, points)?.scaleDelta).toBe(0.5);
  });

  it("reports the new center and how far it moved", () => {
    const { points, state } = startedPinch();
    points.set(1, { x: 110, y: 120 });
    points.set(2, { x: 210, y: 120 });

    const step = advancePinch(state, points);

    expect(step?.center).toEqual({ x: 160, y: 120 });
    expect(step?.centerDelta).toEqual({ x: 10, y: 20 });
    expect(step?.scaleDelta).toBe(1);
  });

  it("reports deltas relative to the previous step, not the start", () => {
    const { points, state } = startedPinch();
    points.set(2, { x: 300, y: 100 });
    advancePinch(state, points);
    points.set(2, { x: 500, y: 100 });

    const step = advancePinch(state, points);

    expect(step?.scaleDelta).toBe(2);
    expect(step?.centerDelta).toEqual({ x: 100, y: 0 });
  });

  it("returns null when nothing changed", () => {
    const { points, state } = startedPinch();

    expect(advancePinch(state, points)).toBeNull();
  });

  it("returns null when one of the pinching touches is gone", () => {
    const { points, state } = startedPinch();
    points.delete(2);

    expect(advancePinch(state, points)).toBeNull();
  });

  it("uses scale 1 when both fingers started at the same point", () => {
    const points = touches([[1, { x: 50, y: 50 }], [2, { x: 50, y: 50 }]]);
    const state = startPinch(points);
    if (state === null) throw new Error("pinch expected");
    points.set(2, { x: 80, y: 50 });

    const step = advancePinch(state, points);

    expect(step?.scaleDelta).toBe(1);
    expect(step?.centerDelta).toEqual({ x: 15, y: 0 });
  });
});
