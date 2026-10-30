import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureRecognizer } from "./gestureRecognizer";
import type { HitTarget, Intent, PointerSample } from "./gestureRecognizer";

const CANVAS: HitTarget = { kind: "canvas" };
const NODE_A: HitTarget = { kind: "node", nodeId: "a" };
const ADD_CHILD: HitTarget = { kind: "add-child", nodeId: "a" };
const ADD_SIBLING: HitTarget = { kind: "add-sibling", nodeId: "a" };

let recognizer: GestureRecognizer;
let emitted: Intent[];

beforeEach(() => {
  vi.useFakeTimers();
  emitted = [];
  recognizer = new GestureRecognizer(
    { dragThresholdPx: 8, doubleTapIntervalMs: 300, doubleTapDistancePx: 24 },
    (intent) => emitted.push(intent),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

function sample(overrides: Partial<PointerSample>): PointerSample {
  return { phase: "down", pointerId: 1, kind: "touch", x: 100, y: 100, time: 0, button: 0, target: NODE_A, ...overrides };
}

function send(phase: PointerSample["phase"], overrides: Partial<PointerSample> = {}): Intent[] {
  return [...recognizer.handle(sample({ ...overrides, phase }))];
}

function types(intents: Intent[]): string[] {
  return intents.map((intent) => intent.type);
}

const DEVICES = [
  ["touch", { kind: "touch" }],
  ["mouse", { kind: "mouse", button: 0 }],
] as const;

describe.each(DEVICES)("node drag threshold with %s", (_name, device) => {
  it("starts no drag at exactly 8 px and reports a tap on release", () => {
    send("down", device);

    const moves = send("move", { ...device, x: 108 });
    const release = send("up", { ...device, x: 108, time: 50 });

    expect(moves).toEqual([]);
    expect(release).toEqual([{ type: "tap", target: NODE_A }]);
  });

  it("starts the drag just beyond 8 px (8.5) with the node id and the total delta", () => {
    send("down", device);

    const intents = send("move", { ...device, x: 108.5 });

    expect(intents).toEqual([
      { type: "nodeDragStart", nodeId: "a" },
      { type: "nodeDrag", dx: 8.5, dy: 0 },
    ]);
  });

  it("starts the drag at 8.01 px", () => {
    send("down", device);

    expect(types(send("move", { ...device, x: 108.01 }))).toEqual(["nodeDragStart", "nodeDrag"]);
  });

  it("measures the threshold diagonally", () => {
    send("down", device);

    expect(send("move", { ...device, x: 106, y: 106 })).toEqual([
      { type: "nodeDragStart", nodeId: "a" },
      { type: "nodeDrag", dx: 6, dy: 6 },
    ]);
  });

  it("reports the total delta from the press point on every further move", () => {
    send("down", device);
    send("move", { ...device, x: 120 });

    expect(send("move", { ...device, x: 130, y: 90 })).toEqual([{ type: "nodeDrag", dx: 30, dy: -10 }]);
  });

  it("keeps dragging after coming back inside the threshold", () => {
    send("down", device);
    send("move", { ...device, x: 150 });

    expect(send("move", { ...device, x: 101 })).toEqual([{ type: "nodeDrag", dx: 1, dy: 0 }]);
  });

  it("ends the drag on release without a tap", () => {
    send("down", device);
    send("move", { ...device, x: 150 });

    expect(send("up", { ...device, x: 150, time: 100 })).toEqual([{ type: "nodeDragEnd" }]);
  });

  it("cancels the drag when the pointer is cancelled", () => {
    send("down", device);
    send("move", { ...device, x: 150 });

    expect(types(send("cancel", device))).toEqual(["nodeDragCancel"]);
  });

  it("emits nothing at all for a cancelled press that never started a drag", () => {
    send("down", device);
    send("move", { ...device, x: 103 });

    expect(send("cancel", device)).toEqual([]);
  });

  it("emits no drag intents for a plain tap", () => {
    send("down", device);

    expect(types(send("up", { ...device, time: 50 }))).toEqual(["tap"]);
  });

  it("does not emit further drag intents after the drag ended", () => {
    send("down", device);
    send("move", { ...device, x: 150 });
    send("up", { ...device, x: 150, time: 100 });

    expect(send("move", { ...device, x: 200 })).toEqual([]);
  });

  it("does not emit a pan for a drag that started on a node", () => {
    send("down", device);

    expect(types(send("move", { ...device, x: 150 }))).not.toContain("pan");
  });
});

describe("node drag exclusions", () => {
  it("does not drag when a touch starts on the canvas", () => {
    send("down", { target: CANVAS });

    expect(types(send("move", { x: 150 }))).toEqual(["pan"]);
  });

  it.each([
    ["add-child", ADD_CHILD],
    ["add-sibling", ADD_SIBLING],
  ])("does not drag from the %s button", (_name, target) => {
    send("down", { target });

    expect(send("move", { target, x: 150 })).toEqual([]);
  });

  it("does not drag a node with the right mouse button", () => {
    send("down", { kind: "mouse", button: 2 });

    expect(send("move", { kind: "mouse", button: 2, x: 150 })).toEqual([]);
  });

  it("does not drag a node with the middle mouse button", () => {
    send("down", { kind: "mouse", button: 1 });

    expect(types(send("move", { kind: "mouse", button: 1, x: 150 }))).not.toContain("nodeDragStart");
  });

  it("does not drag a node with the mouse while space is held", () => {
    recognizer.setSpaceHeld(true);
    send("down", { kind: "mouse", button: 0 });

    expect(types(send("move", { kind: "mouse", button: 0, x: 150 }))).toEqual(["pan"]);
  });

  it("drags a node with the mouse again after space is released", () => {
    recognizer.setSpaceHeld(true);
    recognizer.setSpaceHeld(false);
    send("down", { kind: "mouse", button: 0 });

    expect(types(send("move", { kind: "mouse", button: 0, x: 150 }))).toEqual(["nodeDragStart", "nodeDrag"]);
  });
});

describe("node drag and long press", () => {
  it("starts no drag when the finger moves after the long press fired", () => {
    send("down");
    vi.advanceTimersByTime(500);

    const intents = send("move", { x: 200 });

    expect(emitted.map((intent) => intent.type)).toEqual(["longPress"]);
    expect(intents).toEqual([]);
  });

  it("emits no drag end when the finger lifts after a long press", () => {
    send("down");
    vi.advanceTimersByTime(500);

    expect(send("up", { time: 600 })).toEqual([]);
  });

  it("starts the drag when the finger moves past the threshold before the long press fires", () => {
    send("down");
    vi.advanceTimersByTime(200);

    expect(types(send("move", { x: 150 }))).toEqual(["nodeDragStart", "nodeDrag"]);
  });

  it("never fires the long press once the drag has started", () => {
    send("down");
    send("move", { x: 150 });
    vi.advanceTimersByTime(1000);

    expect(emitted).toEqual([]);
  });
});

describe("node drag and multi-touch", () => {
  function startDragThenAddSecondFinger(): Intent[] {
    send("down", { pointerId: 1, x: 100, y: 100 });
    send("move", { pointerId: 1, x: 150, y: 100 });
    return send("down", { pointerId: 2, x: 300, y: 100, target: CANVAS, isPrimary: false });
  }

  it("cancels the drag when a second finger touches down", () => {
    expect(startDragThenAddSecondFinger()).toEqual([{ type: "nodeDragCancel" }]);
  });

  it("pinches with both fingers after the drag was cancelled", () => {
    startDragThenAddSecondFinger();

    const intents = send("move", { pointerId: 2, x: 400, y: 100, target: CANVAS });

    expect(types(intents)).toEqual(["pinch"]);
  });

  it("emits no drag intents for the first finger while pinching", () => {
    startDragThenAddSecondFinger();

    const intents = send("move", { pointerId: 1, x: 90, y: 100 });

    expect(types(intents).filter((type) => type.startsWith("nodeDrag"))).toEqual([]);
  });

  it("emits nothing about dragging when the second finger lifts before any drag started", () => {
    send("down", { pointerId: 1 });
    const intents = send("down", { pointerId: 2, x: 300, target: CANVAS, isPrimary: false });

    expect(types(intents).filter((type) => type.startsWith("nodeDrag"))).toEqual([]);
  });

  it("does not start a drag on the remaining finger after the second finger lifts", () => {
    startDragThenAddSecondFinger();
    send("up", { pointerId: 2, x: 300, target: CANVAS, time: 100 });

    expect(types(send("move", { pointerId: 1, x: 200 }))).not.toContain("nodeDragStart");
  });
});

describe("canvas gestures stay unaffected by node dragging", () => {
  it("pans with one finger that started on the canvas", () => {
    send("down", { target: CANVAS });

    expect(send("move", { target: CANVAS, x: 150, y: 120 })).toEqual([{ type: "pan", dx: 50, dy: 20 }]);
  });

  it("pinches with two fingers on the canvas", () => {
    send("down", { pointerId: 1, x: 100, target: CANVAS });
    send("down", { pointerId: 2, x: 200, target: CANVAS, isPrimary: false });

    const intents = send("move", { pointerId: 2, x: 300, target: CANVAS });

    expect(types(intents)).toEqual(["pinch"]);
  });

  it("pinches with two fingers that both started on nodes", () => {
    send("down", { pointerId: 1, x: 100 });
    send("down", { pointerId: 2, x: 200, target: { kind: "node", nodeId: "b" }, isPrimary: false });

    const intents = send("move", { pointerId: 2, x: 300, target: { kind: "node", nodeId: "b" } });

    expect(types(intents)).toEqual(["pinch"]);
  });

  it("forgets a drag in progress when the recognizer is disposed", () => {
    send("down");
    send("move", { x: 150 });
    recognizer.dispose();

    expect(send("move", { x: 200 })).toEqual([]);
  });
});

describe("node drag and stale touches", () => {
  it("cancels a drag whose finger release was lost when a new primary touch arrives", () => {
    send("down", { pointerId: 1 });
    send("move", { pointerId: 1, x: 150 });

    const intents = send("down", { pointerId: 3, x: 300, target: CANVAS, isPrimary: true });

    expect(intents).toEqual([{ type: "nodeDragCancel" }]);
  });

  it("drags again with the new touch after the stale drag was cancelled", () => {
    send("down", { pointerId: 1 });
    send("move", { pointerId: 1, x: 150 });
    send("down", { pointerId: 3, isPrimary: true });

    expect(send("move", { pointerId: 3, x: 150 })).toEqual([
      { type: "nodeDragStart", nodeId: "a" },
      { type: "nodeDrag", dx: 50, dy: 0 },
    ]);
  });
});

describe("node drag and double tap", () => {
  it("reports a plain tap, not a double tap, for the first tap right after a drag", () => {
    send("down");
    send("move", { x: 150 });
    send("up", { x: 150, time: 50 });
    send("down", { x: 150, time: 100 });

    expect(send("up", { x: 150, time: 120 })).toEqual([{ type: "tap", target: NODE_A }]);
  });

  it("reports a plain tap, not a double tap, for the first tap after a drag cancelled by a second finger", () => {
    send("down", { pointerId: 1 });
    send("move", { pointerId: 1, x: 150 });
    send("down", { pointerId: 2, x: 300, target: CANVAS, isPrimary: false });
    send("up", { pointerId: 2, x: 300, target: CANVAS, time: 60 });
    send("up", { pointerId: 1, x: 150, time: 70 });
    send("down", { pointerId: 4, x: 150, time: 100, isPrimary: true });

    expect(send("up", { pointerId: 4, x: 150, time: 120 })).toEqual([{ type: "tap", target: NODE_A }]);
  });
});

describe("node drag and the space key", () => {
  it("keeps dragging the mouse when space is pressed after the drag started", () => {
    send("down", { kind: "mouse" });
    send("move", { kind: "mouse", x: 150 });
    recognizer.setSpaceHeld(true);

    expect(send("move", { kind: "mouse", x: 160 })).toEqual([{ type: "nodeDrag", dx: 60, dy: 0 }]);
  });
});
