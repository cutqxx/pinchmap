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

function tapsOnly(intents: Intent[]): Intent[] {
  return intents.filter((intent) => intent.type === "tap" || intent.type === "doubleTap");
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

    expect(tapsOnly(intents)).toEqual([]);
  });

  it("does not turn a drag back into a tap when the pointer returns to the start", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down" }),
      sample({ phase: "move", x: 200 }),
      sample({ phase: "move", x: 100 }),
      sample({ phase: "up", x: 100, time: 50 }),
    ]);

    expect(tapsOnly(intents)).toEqual([]);
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

    expect(tapsOnly(intents)).toEqual([]);
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
      { type: "doubleTap", target: NODE_A, point: { x: 100, y: 100 } },
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

    expect(intents[1]).toEqual({ type: "doubleTap", target: CANVAS, point: { x: 100, y: 100 } });
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

    expect(tapsOnly([...first, ...drag, ...last]).map((i) => i.type)).toEqual(["tap", "tap"]);
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

function pans(intents: Intent[]): Extract<Intent, { type: "pan" }>[] {
  return intents.filter((intent): intent is Extract<Intent, { type: "pan" }> => intent.type === "pan");
}

function pinches(intents: Intent[]): Extract<Intent, { type: "pinch" }>[] {
  return intents.filter((intent): intent is Extract<Intent, { type: "pinch" }> => intent.type === "pinch");
}

const GESTURE_END: Intent = { type: "gestureEnd" };

describe("GestureRecognizer one-finger pan", () => {
  it("does not pan while the finger stays within the 8 px threshold", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down" }),
      sample({ phase: "move", x: 104, y: 104 }),
      sample({ phase: "move", x: 108, y: 100 }),
    ]);

    expect(intents).toEqual([]);
  });

  it("starts panning once the finger passes the threshold", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 109, y: 100 })]);

    expect(pans(intents)).toHaveLength(1);
  });

  it("includes the distance covered before the threshold in the first pan so the canvas does not jump", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down" }),
      sample({ phase: "move", x: 105, y: 102 }),
      sample({ phase: "move", x: 112, y: 106 }),
    ]);

    expect(intents).toEqual([{ type: "pan", dx: 12, dy: 6 }]);
  });

  it("pans by the incremental delta after the first pan", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 120, y: 100 })]);

    const intents = feed(recognizer, [sample({ phase: "move", x: 125, y: 90 })]);

    expect(intents).toEqual([{ type: "pan", dx: 5, dy: -10 }]);
  });

  it("keeps panning when the finger comes back within the threshold after the pan started", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 130, y: 100 })]);

    const intents = feed(recognizer, [sample({ phase: "move", x: 102, y: 100 })]);

    expect(intents).toEqual([{ type: "pan", dx: -28, dy: 0 }]);
  });

  it("ends the gesture on release after panning and reports no tap", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 150, y: 100 })]);

    const intents = feed(recognizer, [sample({ phase: "up", x: 150, y: 100, time: 80 })]);

    expect(intents).toEqual([GESTURE_END]);
  });

  it("does not end a gesture on release when the finger never passed the threshold", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down" }),
      sample({ phase: "move", x: 104, y: 100 }),
      sample({ phase: "up", x: 104, y: 100, time: 50 }),
    ]);

    expect(intents).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("pans for a pen the same way as for a finger", () => {
    // domPointerSource maps every non-mouse pointerType (touch, pen) to kind "touch".
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down", kind: "touch" }),
      sample({ phase: "move", x: 120, y: 100, kind: "touch" }),
    ]);

    expect(intents).toEqual([{ type: "pan", dx: 20, dy: 0 }]);
  });

  it("does not pan when the drag starts on a node", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down", target: NODE_A }),
      sample({ phase: "move", x: 200, y: 200, target: NODE_A }),
      sample({ phase: "up", x: 200, y: 200, target: NODE_A, time: 100 }),
    ]);

    expect(intents).toEqual([]);
  });
});

