// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeLayout } from "../layout";
import type { Size } from "../layout";
import { buildMindMap } from "../model";
import type { Rect } from "../viewport";
import { MapEditor } from "./mapEditor";
import type { VisibleAreaSource } from "./visibleArea";

const NODE_SIZE: Size = { width: 100, height: 20 };
const FULL_AREA: Rect = { left: 0, top: 0, right: 800, bottom: 600 };
const CANVAS_RECT = { left: 0, top: 0, right: 800, bottom: 600 };
const MAP = buildMindMap([{ id: "r", text: "Root", parentId: null }]);
const INITIAL_CAMERA_Y = 40;
const MARGIN = 8;
const DONE_BAR_HEIGHT = 44;

class FakeVisibleArea implements VisibleAreaSource {
  rect: Rect = FULL_AREA;
  readonly listeners = new Set<() => void>();

  read(): Rect {
    return this.rect;
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  resizeTo(rect: Rect): void {
    this.rect = rect;
    [...this.listeners].forEach((listener) => listener());
  }
}

let container: HTMLElement;
let editor: MapEditor | null;
let pendingFrames: (() => void)[];
let visibleArea: FakeVisibleArea;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(NODE_SIZE.width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(NODE_SIZE.height);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    ...CANVAS_RECT,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  pendingFrames = [];
  visibleArea = new FakeVisibleArea();
  editor = null;
});

afterEach(() => {
  editor?.destroy();
  container.remove();
  document.querySelectorAll(".pinchmap-done-bar").forEach((bar) => bar.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createEditor(options: { visibleArea?: VisibleAreaSource; doneLabel?: string } = {}): MapEditor {
  const host = { onMapChanged: vi.fn(), onTextEditEnded: vi.fn(), notify: vi.fn() };
  editor = new MapEditor({
    container,
    host,
    requestFrame: (callback) => pendingFrames.push(callback),
    ...options,
  });
  const canvas = container.querySelector<HTMLElement>(".pinchmap-canvas");
  if (canvas !== null) canvas.setPointerCapture = vi.fn();
  return editor;
}

function stubCoarsePointer(isCoarse: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: isCoarse && query === "(pointer: coarse)", media: query }) as MediaQueryList,
  );
}

function flushFrames(): void {
  while (pendingFrames.length > 0) pendingFrames.shift()?.();
}

function startEditingRoot(target: MapEditor): void {
  target.loadMap(MAP);
  flushFrames();
  const node = container.querySelector<HTMLElement>('.pinchmap-node[data-node-id="r"]');
  if (node === null) throw new Error("root not rendered");
  const canvas = container.querySelector<HTMLElement>(".pinchmap-canvas");
  tap(node);
  canvas?.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));
  flushFrames();
}

function tap(target: Element): void {
  for (const [type, timeStamp] of [["pointerdown", 1000], ["pointerup", 1050]] as const) {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch" });
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
    target.dispatchEvent(event);
  }
  flushFrames();
}

function cameraY(): number {
  const world = container.querySelector<HTMLElement>(".pinchmap-world");
  const match = /translate\([^,]+px, (-?[\d.]+)px\)/.exec(world?.style.transform ?? "");
  if (match === null) throw new Error("no camera transform");
  return Number(match[1]);
}

function rootBottomOnScreen(): number {
  const sizes = new Map([["r", NODE_SIZE]]);
  const position = computeLayout(MAP, sizes).positions.get("r");
  if (position === undefined) throw new Error("root has no position");
  return CANVAS_RECT.top + INITIAL_CAMERA_Y + position.y + NODE_SIZE.height;
}

function areaEndingAt(bottom: number): Rect {
  return { ...FULL_AREA, bottom };
}

