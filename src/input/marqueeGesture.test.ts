import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureRecognizer } from "./gestureRecognizer";
import type { HitTarget, Intent, PointerSample } from "./gestureRecognizer";

const CANVAS: HitTarget = { kind: "canvas" };
const NODE_A: HitTarget = { kind: "node", nodeId: "a" };

let emitted: Intent[];
let recognizer: GestureRecognizer;

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
  return { phase: "down", pointerId: 1, kind: "mouse", x: 100, y: 100, time: 0, button: 0, target: CANVAS, ...overrides };
}

function feed(...samples: PointerSample[]): Intent[] {
  return samples.flatMap((s) => [...recognizer.handle(s)]);
}

function types(intents: readonly Intent[]): string[] {
  return intents.map((intent) => intent.type);
}

describe("mouse marquee on empty space", () => {
  it("emits nothing while the pointer stays within 8 px", () => {
    const intents = feed(sample({}), sample({ phase: "move", x: 108, y: 100 }));

    expect(types(intents)).toEqual([]);
  });

  it("starts the marquee at the press point once the pointer is 9 px away", () => {
    const intents = feed(sample({}), sample({ phase: "move", x: 109, y: 100 }));

    expect(intents).toEqual([
      { type: "marqueeStart", origin: { x: 100, y: 100 } },
      { type: "marqueeMove", point: { x: 109, y: 100 } },
    ]);
  });

  it("measures the threshold as a straight-line distance", () => {
    const intents = feed(sample({}), sample({ phase: "move", x: 106, y: 106 }));

    expect(types(intents)).toEqual(["marqueeStart", "marqueeMove"]);
  });

  it("does not start for a diagonal move that is still within 8 px", () => {
    const intents = feed(sample({}), sample({ phase: "move", x: 105, y: 105 }));

    expect(intents).toEqual([]);
  });

  it("keeps emitting marqueeMove after the start", () => {
    feed(sample({}), sample({ phase: "move", x: 150, y: 150 }));

    const intents = feed(sample({ phase: "move", x: 160, y: 170 }));

    expect(intents).toEqual([{ type: "marqueeMove", point: { x: 160, y: 170 } }]);
  });

  it("keeps the marquee alive when the pointer returns to the origin", () => {
    feed(sample({}), sample({ phase: "move", x: 150, y: 150 }));

    const intents = feed(sample({ phase: "move", x: 100, y: 100 }));

    expect(intents).toEqual([{ type: "marqueeMove", point: { x: 100, y: 100 } }]);
  });

  it("ends the marquee on release and reports no tap", () => {
    const intents = feed(sample({}), sample({ phase: "move", x: 150, y: 150 }), sample({ phase: "up", x: 150, y: 150, time: 100 }));

    expect(types(intents)).toEqual(["marqueeStart", "marqueeMove", "marqueeEnd"]);
  });

  it("cancels the marquee when the pointer is cancelled", () => {
    const intents = feed(sample({}), sample({ phase: "move", x: 150, y: 150 }), sample({ phase: "cancel", x: 150, y: 150 }));

    expect(types(intents)).toEqual(["marqueeStart", "marqueeMove", "marqueeCancel"]);
  });

  it("emits no marquee intents for a plain click", () => {
    const intents = feed(sample({}), sample({ phase: "up", time: 50 }));

    expect(intents).toEqual([{ type: "tap", target: CANVAS }]);
  });

  it("does not pan the canvas", () => {
    const intents = feed(sample({}), sample({ phase: "move", x: 150, y: 150 }));

    expect(types(intents)).not.toContain("pan");
  });

  it("does not draw a marquee for a right-button drag", () => {
    const intents = feed(sample({ button: 2 }), sample({ phase: "move", button: 2, x: 150, y: 150 }));

    expect(types(intents)).toEqual([]);
  });

  it("does not draw a marquee for a middle-button drag, which pans", () => {
    const intents = feed(sample({ button: 1 }), sample({ phase: "move", button: 1, x: 150, y: 150 }));

    expect(types(intents)).not.toContain("marqueeStart");
  });

  it("does not draw a marquee when the press lands on a node", () => {
    const intents = feed(sample({ target: NODE_A }), sample({ phase: "move", x: 150, y: 150, target: NODE_A }));

    expect(types(intents)).not.toContain("marqueeStart");
  });

  it("ignores moves of a different pointer", () => {
    const intents = feed(sample({}), sample({ phase: "move", pointerId: 2, x: 300, y: 300 }));

    expect(types(intents)).not.toContain("marqueeStart");
  });

  it("starts a fresh marquee for the next drag", () => {
    feed(sample({}), sample({ phase: "move", x: 150, y: 150 }), sample({ phase: "up", x: 150, y: 150, time: 100 }));

    const intents = feed(sample({ x: 10, y: 10, time: 1000 }), sample({ phase: "move", x: 40, y: 10, time: 1010 }));

    expect(intents[0]).toEqual({ type: "marqueeStart", origin: { x: 10, y: 10 } });
  });
});

describe("Space-held mouse drag", () => {
  it("still pans and draws no marquee", () => {
    recognizer.setSpaceHeld(true);

    const intents = feed(sample({}), sample({ phase: "move", x: 150, y: 150 }));

    expect(types(intents)).toContain("pan");
    expect(types(intents)).not.toContain("marqueeStart");
  });
});