describe("GestureRecognizer mouse pan", () => {
  const mouse = { kind: "mouse" } as const;

  it("does not pan on a left-button drag over the canvas", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 0 }),
      sample({ ...mouse, phase: "move", x: 300, y: 300 }),
      sample({ ...mouse, phase: "up", x: 300, y: 300, time: 100 }),
    ]);

    expect(intents).toEqual([]);
  });

  it("pans immediately on a middle-button drag without waiting for the threshold", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 1 }),
      sample({ ...mouse, phase: "move", x: 101, y: 100 }),
    ]);

    expect(intents).toEqual([{ type: "pan", dx: 1, dy: 0 }]);
  });

  it("ends the gesture when the middle button is released and reports no tap", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 1 }),
      sample({ ...mouse, phase: "move", x: 101, y: 100 }),
    ]);

    const intents = feed(recognizer, [sample({ ...mouse, phase: "up", button: 1, x: 101, time: 50 })]);

    expect(intents).toEqual([GESTURE_END]);
  });

  it("pans immediately on a left-button drag while Space is held", () => {
    const recognizer = new GestureRecognizer();
    recognizer.setSpaceHeld(true);

    const intents = feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 0 }),
      sample({ ...mouse, phase: "move", x: 102, y: 101 }),
    ]);

    expect(intents).toEqual([{ type: "pan", dx: 2, dy: 1 }]);
  });

  it("still reports a tap for Space plus a left click with no movement", () => {
    const recognizer = new GestureRecognizer();
    recognizer.setSpaceHeld(true);

    const intents = feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 0, target: NODE_A }),
      sample({ ...mouse, phase: "up", button: 0, time: 50 }),
    ]);

    expect(intents).toEqual([{ type: "tap", target: NODE_A }]);
  });

  it("does not pan on a right-button drag", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 2 }),
      sample({ ...mouse, phase: "move", x: 300, y: 300 }),
    ]);

    expect(intents).toEqual([]);
  });

  it("stops treating a left drag as a pan after Space is released before the next press", () => {
    const recognizer = new GestureRecognizer();
    recognizer.setSpaceHeld(true);
    recognizer.setSpaceHeld(false);

    const intents = feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 0 }),
      sample({ ...mouse, phase: "move", x: 300, y: 300 }),
    ]);

    expect(intents).toEqual([]);
  });

  it("does not start a pan when Space is pressed after the left button went down", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ ...mouse, phase: "down", button: 0 })]);
    recognizer.setSpaceHeld(true);

    const intents = feed(recognizer, [sample({ ...mouse, phase: "move", x: 300, y: 300 })]);

    expect(intents).toEqual([]);
  });

  it("keeps panning when Space is released in the middle of a Space drag", () => {
    const recognizer = new GestureRecognizer();
    recognizer.setSpaceHeld(true);
    feed(recognizer, [
      sample({ ...mouse, phase: "down", button: 0 }),
      sample({ ...mouse, phase: "move", x: 110, y: 100 }),
    ]);
    recognizer.setSpaceHeld(false);

    const intents = feed(recognizer, [sample({ ...mouse, phase: "move", x: 115, y: 100 })]);

    expect(intents).toEqual([{ type: "pan", dx: 5, dy: 0 }]);
  });
});

