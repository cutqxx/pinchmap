import { describe, expect, it } from "vitest";
import { MultiFingerTap } from "./multiFingerTap";

const THRESHOLD_PX = 8;
const WINDOW_MS = 300;

function newTap(): MultiFingerTap {
  return new MultiFingerTap(THRESHOLD_PX, WINDOW_MS);
}

function fingersDown(tap: MultiFingerTap, count: number, time = 0): void {
  tap.startWith(1, { x: 100, y: 100 }, time);
  for (let id = 2; id <= count; id++) tap.addFinger(id, { x: 100 + id * 50, y: 100 }, time);
}

describe("MultiFingerTap result by finger count", () => {
  it("reports undo for a quick two-finger tap", () => {
    const tap = newTap();
    fingersDown(tap, 2);

    expect(tap.finishWhenLastFingerLifts(100)).toBe("undo");
  });

  it("reports redo for a quick three-finger tap", () => {
    const tap = newTap();
    fingersDown(tap, 3);

    expect(tap.finishWhenLastFingerLifts(100)).toBe("redo");
  });

  it("reports nothing for a single finger", () => {
    const tap = newTap();
    fingersDown(tap, 1);

    expect(tap.finishWhenLastFingerLifts(100)).toBeNull();
  });

  it("reports nothing for four fingers", () => {
    const tap = newTap();
    fingersDown(tap, 4);

    expect(tap.finishWhenLastFingerLifts(100)).toBeNull();
  });

  it("counts a finger once when the same pointer is added twice", () => {
    const tap = newTap();
    fingersDown(tap, 2);
    tap.addFinger(2, { x: 150, y: 100 }, 10);

    expect(tap.finishWhenLastFingerLifts(100)).toBe("undo");
  });
});

describe("MultiFingerTap time window", () => {
  it("accepts a tap lifted exactly 300 ms after the first finger touched down (inclusive limit)", () => {
    const tap = newTap();
    fingersDown(tap, 2, 1000);

    expect(tap.finishWhenLastFingerLifts(1300)).toBe("undo");
  });

  it("rejects a tap lifted 301 ms after the first finger touched down", () => {
    const tap = newTap();
    fingersDown(tap, 2, 1000);

    expect(tap.finishWhenLastFingerLifts(1301)).toBeNull();
  });

  it("rejects a tap whose second finger arrives after the window", () => {
    const tap = newTap();
    tap.startWith(1, { x: 0, y: 0 }, 0);
    tap.addFinger(2, { x: 50, y: 0 }, 301);

    expect(tap.finishWhenLastFingerLifts(310)).toBeNull();
  });

  it("accepts a second finger arriving exactly at the window limit", () => {
    const tap = newTap();
    tap.startWith(1, { x: 0, y: 0 }, 0);
    tap.addFinger(2, { x: 50, y: 0 }, 300);

    expect(tap.finishWhenLastFingerLifts(300)).toBe("undo");
  });
});

describe("MultiFingerTap movement", () => {
  it("accepts a finger that moved exactly 8 px", () => {
    const tap = newTap();
    fingersDown(tap, 2);

    tap.move(1, { x: 108, y: 100 });

    expect(tap.finishWhenLastFingerLifts(100)).toBe("undo");
  });

  it("rejects a finger that moved more than 8 px from where it touched down", () => {
    const tap = newTap();
    fingersDown(tap, 2);

    tap.move(2, { x: 150, y: 109 });

    expect(tap.finishWhenLastFingerLifts(100)).toBeNull();
  });

  it("measures movement from the touch-down point, not the previous move", () => {
    const tap = newTap();
    fingersDown(tap, 2);

    tap.move(1, { x: 105, y: 100 });
    tap.move(1, { x: 110, y: 100 });

    expect(tap.finishWhenLastFingerLifts(100)).toBeNull();
  });

  it("ignores moves of unknown pointers", () => {
    const tap = newTap();
    fingersDown(tap, 2);

    tap.move(99, { x: 900, y: 900 });

    expect(tap.finishWhenLastFingerLifts(100)).toBe("undo");
  });
});

describe("MultiFingerTap invalidation and reset", () => {
  it("reports nothing after invalidate", () => {
    const tap = newTap();
    fingersDown(tap, 2);

    tap.invalidate();

    expect(tap.finishWhenLastFingerLifts(100)).toBeNull();
  });

  it("reports nothing after reset", () => {
    const tap = newTap();
    fingersDown(tap, 2);

    tap.reset();

    expect(tap.finishWhenLastFingerLifts(100)).toBeNull();
  });

  it("starts a fresh valid session after an invalidated one finished", () => {
    const tap = newTap();
    fingersDown(tap, 2);
    tap.invalidate();
    tap.finishWhenLastFingerLifts(100);

    fingersDown(tap, 3, 1000);

    expect(tap.finishWhenLastFingerLifts(1100)).toBe("redo");
  });

  it("reports nothing when finishing without a session", () => {
    expect(newTap().finishWhenLastFingerLifts(100)).toBeNull();
  });

  it("reports a result only once per session", () => {
    const tap = newTap();
    fingersDown(tap, 2);
    tap.finishWhenLastFingerLifts(100);

    expect(tap.finishWhenLastFingerLifts(110)).toBeNull();
  });
});

describe("MultiFingerTap without an active session", () => {
  it("ignores a finger added before any session started", () => {
    const tap = newTap();
    tap.addFinger(2, { x: 150, y: 100 }, 0);

    expect(tap.finishWhenLastFingerLifts(100)).toBeNull();
  });
});
