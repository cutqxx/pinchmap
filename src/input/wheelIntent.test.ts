import { describe, expect, it } from "vitest";
import { wheelToIntent } from "./wheelIntent";
import type { WheelSample } from "./gestureRecognizer";

function wheel(overrides: Partial<WheelSample>): WheelSample {
  return {
    x: 100,
    y: 50,
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  };
}

function expectHorizontalOnlyPan(intent: ReturnType<typeof wheelToIntent>, dx: number): void {
  if (intent?.type !== "wheelPan") throw new Error("wheelPan expected");
  expect(intent.dx).toBe(dx);
  expect(intent.dy + 0).toBe(0);
}

describe("wheelToIntent zoom", () => {
  it("zooms in at the cursor when Ctrl is held and the wheel scrolls up", () => {
    const intent = wheelToIntent(wheel({ ctrlKey: true, deltaY: -100 }));

    expect(intent?.type).toBe("wheelZoom");
    if (intent?.type !== "wheelZoom") return;
    expect(intent.center).toEqual({ x: 100, y: 50 });
    expect(intent.scaleDelta).toBeGreaterThan(1);
  });

  it("zooms out when Ctrl is held and the wheel scrolls down", () => {
    const intent = wheelToIntent(wheel({ ctrlKey: true, deltaY: 100 }));

    expect(intent?.type === "wheelZoom" && intent.scaleDelta).toBeLessThan(1);
  });

  it("zooms with Cmd the same way as with Ctrl", () => {
    const withCtrl = wheelToIntent(wheel({ ctrlKey: true, deltaY: -40 }));
    const withMeta = wheelToIntent(wheel({ metaKey: true, deltaY: -40 }));

    expect(withMeta).toEqual(withCtrl);
    expect(withMeta?.type).toBe("wheelZoom");
  });

  it("zooms by a larger factor for a larger wheel delta", () => {
    const small = wheelToIntent(wheel({ ctrlKey: true, deltaY: -10 }));
    const large = wheelToIntent(wheel({ ctrlKey: true, deltaY: -100 }));

    const scale = (i: typeof small) => (i?.type === "wheelZoom" ? i.scaleDelta : NaN);
    expect(scale(large)).toBeGreaterThan(scale(small));
  });

  it("makes opposite deltas cancel out", () => {
    const up = wheelToIntent(wheel({ ctrlKey: true, deltaY: -80 }));
    const down = wheelToIntent(wheel({ ctrlKey: true, deltaY: 80 }));

    if (up?.type !== "wheelZoom" || down?.type !== "wheelZoom") throw new Error("zoom expected");
    expect(up.scaleDelta * down.scaleDelta).toBeCloseTo(1, 10);
  });

  it("produces no intent for a zero vertical delta with Ctrl held", () => {
    expect(wheelToIntent(wheel({ ctrlKey: true, deltaY: 0, deltaX: 30 }))).toBeNull();
  });

  it("zooms rather than panning horizontally when Ctrl and Shift are both held", () => {
    expect(wheelToIntent(wheel({ ctrlKey: true, shiftKey: true, deltaY: -50 }))?.type).toBe("wheelZoom");
  });
});

describe("wheelToIntent pan", () => {
  it("moves the canvas opposite to the wheel delta", () => {
    expect(wheelToIntent(wheel({ deltaX: 10, deltaY: 30 }))).toEqual({ type: "wheelPan", dx: -10, dy: -30 });
  });

  it("supports two-finger trackpad diagonal scrolling", () => {
    expect(wheelToIntent(wheel({ deltaX: -7, deltaY: 4 }))).toEqual({ type: "wheelPan", dx: 7, dy: -4 });
  });

  it("produces no intent when both deltas are zero", () => {
    expect(wheelToIntent(wheel({}))).toBeNull();
  });

  it("pans horizontally with Shift and no vertical movement", () => {
    expectHorizontalOnlyPan(wheelToIntent(wheel({ shiftKey: true, deltaY: 40 })), -40);
  });

  it("uses deltaX with Shift when the platform already swapped the axes", () => {
    expectHorizontalOnlyPan(wheelToIntent(wheel({ shiftKey: true, deltaX: 25, deltaY: 0 })), -25);
  });

  it("prefers deltaX over deltaY with Shift when deltaX is non-zero", () => {
    expectHorizontalOnlyPan(wheelToIntent(wheel({ shiftKey: true, deltaX: 25, deltaY: 40 })), -25);
  });

  it("produces no intent with Shift when both deltas are zero", () => {
    expect(wheelToIntent(wheel({ shiftKey: true }))).toBeNull();
  });
});