describe("GestureRecognizer two-finger pinch", () => {
  function twoFingersDown(recognizer: GestureRecognizer): Intent[] {
    return feed(recognizer, [
      sample({ phase: "down", pointerId: 1, x: 100, y: 100 }),
      sample({ phase: "down", pointerId: 2, x: 200, y: 100 }),
    ]);
  }

  it("reports nothing when the second finger lands", () => {
    expect(twoFingersDown(new GestureRecognizer())).toEqual([]);
  });

  it("reports scale growth, center and zero center delta when the fingers spread symmetrically", () => {
    const recognizer = new GestureRecognizer();
    twoFingersDown(recognizer);

    const intents = feed(recognizer, [
      sample({ phase: "move", pointerId: 2, x: 300, y: 100 }),
      sample({ phase: "move", pointerId: 1, x: 0, y: 100 }),
    ]);

    const allPinches = pinches(intents);
    const last = allPinches[allPinches.length - 1];
    expect(last?.center).toEqual({ x: 150, y: 100 });
    expect(last?.scaleDelta).toBeCloseTo(300 / 200, 10);
  });

  it("reports the center and the center delta when one finger moves", () => {
    const recognizer = new GestureRecognizer();
    twoFingersDown(recognizer);

    const intents = feed(recognizer, [sample({ phase: "move", pointerId: 2, x: 300, y: 100 })]);

    expect(intents).toEqual([
      { type: "pinch", center: { x: 200, y: 100 }, centerDelta: { x: 50, y: 0 }, scaleDelta: 2 },
    ]);
  });

  it("reports scale below one when the fingers come together", () => {
    const recognizer = new GestureRecognizer();
    twoFingersDown(recognizer);

    const intents = feed(recognizer, [sample({ phase: "move", pointerId: 2, x: 150, y: 100 })]);

    expect(pinches(intents)[0]?.scaleDelta).toBe(0.5);
  });

  it("reports a pure two-finger drag as center movement with unchanged scale", () => {
    const recognizer = new GestureRecognizer();
    twoFingersDown(recognizer);

    const intents = feed(recognizer, [
      sample({ phase: "move", pointerId: 1, x: 110, y: 120 }),
      sample({ phase: "move", pointerId: 2, x: 210, y: 120 }),
    ]);

    const totalScale = pinches(intents).reduce((product, p) => product * p.scaleDelta, 1);
    expect(totalScale).toBeCloseTo(1, 10);
    const totalDelta = pinches(intents).reduce((sum, p) => sum + p.centerDelta.y, 0);
    expect(totalDelta).toBe(20);
  });

  it("does not emit one-finger pans while pinching", () => {
    const recognizer = new GestureRecognizer();
    twoFingersDown(recognizer);

    const intents = feed(recognizer, [sample({ phase: "move", pointerId: 1, x: 150, y: 150 })]);

    expect(pans(intents)).toEqual([]);
  });

  it("ends the gesture when a finger lifts and leaves the remaining finger inert", () => {
    const recognizer = new GestureRecognizer();
    twoFingersDown(recognizer);
    feed(recognizer, [sample({ phase: "move", pointerId: 2, x: 300, y: 100 })]);

    const lifted = feed(recognizer, [sample({ phase: "up", pointerId: 2, x: 300, y: 100, time: 100 })]);
    const afterwards = feed(recognizer, [sample({ phase: "move", pointerId: 1, x: 300, y: 300 })]);

    expect(lifted).toEqual([GESTURE_END]);
    expect(afterwards).toEqual([]);
  });

  it("produces no taps for a pinch with movement and release of both fingers", () => {
    const recognizer = new GestureRecognizer();
    const intents = [
      ...twoFingersDown(recognizer),
      ...feed(recognizer, [
        sample({ phase: "move", pointerId: 2, x: 300, y: 100 }),
        sample({ phase: "up", pointerId: 2, x: 300, y: 100, time: 100 }),
        sample({ phase: "up", pointerId: 1, x: 100, y: 100, time: 110 }),
      ]),
    ];

    expect(tapsOnly(intents)).toEqual([]);
  });

  it("hands an in-progress pan over to a pinch without ending the gesture", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down", pointerId: 1 }), sample({ phase: "move", pointerId: 1, x: 150 })]);

    const intents = feed(recognizer, [sample({ phase: "down", pointerId: 2, x: 250, y: 100 })]);

    expect(intents).toEqual([]);
    const pinching = feed(recognizer, [sample({ phase: "move", pointerId: 2, x: 350, y: 100 })]);
    expect(pinches(pinching)).toHaveLength(1);
  });

  it("starts a fresh gesture for a new touch after the pinch fully ended", () => {
    const recognizer = new GestureRecognizer();
    twoFingersDown(recognizer);
    feed(recognizer, [
      sample({ phase: "up", pointerId: 2, x: 200, y: 100, time: 100 }),
      sample({ phase: "up", pointerId: 1, x: 100, y: 100, time: 110 }),
    ]);

    const intents = feed(recognizer, [
      sample({ phase: "down", pointerId: 3, time: 1000 }),
      sample({ phase: "move", pointerId: 3, x: 120, y: 100, time: 1010 }),
    ]);

    expect(intents).toEqual([{ type: "pan", dx: 20, dy: 0 }]);
  });
});

