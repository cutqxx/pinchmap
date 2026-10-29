import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureRecognizer } from "./gestureRecognizer";
import type { HitTarget, Intent, PointerSample } from "./gestureRecognizer";

const CANVAS: HitTarget = { kind: "canvas" };
const NODE_A: HitTarget = { kind: "node", nodeId: "a" };
const ADD_CHILD: HitTarget = { kind: "add-child", nodeId: "a" };

let emitted: Intent[];
let recognizer: GestureRecognizer;

beforeEach(() => {
  vi.useFakeTimers();
  emitted = [];
  recognizer = newRecognizer();
});

afterEach(() => {
  vi.useRealTimers();
});

function newRecognizer(longPressMs?: number): GestureRecognizer {
  const config = { dragThresholdPx: 8, doubleTapIntervalMs: 300, doubleTapDistancePx: 24, longPressMs };
  return new GestureRecognizer(config, (intent) => emitted.push(intent));
}

function sample(overrides: Partial<PointerSample>): PointerSample {
  return { phase: "down", pointerId: 1, kind: "touch", x: 100, y: 100, time: 0, button: 0, target: CANVAS, ...overrides };
}

function press(overrides: Partial<PointerSample> = {}): Intent[] {
  return [...recognizer.handle(sample({ ...overrides, phase: "down" }))];
}

function move(overrides: Partial<PointerSample>): Intent[] {
  return [...recognizer.handle(sample({ ...overrides, phase: "move" }))];
}

function release(overrides: Partial<PointerSample> = {}): Intent[] {
  return [...recognizer.handle(sample({ ...overrides, phase: "up", time: 700 }))];
}

function longPresses(): Intent[] {
  return emitted.filter((intent) => intent.type === "longPress");
}

describe("long press on empty canvas", () => {
  it("emits longPress with the canvas target and press point after the default 500 ms", () => {
    press({ x: 120, y: 80 });

    vi.advanceTimersByTime(500);

    expect(emitted).toEqual([{ type: "longPress", target: CANVAS, point: { x: 120, y: 80 } }]);
  });

  it("emits nothing one millisecond before the default duration", () => {
    press();

    vi.advanceTimersByTime(499);

    expect(emitted).toEqual([]);
  });

  it("emits longPress exactly once however long the finger stays down", () => {
    press();

    vi.advanceTimersByTime(5000);

    expect(longPresses()).toHaveLength(1);
  });

  it("honors a duration given in the gesture config", () => {
    recognizer = newRecognizer(800);
    press();

    vi.advanceTimersByTime(799);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(longPresses()).toHaveLength(1);
  });

  it("emits no longPress when the finger lifts before the duration", () => {
    press();
    vi.advanceTimersByTime(499);

    release();
    vi.advanceTimersByTime(5000);

    expect(longPresses()).toEqual([]);
  });

  it("still reports a tap when the finger lifts before the duration", () => {
    press();
    vi.advanceTimersByTime(300);

    expect(release()).toEqual([{ type: "tap", target: CANVAS }]);
  });
});

describe("long press cancellation", () => {
  it("is cancelled by a move farther than 8 px", () => {
    press();

    move({ x: 109, y: 100 });
    vi.advanceTimersByTime(1000);

    expect(longPresses()).toEqual([]);
  });

  it("is cancelled by a diagonal move whose distance exceeds 8 px", () => {
    press();

    move({ x: 106, y: 106 });
    vi.advanceTimersByTime(1000);

    expect(longPresses()).toEqual([]);
  });

  it("survives a move of exactly 8 px", () => {
    press();

    move({ x: 108, y: 100 });
    vi.advanceTimersByTime(500);

    expect(longPresses()).toHaveLength(1);
  });

  it("survives jitter inside 8 px", () => {
    press();

    move({ x: 103, y: 99 });
    move({ x: 98, y: 104 });
    vi.advanceTimersByTime(500);

    expect(longPresses()).toHaveLength(1);
  });

  it("is cancelled when the finger drifts far and comes back", () => {
    press();

    move({ x: 130 });
    move({ x: 100 });
    vi.advanceTimersByTime(1000);

    expect(longPresses()).toEqual([]);
  });

  it("is cancelled by a second pointer going down", () => {
    press();

    press({ pointerId: 2, x: 200, y: 200 });
    vi.advanceTimersByTime(1000);

    expect(longPresses()).toEqual([]);
  });

  it("is cancelled by pointercancel", () => {
    press();

    recognizer.handle(sample({ phase: "cancel" }));
    vi.advanceTimersByTime(1000);

    expect(longPresses()).toEqual([]);
  });

  it("does not fire a stale timer from an earlier press during the next press", () => {
    press();
    vi.advanceTimersByTime(300);
    release();

    press({ time: 1000 });
    vi.advanceTimersByTime(300);

    expect(longPresses()).toEqual([]);
  });
});

