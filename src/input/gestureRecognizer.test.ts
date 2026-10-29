import { describe, expect, it } from "vitest";
import { GestureRecognizer } from "./gestureRecognizer";
import type { HitTarget, Intent, PointerSample } from "./gestureRecognizer";

const CANVAS: HitTarget = { kind: "canvas" };
const NODE_A: HitTarget = { kind: "node", nodeId: "a" };
const NODE_B: HitTarget = { kind: "node", nodeId: "b" };

function sample(overrides: Partial<PointerSample>): PointerSample {
  return {
    phase: "down",
    pointerId: 1,
    kind: "touch",
    x: 100,
    y: 100,
    time: 0,
    button: 0,
    target: CANVAS,
    ...overrides,
  };
}

function feed(recognizer: GestureRecognizer, samples: PointerSample[]): Intent[] {
  return samples.flatMap((s) => [...recognizer.handle(s)]);
}

function tap(
  recognizer: GestureRecognizer,
  at: Partial<PointerSample> = {},
): Intent[] {
  return feed(recognizer, [
    sample({ ...at, phase: "down" }),
    sample({ ...at, phase: "up", time: (at.time ?? 0) + 50 }),
  ]);
}

describe("GestureRecognizer tap", () => {
  it("reports a tap on a node after press and release in place", () => {
    expect(tap(new GestureRecognizer(), { target: NODE_A })).toEqual([{ type: "tap", target: NODE_A }]);
  });

  it("reports a tap on the canvas", () => {
    expect(tap(new GestureRecognizer())).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("reports nothing while the pointer is still down", () => {
    const recognizer = new GestureRecognizer();

    expect(recognizer.handle(sample({ phase: "down" }))).toEqual([]);
    expect(recognizer.handle(sample({ phase: "move", x: 101 }))).toEqual([]);
  });

  it("reports a tap for a mouse left click", () => {
    expect(tap(new GestureRecognizer(), { kind: "mouse", button: 0, target: NODE_A })).toEqual([
      { type: "tap", target: NODE_A },
    ]);
  });

  it("ignores the right mouse button", () => {
    expect(tap(new GestureRecognizer(), { kind: "mouse", button: 2 })).toEqual([]);
  });

  it("still reports a tap when the pointer moves within the drag threshold", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down" }),
      sample({ phase: "move", x: 108, y: 100 }),
      sample({ phase: "up", x: 108, y: 100, time: 50 }),
    ]);

    expect(intents).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("reports no tap once the pointer moved beyond the drag threshold", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down" }),
      sample({ phase: "move", x: 109, y: 100 }),
      sample({ phase: "up", x: 109, y: 100, time: 50 }),
    ]);

    expect(intents).toEqual([]);
  });

  it("does not turn a drag back into a tap when the pointer returns to the start", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down" }),
      sample({ phase: "move", x: 200 }),
      sample({ phase: "move", x: 100 }),
      sample({ phase: "up", x: 100, time: 50 }),
    ]);

    expect(intents).toEqual([]);
  });

  it("reports no tap when the gesture is cancelled", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [sample({ phase: "down" }), sample({ phase: "cancel" }), sample({ phase: "up" })]);

    expect(intents).toEqual([]);
  });

  it("reports no tap when a second finger joins the gesture", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down", pointerId: 1 }),
      sample({ phase: "down", pointerId: 2, x: 140 }),
      sample({ phase: "up", pointerId: 2, x: 140, time: 50 }),
      sample({ phase: "up", pointerId: 1, time: 60 }),
    ]);

    expect(intents).toEqual([]);
  });

  it("reports taps again after a multi-touch gesture ended", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [
      sample({ phase: "down", pointerId: 1 }),
      sample({ phase: "down", pointerId: 2 }),
      sample({ phase: "up", pointerId: 2 }),
      sample({ phase: "up", pointerId: 1 }),
    ]);

    expect(tap(recognizer, { pointerId: 3, time: 5000 })).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("ignores movement of a pointer other than the tapping one", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down", pointerId: 1 }),
      sample({ phase: "move", pointerId: 9, x: 500 }),
      sample({ phase: "up", pointerId: 1, time: 50 }),
    ]);

    expect(intents).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("reports the node under the pointer at press time", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down", target: NODE_A }),
      sample({ phase: "up", target: NODE_B, time: 50 }),
    ]);

    expect(intents).toEqual([{ type: "tap", target: NODE_A }]);
  });
});