describe("GestureRecognizer pointercancel", () => {
  it("ends the gesture when a pan is cancelled", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 150 })]);

    expect(feed(recognizer, [sample({ phase: "cancel", x: 150 })])).toEqual([GESTURE_END]);
  });

  it("reports nothing when a drag that never became a pan is cancelled", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" })]);

    expect(feed(recognizer, [sample({ phase: "cancel" })])).toEqual([]);
  });

  it("ends the gesture when a pinch finger is cancelled", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [
      sample({ phase: "down", pointerId: 1, x: 100 }),
      sample({ phase: "down", pointerId: 2, x: 200 }),
    ]);

    expect(feed(recognizer, [sample({ phase: "cancel", pointerId: 2, x: 200 })])).toEqual([GESTURE_END]);
  });

  it("does not continue the cancelled pan on later moves of the same pointer", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 150 }), sample({ phase: "cancel", x: 150 })]);

    expect(feed(recognizer, [sample({ phase: "move", x: 300 })])).toEqual([]);
  });

  it("measures the threshold of the next drag from its own start, not from the cancelled one", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 150 }), sample({ phase: "cancel", x: 150 })]);

    const intents = feed(recognizer, [
      sample({ phase: "down", x: 400, y: 400, time: 1000 }),
      sample({ phase: "move", x: 405, y: 400, time: 1010 }),
      sample({ phase: "move", x: 412, y: 400, time: 1020 }),
    ]);

    expect(intents).toEqual([{ type: "pan", dx: 12, dy: 0 }]);
  });

  it("ends a middle-button pan when it is cancelled", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [
      sample({ kind: "mouse", phase: "down", button: 1 }),
      sample({ kind: "mouse", phase: "move", x: 110 }),
    ]);

    expect(feed(recognizer, [sample({ kind: "mouse", phase: "cancel", button: 1 })])).toEqual([GESTURE_END]);
  });
});

describe("GestureRecognizer lost pointer events", () => {
  const mouse = { kind: "mouse" } as const;

  it("treats a new mouse press after a lost pointerup as a fresh press, not a second pointer", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ ...mouse, phase: "down", time: 0 })]);

    const intents = feed(recognizer, [
      sample({ ...mouse, phase: "down", time: 1000 }),
      sample({ ...mouse, phase: "up", time: 1050 }),
    ]);

    expect(intents).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("emits gestureEnd and then behaves fresh when a pointer is pressed again during a pan", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 150 })]);

    const repress = feed(recognizer, [sample({ phase: "down", x: 400, y: 400, time: 1000 })]);
    const afterwards = feed(recognizer, [
      sample({ phase: "move", x: 405, y: 400, time: 1010 }),
      sample({ phase: "move", x: 412, y: 400, time: 1020 }),
    ]);

    expect(repress).toEqual([GESTURE_END]);
    expect(afterwards).toEqual([{ type: "pan", dx: 12, dy: 0 }]);
  });

  it("ignores a cancel for a pointer that is not active", () => {
    const recognizer = new GestureRecognizer();

    expect(feed(recognizer, [sample({ phase: "cancel", pointerId: 9 })])).toEqual([]);
  });

  it("does not disturb an active pan when a cancel arrives for an unknown pointer", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [sample({ phase: "down" }), sample({ phase: "move", x: 150 })]);

    const intents = feed(recognizer, [
      sample({ phase: "cancel", pointerId: 9 }),
      sample({ phase: "move", x: 160 }),
    ]);

    expect(intents).toEqual([{ type: "pan", dx: 10, dy: 0 }]);
  });

  it("still reports a double tap when a cancel arrives after each pointerup", () => {
    const recognizer = new GestureRecognizer();

    const intents = [0, 100].flatMap((time) =>
      feed(recognizer, [
        sample({ ...mouse, phase: "down", time }),
        sample({ ...mouse, phase: "up", time: time + 30 }),
        sample({ ...mouse, phase: "cancel", time: time + 31 }),
      ]),
    );

    expect(intents.map((intent) => intent.type)).toEqual(["tap", "doubleTap"]);
  });
});