describe("touch marquee after a long press on empty space", () => {
  it("starts the marquee when the finger moves 9 px after the long press", () => {
    feed(sample({ kind: "touch" }));
    vi.advanceTimersByTime(500);
    emitted.length = 0;

    const intents = feed(sample({ kind: "touch", phase: "move", x: 109, y: 100, time: 600 }));

    expect(intents).toEqual([
      { type: "marqueeStart", origin: { x: 100, y: 100 } },
      { type: "marqueeMove", point: { x: 109, y: 100 } },
    ]);
  });

  it("does not start the marquee for a 8 px move after the long press", () => {
    feed(sample({ kind: "touch" }));
    vi.advanceTimersByTime(500);
    emitted.length = 0;

    const intents = feed(sample({ kind: "touch", phase: "move", x: 108, y: 100, time: 600 }));

    expect(intents).toEqual([]);
  });

  it("measures the 8 px from where the finger rested when the menu opened, not from the first touch", () => {
    feed(sample({ kind: "touch" }), sample({ kind: "touch", phase: "move", x: 107, y: 100, time: 100 }));
    vi.advanceTimersByTime(500);
    emitted.length = 0;

    const jitter = feed(sample({ kind: "touch", phase: "move", x: 110, y: 100, time: 600 }));
    const realMove = feed(sample({ kind: "touch", phase: "move", x: 116, y: 100, time: 650 }));

    expect(jitter).toEqual([]);
    expect(types(realMove)).toEqual(["marqueeStart", "marqueeMove"]);
  });

  it("reports the long press itself before any marquee intent", () => {
    feed(sample({ kind: "touch" }));
    vi.advanceTimersByTime(500);

    expect(types(emitted)).toEqual(["longPress"]);
  });

  it("ends the marquee when the finger lifts", () => {
    feed(sample({ kind: "touch" }));
    vi.advanceTimersByTime(500);

    const intents = feed(
      sample({ kind: "touch", phase: "move", x: 150, y: 150, time: 600 }),
      sample({ kind: "touch", phase: "up", x: 150, y: 150, time: 700 }),
    );

    expect(types(intents)).toEqual(["marqueeStart", "marqueeMove", "marqueeEnd"]);
  });

  it("does not pan after the long press", () => {
    feed(sample({ kind: "touch" }));
    vi.advanceTimersByTime(500);

    const intents = feed(sample({ kind: "touch", phase: "move", x: 150, y: 150, time: 600 }));

    expect(types(intents)).not.toContain("pan");
  });

  it("cancels the marquee when a second finger lands", () => {
    feed(sample({ kind: "touch" }));
    vi.advanceTimersByTime(500);
    feed(sample({ kind: "touch", phase: "move", x: 150, y: 150, time: 600 }));

    const intents = feed(sample({ kind: "touch", pointerId: 2, x: 300, y: 300, time: 650, isPrimary: false }));

    expect(types(intents)).toContain("marqueeCancel");
  });

  it("does not arm the marquee for a long press on a node", () => {
    feed(sample({ kind: "touch", target: NODE_A }));
    vi.advanceTimersByTime(500);

    const intents = feed(sample({ kind: "touch", phase: "move", x: 150, y: 150, target: NODE_A, time: 600 }));

    expect(types(intents)).not.toContain("marqueeStart");
  });

  it("pans, not marquees, when the finger moves before the long press fires", () => {
    const intents = feed(sample({ kind: "touch" }), sample({ kind: "touch", phase: "move", x: 150, y: 150, time: 100 }));

    expect(types(intents)).toContain("pan");
    expect(types(intents)).not.toContain("marqueeStart");
  });
});

describe("tap with a modifier key", () => {
  it("carries isAdditive on the tap intent", () => {
    const intents = feed(sample({ target: NODE_A, isAdditive: true }), sample({ phase: "up", target: NODE_A, time: 50 }));

    expect(intents).toEqual([{ type: "tap", target: NODE_A, isAdditive: true }]);
  });

  it("leaves isAdditive off a plain tap", () => {
    const intents = feed(sample({ target: NODE_A }), sample({ phase: "up", target: NODE_A, time: 50 }));

    expect(intents).toEqual([{ type: "tap", target: NODE_A }]);
  });
});

describe("press that opens a context menu (macOS Ctrl+click)", () => {
  it("reports the context menu and no tap on release", () => {
    const intents = [
      ...feed(sample({ target: NODE_A, isAdditive: true })),
      ...recognizer.handleContextMenu({ x: 100, y: 100, target: NODE_A }),
      ...feed(sample({ phase: "up", target: NODE_A, time: 50 })),
    ];

    expect(types(intents)).toEqual(["contextMenu"]);
  });

  it("draws no marquee when the pointer then moves on empty space", () => {
    const intents = [
      ...feed(sample({ isAdditive: true })),
      ...recognizer.handleContextMenu({ x: 100, y: 100, target: CANVAS }),
      ...feed(sample({ phase: "move", x: 140, y: 140 }), sample({ phase: "up", x: 140, y: 140, time: 50 })),
    ];

    expect(types(intents)).toEqual(["contextMenu"]);
  });

  it("cancels a marquee that is already being drawn", () => {
    feed(sample({}), sample({ phase: "move", x: 140, y: 140 }));

    const intents = recognizer.handleContextMenu({ x: 140, y: 140, target: CANVAS });

    expect(types(intents)).toEqual(["marqueeCancel", "contextMenu"]);
  });
});
