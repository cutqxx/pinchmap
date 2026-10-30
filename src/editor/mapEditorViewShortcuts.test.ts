// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeLayout } from "../layout";
import type { Size } from "../layout";
import { buildMindMap } from "../model";
import type { NodeEntry } from "../model";
import { MapEditor } from "./mapEditor";

const NODE_SIZE: Size = { width: 100, height: 20 };
const CANVAS = { width: 800, height: 600 };
const INITIAL_CAMERA = { x: 40, y: 40, zoom: 1 };
const REVEAL_MARGIN = 8;
const FIT_MARGIN = 40;

function node(id: string, parentId: string | null, side?: "left"): NodeEntry {
  return { id, text: id, parentId, ...(side === undefined ? {} : { state: { side } }) };
}

const SMALL_MAP = buildMindMap([
  node("r", null),
  node("a", "r"),
  node("a1", "a"),
  node("b", "r"),
  node("l", "r", "left"),
]);

let container: HTMLElement;
let editor: MapEditor | null;
let pendingFrames: (() => void)[];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(NODE_SIZE.width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(NODE_SIZE.height);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, right: CANVAS.width, bottom: CANVAS.height, x: 0, y: 0, ...CANVAS, toJSON: () => ({}),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  pendingFrames = [];
  editor = null;
});