describe("GestureRecognizer wheel", () => {
  it("turns a wheel sample into a wheel pan intent", () => {
    const recognizer = new GestureRecognizer();

    const intents = recognizer.handleWheel({
      x: 5,
      y: 5,
      deltaX: 0,
      deltaY: 20,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ type: "wheelPan", dy: -20 });
  });

  it("returns no intents for an empty wheel sample", () => {
    const recognizer = new GestureRecognizer();

    expect(
      recognizer.handleWheel({ x: 5, y: 5, deltaX: 0, deltaY: 0, ctrlKey: false, metaKey: false, shiftKey: false }),
    ).toEqual([]);
  });
});

describe("GestureRecognizer plus button targets", () => {
  const ADD_CHILD: HitTarget = { kind: "add-child", nodeId: "a" };
  const ADD_SIBLING: HitTarget = { kind: "add-sibling", nodeId: "a" };

  it.each([ADD_CHILD, ADD_SIBLING])("reports a tap on the $kind button with its target", (target) => {
    expect(tap(new GestureRecognizer(), { target })).toEqual([{ type: "tap", target }]);
  });

  it("reports a mouse click on a plus button as a tap with its target", () => {
    expect(tap(new GestureRecognizer(), { kind: "mouse", target: ADD_CHILD })).toEqual([
      { type: "tap", target: ADD_CHILD },
    ]);
  });

  it("counts a quick second tap on a plus button as a double tap carrying the button target", () => {
    const recognizer = new GestureRecognizer();

    const intents = [
      ...tap(recognizer, { target: ADD_SIBLING, time: 0 }),
      ...tap(recognizer, { target: ADD_SIBLING, time: 150 }),
    ];

    expect(intents).toEqual([
      { type: "tap", target: ADD_SIBLING },
      { type: "doubleTap", target: ADD_SIBLING, point: { x: 100, y: 100 } },
    ]);
  });

  it("does not pan the camera when a finger drags from a plus button", () => {
    const recognizer = new GestureRecognizer();

    const intents = feed(recognizer, [
      sample({ phase: "down", target: ADD_CHILD }),
      sample({ phase: "move", x: 140, target: ADD_CHILD }),
      sample({ phase: "up", x: 140, target: ADD_CHILD }),
    ]);

    expect(intents).toEqual([]);
  });
});