describe("GestureRecognizer doubleTap", () => {
  it("reports a double tap when two taps come quickly at the same place", () => {
    const recognizer = new GestureRecognizer();

    const intents = [
      ...tap(recognizer, { target: NODE_A, time: 0 }),
      ...tap(recognizer, { target: NODE_A, time: 200 }),
    ];

    expect(intents).toEqual([
      { type: "tap", target: NODE_A },
      { type: "doubleTap", target: NODE_A },
    ]);
  });

  it("reports a double tap for two quick mouse clicks", () => {
    const recognizer = new GestureRecognizer();
    const click = (time: number): Intent[] => tap(recognizer, { kind: "mouse", target: NODE_A, time });

    expect([...click(0), ...click(150)].map((i) => i.type)).toEqual(["tap", "doubleTap"]);
  });

  it("reports a double tap on the canvas with a canvas target", () => {
    const recognizer = new GestureRecognizer();

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 100 })];

    expect(intents[1]).toEqual({ type: "doubleTap", target: CANVAS });
  });

  it("reports two single taps when the second comes after the interval", () => {
    const recognizer = new GestureRecognizer();

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 1000 })];

    expect(intents.map((i) => i.type)).toEqual(["tap", "tap"]);
  });

  it("reports two single taps when the second is too far from the first", () => {
    const recognizer = new GestureRecognizer();

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 100, x: 300 })];

    expect(intents.map((i) => i.type)).toEqual(["tap", "tap"]);
  });

  it("does not chain a third quick tap into another double tap", () => {
    const recognizer = new GestureRecognizer();

    const intents = [
      ...tap(recognizer, { time: 0 }),
      ...tap(recognizer, { time: 100 }),
      ...tap(recognizer, { time: 200 }),
    ];

    expect(intents.map((i) => i.type)).toEqual(["tap", "doubleTap", "tap"]);
  });

  it("forgets the first tap when a gesture is cancelled in between", () => {
    const recognizer = new GestureRecognizer();
    tap(recognizer, { time: 0 });
    recognizer.handle(sample({ phase: "down", time: 50 }));
    recognizer.handle(sample({ phase: "cancel", time: 60 }));

    const intents = tap(recognizer, { time: 100 });

    expect(intents.map((i) => i.type)).toEqual(["tap"]);
  });

  it("honours a custom double tap interval", () => {
    const recognizer = new GestureRecognizer({ dragThresholdPx: 8, doubleTapIntervalMs: 50, doubleTapDistancePx: 24 });

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 200 })];

    expect(intents.map((i) => i.type)).toEqual(["tap", "tap"]);
  });
});

describe("GestureRecognizer double tap after interrupted gestures", () => {
  it("reports tap, tap when a drag lies between two quick taps", () => {
    const recognizer = new GestureRecognizer();
    const first = tap(recognizer, { time: 0 });
    const drag = feed(recognizer, [
      sample({ phase: "down", time: 100 }),
      sample({ phase: "move", time: 120, x: 100 + 9 }),
      sample({ phase: "up", time: 140, x: 100 + 9 }),
    ]);
    const last = tap(recognizer, { time: 200 });

    expect([...first, ...drag, ...last].map((i) => i.type)).toEqual(["tap", "tap"]);
  });

  it("reports no double tap when a second pointer went down between two quick taps", () => {
    const recognizer = new GestureRecognizer();
    const first = tap(recognizer, { time: 0 });
    feed(recognizer, [
      sample({ phase: "down", pointerId: 1, time: 100 }),
      sample({ phase: "down", pointerId: 2, time: 110 }),
      sample({ phase: "up", pointerId: 2, time: 120 }),
      sample({ phase: "up", pointerId: 1, time: 130 }),
    ]);
    const last = tap(recognizer, { time: 200 });

    expect([...first, ...last].map((i) => i.type)).toEqual(["tap", "tap"]);
  });
});

describe("GestureRecognizer double tap boundaries", () => {
  it("counts the interval as inclusive: a second tap exactly 300 ms after the first is a double tap", () => {
    const recognizer = new GestureRecognizer();

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 300 })];

    expect(intents.map((i) => i.type)).toEqual(["tap", "doubleTap"]);
  });

  it("a second tap 301 ms after the first is not a double tap", () => {
    const recognizer = new GestureRecognizer();

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 301 })];

    expect(intents.map((i) => i.type)).toEqual(["tap", "tap"]);
  });

  it("counts the distance as inclusive: a second tap exactly 24 px away is a double tap", () => {
    const recognizer = new GestureRecognizer();

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 100, x: 124 })];

    expect(intents.map((i) => i.type)).toEqual(["tap", "doubleTap"]);
  });

  it("a second tap just over 24 px away is not a double tap", () => {
    const recognizer = new GestureRecognizer();

    const intents = [...tap(recognizer, { time: 0 }), ...tap(recognizer, { time: 100, x: 125 })];

    expect(intents.map((i) => i.type)).toEqual(["tap", "tap"]);
  });
});