afterEach(() => {
  editor?.destroy();
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function flushFrames(): void {
  while (pendingFrames.length > 0) pendingFrames.shift()?.();
}

function openMap(map: ReturnType<typeof buildMindMap>): MapEditor {
  const host = { onMapChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() };
  editor = new MapEditor({ container, host, requestFrame: (callback) => pendingFrames.push(callback) });
  const canvas = container.querySelector<HTMLElement>(".pinchmap-canvas");
  if (canvas !== null) canvas.setPointerCapture = vi.fn();
  editor.loadMap(map);
  flushFrames();
  return editor;
}

function canvasElement(): HTMLElement {
  const canvas = container.querySelector<HTMLElement>(".pinchmap-canvas");
  if (canvas === null) throw new Error("no canvas");
  return canvas;
}

function press(key: string, init: KeyboardEventInit = {}): void {
  canvasElement().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  flushFrames();
}

function tapNode(id: string): void {
  const element = container.querySelector(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`node ${id} not rendered`);
  for (const [type, timeStamp] of [["pointerdown", 1000], ["pointerup", 1050]] as const) {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch" });
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
    element.dispatchEvent(event);
  }
  flushFrames();
}

function selectedId(): string | null {
  return container.querySelector(".pinchmap-node.is-selected")?.getAttribute("data-node-id") ?? null;
}

function camera(): { x: number; y: number; zoom: number } {
  const world = container.querySelector<HTMLElement>(".pinchmap-world");
  const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\((-?[\d.e-]+)\)/.exec(world?.style.transform ?? "");
  if (match === null) throw new Error("no camera transform");
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

function canvasCenterOnMap(): { x: number; y: number } {
  const { x, y, zoom } = camera();
  return { x: (CANVAS.width / 2 - x) / zoom, y: (CANVAS.height / 2 - y) / zoom };
}

function ctrl(init: KeyboardEventInit = {}): KeyboardEventInit {
  return { ctrlKey: true, ...init };
}

function nodeScreenRect(map: ReturnType<typeof buildMindMap>, id: string) {
  const sizes = new Map([...map.nodes.keys()].map((key) => [key, NODE_SIZE]));
  const position = computeLayout(map, sizes).positions.get(id);
  if (position === undefined) throw new Error(`no position for ${id}`);
  const { x, y, zoom } = camera();
  return {
    left: x + position.x * zoom,
    top: y + position.y * zoom,
    right: x + (position.x + NODE_SIZE.width) * zoom,
    bottom: y + (position.y + NODE_SIZE.height) * zoom,
  };
}

describe("MapEditor arrow key selection", () => {
  it("selects the first root on any arrow when nothing is selected", () => {
    openMap(SMALL_MAP);

    press("ArrowUp");

    expect(selectedId()).toBe("r");
  });

  it("moves to the first right child on ArrowRight from the root", () => {
    openMap(SMALL_MAP);
    tapNode("r");

    press("ArrowRight");

    expect(selectedId()).toBe("a");
  });

  it("moves to the first left child on ArrowLeft from the root", () => {
    openMap(SMALL_MAP);
    tapNode("r");

    press("ArrowLeft");

    expect(selectedId()).toBe("l");
  });

  it("moves to the next sibling on ArrowDown and back on ArrowUp", () => {
    openMap(SMALL_MAP);
    tapNode("a");

    press("ArrowDown");
    expect(selectedId()).toBe("b");
    press("ArrowUp");
    expect(selectedId()).toBe("a");
  });

  it("moves to the parent on ArrowLeft from a right-side child", () => {
    openMap(SMALL_MAP);
    tapNode("a1");

    press("ArrowLeft");

    expect(selectedId()).toBe("a");
  });

  it("keeps the selection at a boundary", () => {
    openMap(SMALL_MAP);
    tapNode("b");

    press("ArrowDown");

    expect(selectedId()).toBe("b");
  });

  it("does not navigate when an arrow is pressed with a modifier", () => {
    openMap(SMALL_MAP);
    tapNode("r");

    press("ArrowRight", { shiftKey: true });

    expect(selectedId()).toBe("r");
  });

  it("does nothing on an empty map", () => {
    openMap(buildMindMap([]));

    press("ArrowDown");

    expect(selectedId()).toBeNull();
    expect(camera()).toEqual(INITIAL_CAMERA);
  });
});

describe("MapEditor revealing the node selected by arrows", () => {
  const MANY_CHILDREN = buildMindMap([
    node("r", null),
    ...Array.from({ length: 60 }, (_, index) => node(`c${index}`, "r")),
  ]);

  it("pans so a target below the screen becomes visible with the reveal margin", () => {
    openMap(MANY_CHILDREN);
    tapNode("c0");

    for (let step = 0; step < 59; step += 1) press("ArrowDown");

    expect(selectedId()).toBe("c59");
    const rect = nodeScreenRect(MANY_CHILDREN, "c59");
    expect(rect.bottom).toBeCloseTo(CANVAS.height - REVEAL_MARGIN);
    expect(camera().zoom).toBe(1);
  });

  it("pans back when the target is above the screen", () => {
    openMap(MANY_CHILDREN);
    tapNode("c0");
    for (let step = 0; step < 59; step += 1) press("ArrowDown");

    for (let step = 0; step < 59; step += 1) press("ArrowUp");

    expect(selectedId()).toBe("c0");
    expect(nodeScreenRect(MANY_CHILDREN, "c0").top).toBeCloseTo(REVEAL_MARGIN);
  });

  it("does not pan when the target is already visible", () => {
    openMap(SMALL_MAP);
    tapNode("r");

    press("ArrowRight");

    expect(camera()).toEqual(INITIAL_CAMERA);
  });
});

describe("MapEditor fit to screen shortcut", () => {
  const SPREAD_MAP = buildMindMap([
    node("r", null),
    ...Array.from({ length: 40 }, (_, index) => node(`c${index}`, "r")),
    ...Array.from({ length: 10 }, (_, index) => node(`d${index}`, "r", "left")),
  ]);

  it("zooms and moves the camera so every node fits inside the screen with the margin", () => {
    openMap(SPREAD_MAP);

    press("0", ctrl());

    expect(camera().zoom).toBeLessThan(1);
    for (const id of SPREAD_MAP.nodes.keys()) {
      const rect = nodeScreenRect(SPREAD_MAP, id);
      expect(rect.left).toBeGreaterThanOrEqual(FIT_MARGIN - 1e-6);
      expect(rect.top).toBeGreaterThanOrEqual(FIT_MARGIN - 1e-6);
      expect(rect.right).toBeLessThanOrEqual(CANVAS.width - FIT_MARGIN + 1e-6);
      expect(rect.bottom).toBeLessThanOrEqual(CANVAS.height - FIT_MARGIN + 1e-6);
    }
  });

  it("works with the Cmd key too", () => {
    openMap(SPREAD_MAP);

    press("0", { metaKey: true });

    expect(camera().zoom).toBeLessThan(1);
  });

  it("does nothing on an empty map", () => {
    openMap(buildMindMap([]));

    press("0", ctrl());

    expect(camera()).toEqual(INITIAL_CAMERA);
  });
});

describe("MapEditor keyboard zoom", () => {
  it("zooms in by 1.25 on Ctrl+=", () => {
    openMap(SMALL_MAP);

    press("=", ctrl());

    expect(camera().zoom).toBeCloseTo(1.25);
  });

  it("zooms exactly one step when the view hotkey scope already handled the keydown", () => {
    const target = openMap(SMALL_MAP);
    container.addEventListener(
      "keydown",
      (event) => {
        event.preventDefault();
        target.zoomStep("in");
      },
      true,
    );

    press("=", ctrl());

    expect(camera().zoom).toBeCloseTo(1.25);
  });

  it("zooms in on Ctrl+Shift++", () => {
    openMap(SMALL_MAP);

    press("+", ctrl({ shiftKey: true }));

    expect(camera().zoom).toBeCloseTo(1.25);
  });

  it("zooms out by 1.25 on Ctrl+-", () => {
    openMap(SMALL_MAP);

    press("-", ctrl());

    expect(camera().zoom).toBeCloseTo(1 / 1.25);
  });

  it("keeps the canvas center point fixed when zooming in and out", () => {
    openMap(SMALL_MAP);
    const before = canvasCenterOnMap();

    press("=", ctrl());
    press("=", ctrl());
    const afterIn = canvasCenterOnMap();
    press("-", ctrl());
    const afterOut = canvasCenterOnMap();

    for (const point of [afterIn, afterOut]) {
      expect(point.x).toBeCloseTo(before.x);
      expect(point.y).toBeCloseTo(before.y);
    }
  });

  it("clamps zooming in at 400 percent", () => {
    openMap(SMALL_MAP);

    for (let step = 0; step < 20; step += 1) press("=", ctrl());

    expect(camera().zoom).toBe(4);
  });

  it("clamps zooming out at 10 percent", () => {
    openMap(SMALL_MAP);

    for (let step = 0; step < 30; step += 1) press("-", ctrl());

    expect(camera().zoom).toBeCloseTo(0.1);
  });

  it("zooms through the public methods used by the view hotkeys", () => {
    const target = openMap(SMALL_MAP);

    target.zoomStep("in");
    flushFrames();
    expect(camera().zoom).toBeCloseTo(1.25);
    target.fitToScreen();
    flushFrames();

    expect(camera().zoom).not.toBeCloseTo(1.25);
  });
});

describe("MapEditor view shortcuts while editing text", () => {
  function startEditing(target: MapEditor): void {
    tapNode("r");
    press("F2");
    expect(target.isEditingText()).toBe(true);
  }

  it.each([
    ["Ctrl+0", "0", ctrl()],
    ["Ctrl+=", "=", ctrl()],
    ["Ctrl+-", "-", ctrl()],
  ])("ignores %s", (_label, key, init) => {
    const target = openMap(SMALL_MAP);
    startEditing(target);
    const before = camera();

    press(key, init);

    expect(camera()).toEqual(before);
  });

  it("ignores arrow keys", () => {
    const target = openMap(SMALL_MAP);
    startEditing(target);

    press("ArrowRight");

    expect(selectedId()).toBe("r");
  });

  it("ignores the public zoom and fit methods", () => {
    const target = openMap(SMALL_MAP);
    startEditing(target);
    const before = camera();

    target.zoomStep("in");
    target.fitToScreen();
    flushFrames();

    expect(camera()).toEqual(before);
  });
});