describe("GestureRecognizer multi-finger tap", () => {
  const finger = (pointerId: number, phase: PointerSample["phase"], time: number, overrides: Partial<PointerSample> = {}) =>
    sample({ phase, pointerId, time, x: 100 + pointerId * 60, y: 100, ...overrides });

  function fingersDown(count: number, time = 0, overrides: Partial<PointerSample> = {}): PointerSample[] {
    return Array.from({ length: count }, (_, index) => finger(index + 1, "down", time, overrides));
  }

  function fingersUp(count: number, time: number, overrides: Partial<PointerSample> = {}): PointerSample[] {
    return Array.from({ length: count }, (_, index) => finger(index + 1, "up", time, overrides));
  }

  function undoOrRedo(intents: Intent[]): Intent[] {
    return intents.filter((intent) => intent.type === "undo" || intent.type === "redo");
  }

  function selectionIntents(intents: Intent[]): Intent[] {
    return intents.filter((i) => i.type === "tap" || i.type === "doubleTap" || i.type === "longPress");
  }

  it("reports undo for a quick two-finger tap", () => {
    const intents = feed(new GestureRecognizer(), [...fingersDown(2), ...fingersUp(2, 100)]);

    expect(undoOrRedo(intents)).toEqual([{ type: "undo" }]);
  });

  it("reports redo for a quick three-finger tap", () => {
    const intents = feed(new GestureRecognizer(), [...fingersDown(3), ...fingersUp(3, 100)]);

    expect(undoOrRedo(intents)).toEqual([{ type: "redo" }]);
  });

  it("reports undo only when the last finger lifts", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, fingersDown(2));

    const afterFirstLift = feed(recognizer, [finger(1, "up", 90)]);
    const afterLastLift = feed(recognizer, [finger(2, "up", 100)]);

    expect([undoOrRedo(afterFirstLift), undoOrRedo(afterLastLift)]).toEqual([[], [{ type: "undo" }]]);
  });

  it("reports undo again for a second two-finger tap", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2, 0),
      ...fingersUp(2, 100),
      ...fingersDown(2, 1000),
      ...fingersUp(2, 1100),
    ]);

    expect(undoOrRedo(intents)).toEqual([{ type: "undo" }, { type: "undo" }]);
  });

  it("reports nothing when the last finger lifts 301 ms after the first touched down", () => {
    const intents = feed(new GestureRecognizer(), [...fingersDown(2, 0), ...fingersUp(2, 301)]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("accepts a tap lasting exactly 300 ms because the multi-finger limit is inclusive", () => {
    const intents = feed(new GestureRecognizer(), [...fingersDown(2, 0), ...fingersUp(2, 300)]);

    expect(undoOrRedo(intents)).toEqual([{ type: "undo" }]);
  });

  it("honours a custom multiFingerTapMs", () => {
    const recognizer = new GestureRecognizer({
      dragThresholdPx: 8,
      doubleTapIntervalMs: 300,
      doubleTapDistancePx: 24,
      multiFingerTapMs: 100,
    });

    const intents = feed(recognizer, [...fingersDown(2, 0), ...fingersUp(2, 150)]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  // The third finger does not take part in the pinch, so only the 8 px movement rule applies to it.
  it("reports redo when the third finger drifts exactly 8 px", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(3),
      finger(3, "move", 50, { x: 280 + 8, y: 100 }),
      ...fingersUp(3, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([{ type: "redo" }]);
  });

  it("reports nothing when the third finger moved over 8 px", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(3),
      finger(3, "move", 50, { x: 280 + 9, y: 100 }),
      ...fingersUp(3, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("reports undo for a two-finger tap with 1-3 px jitter on both fingers", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2),
      finger(1, "move", 20, { x: 160 + 2, y: 100 + 1 }),
      finger(2, "move", 30, { x: 220 - 3, y: 100 }),
      finger(1, "move", 40, { x: 160 - 1, y: 100 + 2 }),
      ...fingersUp(2, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([{ type: "undo" }]);
  });

  it("reports undo when one finger drifts exactly 8 px", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2),
      finger(2, "move", 50, { x: 220 + 8, y: 100 }),
      ...fingersUp(2, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([{ type: "undo" }]);
  });

  it("reports nothing when one finger drifts 9 px", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2),
      finger(2, "move", 50, { x: 220 + 9, y: 100 }),
      ...fingersUp(2, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("reports nothing when a finger exceeds 8 px and then returns to its origin", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2),
      finger(1, "move", 30, { x: 160 + 9, y: 100 }),
      finger(1, "move", 60, { x: 160, y: 100 }),
      ...fingersUp(2, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("reports redo for a three-finger tap with jitter on every finger", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(3),
      finger(1, "move", 20, { x: 160 + 2, y: 100 - 2 }),
      finger(2, "move", 30, { x: 220 - 1, y: 100 + 3 }),
      finger(3, "move", 40, { x: 280 + 3, y: 100 + 1 }),
      ...fingersUp(3, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([{ type: "redo" }]);
  });

  it("reports nothing after a two-finger pan", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2),
      finger(1, "move", 40, { x: 160 + 30, y: 130 }),
      finger(2, "move", 50, { x: 220 + 30, y: 130 }),
      ...fingersUp(2, 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("still reports the two-finger pan movement as pinch intents", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, fingersDown(2));

    const intents = feed(recognizer, [
      finger(1, "move", 40, { x: 160 + 30, y: 100 }),
      finger(2, "move", 50, { x: 220 + 30, y: 100 }),
    ]);

    expect(intents.filter((intent) => intent.type === "pinch").length).toBeGreaterThan(0);
  });

  it("reports nothing when a fourth finger joins", () => {
    const intents = feed(new GestureRecognizer(), [...fingersDown(4), ...fingersUp(4, 100)]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("reports nothing when a fourth finger joins after three", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, fingersDown(3));

    const intents = feed(recognizer, [finger(4, "down", 50), ...fingersUp(4, 100)]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("reports nothing after a pointercancel", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2),
      finger(1, "cancel", 50),
      finger(2, "up", 100),
    ]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("reports nothing when a mouse pointer is mixed in with a finger", () => {
    const intents = feed(new GestureRecognizer(), [
      finger(1, "down", 0),
      finger(2, "down", 0, { kind: "mouse" }),
      finger(1, "up", 100),
      finger(2, "up", 100, { kind: "mouse" }),
    ]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("reports nothing when a mouse pointer was down first", () => {
    const intents = feed(new GestureRecognizer(), [
      finger(1, "down", 0, { kind: "mouse" }),
      finger(2, "down", 0),
      finger(3, "down", 0),
      ...fingersUp(3, 100).map((up, index) => (index === 0 ? { ...up, kind: "mouse" as const } : up)),
    ]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("emits no tap, doubleTap or longPress for a two-finger tap on nodes", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(2, 0, { target: NODE_A }),
      ...fingersUp(2, 100, { target: NODE_A }),
    ]);

    expect(selectionIntents(intents)).toEqual([]);
    expect(undoOrRedo(intents)).toEqual([{ type: "undo" }]);
  });

  it("emits no tap or doubleTap for a three-finger tap on the canvas, even repeated quickly", () => {
    const intents = feed(new GestureRecognizer(), [
      ...fingersDown(3, 0),
      ...fingersUp(3, 80),
      ...fingersDown(3, 150),
      ...fingersUp(3, 230),
    ]);

    expect(selectionIntents(intents)).toEqual([]);
    expect(undoOrRedo(intents)).toEqual([{ type: "redo" }, { type: "redo" }]);
  });

  it("does not turn a single-finger tap into undo or redo", () => {
    const intents = feed(new GestureRecognizer(), [...fingersDown(1), ...fingersUp(1, 100)]);

    expect(undoOrRedo(intents)).toEqual([]);
  });

  it("starts a clean session after a failed multi-finger gesture", () => {
    const recognizer = new GestureRecognizer();
    feed(recognizer, [...fingersDown(2, 0), ...fingersUp(2, 500)]);

    const intents = feed(recognizer, [...fingersDown(2, 1000), ...fingersUp(2, 1100)]);

    expect(undoOrRedo(intents)).toEqual([{ type: "undo" }]);
  });
});