describe("gestures after a long press", () => {
  it("reports no tap when the finger lifts after the long press fired", () => {
    press();
    vi.advanceTimersByTime(500);

    expect(release()).toEqual([]);
  });

  it("reports no pan when the finger moves after the long press fired", () => {
    press();
    vi.advanceTimersByTime(500);

    expect(move({ x: 160, y: 140 })).toEqual([]);
  });

  it("does not turn the next quick tap into a double tap", () => {
    press();
    vi.advanceTimersByTime(500);
    release();

    press();
    const afterTap = release();

    expect(afterTap).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("allows a new long press after the previous one ended", () => {
    press();
    vi.advanceTimersByTime(500);
    release();

    press({ x: 30, y: 40 });
    vi.advanceTimersByTime(500);

    expect(longPresses()).toEqual([
      { type: "longPress", target: CANVAS, point: { x: 100, y: 100 } },
      { type: "longPress", target: CANVAS, point: { x: 30, y: 40 } },
    ]);
  });
});

describe("setLongPressMs", () => {
  it("lengthens the duration of the next press", () => {
    recognizer.setLongPressMs(1000);
    press();

    vi.advanceTimersByTime(999);
    expect(longPresses()).toEqual([]);
    vi.advanceTimersByTime(1);

    expect(longPresses()).toHaveLength(1);
  });

  it("shortens the duration of the next press", () => {
    recognizer.setLongPressMs(200);
    press();

    vi.advanceTimersByTime(200);

    expect(longPresses()).toHaveLength(1);
  });

  it("takes effect between two presses on the same recognizer", () => {
    press();
    vi.advanceTimersByTime(500);
    release();
    emitted.length = 0;

    recognizer.setLongPressMs(300);
    press();
    vi.advanceTimersByTime(300);

    expect(longPresses()).toHaveLength(1);
  });
});

describe("long press eligibility", () => {
  it("starts no timer for a press on a node", () => {
    press({ target: NODE_A });

    vi.advanceTimersByTime(5000);

    expect(emitted).toEqual([]);
  });

  it("starts no timer for a press on a plus button", () => {
    press({ target: ADD_CHILD });

    vi.advanceTimersByTime(5000);

    expect(emitted).toEqual([]);
  });

  it("starts no timer for a mouse press on the canvas", () => {
    press({ kind: "mouse" });

    vi.advanceTimersByTime(5000);

    expect(emitted).toEqual([]);
  });

  it("starts no timer for a right mouse button press", () => {
    press({ kind: "mouse", button: 2 });

    vi.advanceTimersByTime(5000);

    expect(emitted).toEqual([]);
  });
});

describe("handleContextMenu", () => {
  it("turns a context menu sample into a contextMenu intent with the point and target", () => {
    expect(recognizer.handleContextMenu({ x: 12, y: 34, target: CANVAS })).toEqual([
      { type: "contextMenu", target: CANVAS, point: { x: 12, y: 34 } },
    ]);
  });

  it("carries a node target through unchanged", () => {
    expect(recognizer.handleContextMenu({ x: 1, y: 2, target: NODE_A })).toEqual([
      { type: "contextMenu", target: NODE_A, point: { x: 1, y: 2 } },
    ]);
  });
});

describe("dispose", () => {
  it("emits no longPress and leaves no timer behind when disposed during a press", () => {
    press();

    recognizer.dispose();
    vi.advanceTimersByTime(1000);

    expect(longPresses()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("forgets a previous tap so the next tap is not a double tap", () => {
    press({ time: 0 });
    release({ time: 50 });

    recognizer.dispose();
    press({ time: 100 });
    const intents = release({ time: 150 });

    expect(intents).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("starts a fresh long press on a press made after disposal", () => {
    press();
    recognizer.dispose();

    press();
    vi.advanceTimersByTime(500);

    expect(longPresses()).toHaveLength(1);
  });

  it("forgets active pointers so a lone press is not treated as a multi-touch", () => {
    press({ pointerId: 1 });
    recognizer.dispose();

    press({ pointerId: 2 });
    vi.advanceTimersByTime(500);

    expect(longPresses()).toHaveLength(1);
  });
});