describe("MapEditor revealing the edited node above the keyboard", () => {
  it("pans the canvas so the edited node is visible when the visible area shrinks", () => {
    const target = createEditor({ visibleArea });
    startEditingRoot(target);
    expect(target.isEditingText()).toBe(true);
    const nodeBottom = rootBottomOnScreen();
    const keyboardTop = nodeBottom - 5;

    visibleArea.resizeTo(areaEndingAt(keyboardTop));
    flushFrames();

    expect(cameraY()).toBe(INITIAL_CAMERA_Y + (keyboardTop - MARGIN - nodeBottom));
  });

  it("does not pan when the node is already visible above the keyboard", () => {
    const target = createEditor({ visibleArea });
    startEditingRoot(target);

    visibleArea.resizeTo(areaEndingAt(rootBottomOnScreen() + 100));
    flushFrames();

    expect(cameraY()).toBe(INITIAL_CAMERA_Y);
  });

  it("does not pan twice when the visible area changes again before the camera frame is applied", () => {
    const target = createEditor({ visibleArea });
    startEditingRoot(target);
    const nodeBottom = rootBottomOnScreen();
    const keyboardTop = nodeBottom - 5;
    const expectedY = INITIAL_CAMERA_Y + (keyboardTop - MARGIN - nodeBottom);
    visibleArea.resizeTo(areaEndingAt(keyboardTop));
    pendingFrames.shift()?.();
    visibleArea.resizeTo(areaEndingAt(keyboardTop));
    const [cameraFrame, editorFrame] = pendingFrames.splice(0);

    editorFrame?.();
    cameraFrame?.();
    flushFrames();

    expect(cameraY()).toBe(expectedY);
  });

  it("does not pan when the visible area changes while not editing", () => {
    const target = createEditor({ visibleArea });
    target.loadMap(MAP);
    flushFrames();

    visibleArea.resizeTo(areaEndingAt(20));
    flushFrames();

    expect(cameraY()).toBe(INITIAL_CAMERA_Y);
  });

  it("does not pan without a visible area source", () => {
    const target = createEditor();
    startEditingRoot(target);

    flushFrames();

    expect(target.isEditingText()).toBe(true);
    expect(cameraY()).toBe(INITIAL_CAMERA_Y);
  });

  it("stops reacting to the visible area after destroy", () => {
    const target = createEditor({ visibleArea });

    target.destroy();
    editor = null;

    expect(visibleArea.listeners.size).toBe(0);
  });

  it("keeps the node above the done bar as well when the pointer is coarse", () => {
    stubCoarsePointer(true);
    const target = createEditor({ visibleArea });
    startEditingRoot(target);
    const nodeBottom = rootBottomOnScreen();
    const keyboardTop = nodeBottom + 20;

    visibleArea.resizeTo(areaEndingAt(keyboardTop));
    flushFrames();

    expect(cameraY()).toBe(INITIAL_CAMERA_Y + (keyboardTop - DONE_BAR_HEIGHT - MARGIN - nodeBottom));
  });
});

describe("MapEditor done bar", () => {
  function doneBar(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".pinchmap-done-bar");
  }

  it("is shown while editing on a coarse pointer, at the bottom of the visible area", () => {
    stubCoarsePointer(true);
    const target = createEditor({ visibleArea, doneLabel: "Готово" });
    startEditingRoot(target);

    visibleArea.resizeTo(areaEndingAt(500));
    flushFrames();

    expect(doneBar()?.hidden).toBe(false);
    expect(doneBar()?.style.top).toBe(`${500 - DONE_BAR_HEIGHT}px`);
    expect(doneBar()?.querySelector("button")?.textContent).toBe("Готово");
  });

  it("is hidden when no text is being edited", () => {
    stubCoarsePointer(true);
    const target = createEditor({ visibleArea });
    target.loadMap(MAP);
    flushFrames();

    expect(doneBar()?.hidden).toBe(true);
  });

  it("is hidden again after editing ends", () => {
    stubCoarsePointer(true);
    const target = createEditor({ visibleArea });
    startEditingRoot(target);

    target.commitPendingEdit();
    flushFrames();

    expect(doneBar()?.hidden).toBe(true);
  });

  it("does not exist when the pointer is fine", () => {
    stubCoarsePointer(false);
    const target = createEditor({ visibleArea });
    startEditingRoot(target);

    expect(doneBar()).toBeNull();
  });

  it("does not exist without a visible area source", () => {
    stubCoarsePointer(true);
    const target = createEditor();
    startEditingRoot(target);

    expect(doneBar()).toBeNull();
  });

  it("commits the text and hands focus to the canvas when Done is clicked", () => {
    stubCoarsePointer(true);
    const target = createEditor({ visibleArea });
    startEditingRoot(target);
    const input = container.querySelector("textarea");
    if (input === null) throw new Error("no text input is open");
    input.value = "Typed";

    doneBar()?.querySelector("button")?.click();
    flushFrames();

    expect(target.isEditingText()).toBe(false);
    expect(target.getMap().nodes.get("r")?.text).toBe("Typed");
    expect(document.activeElement).toBe(container.querySelector(".pinchmap-canvas"));
  });

  it("is removed on destroy", () => {
    stubCoarsePointer(true);
    const target = createEditor({ visibleArea });

    target.destroy();
    editor = null;

    expect(doneBar()).toBeNull();
  });
});
