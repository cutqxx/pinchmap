// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutResult, Size } from "../layout";
import type { NodeId } from "../model";
import type { Rect } from "../viewport";
import { CameraController } from "./cameraController";
import { KeyboardAssist } from "./keyboardAssist";
import type { VisibleAreaSource } from "./visibleArea";

const FULL_AREA: Rect = { left: 0, top: 0, right: 800, bottom: 600 };
const MARGIN = 8;
const INITIAL_CAMERA_Y = 40;
const SMALL: Size = { width: 100, height: 20 };
const TALLER_THAN_AREA: Size = { width: 100, height: 700 };

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

let visibleArea: FakeVisibleArea;
let camera: CameraController;
let canvasElement: HTMLElement;
let onDone: ReturnType<typeof vi.fn<() => void>>;
let onVisibleAreaChanged: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  visibleArea = new FakeVisibleArea();
  camera = new CameraController({ setCamera: () => {}, setGestureActive: () => {} }, (frame) => frame());
  canvasElement = document.createElement("div");
  vi.spyOn(canvasElement, "getBoundingClientRect").mockReturnValue({
    ...FULL_AREA,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  });
  onDone = vi.fn();
  onVisibleAreaChanged = vi.fn();
});

afterEach(() => {
  document.querySelectorAll(".pinchmap-done-bar").forEach((bar) => bar.remove());
  vi.restoreAllMocks();
});

function createAssist(source: VisibleAreaSource | null = visibleArea): KeyboardAssist {
  return new KeyboardAssist({
    visibleArea: source,
    doc: document,
    doneLabel: "Done",
    camera,
    canvasElement,
    onDone,
    onVisibleAreaChanged,
  });
}

function layoutOf(positions: Record<NodeId, { x: number; y: number }>): LayoutResult {
  return { positions: new Map(Object.entries(positions)) } as unknown as LayoutResult;
}

const ROOT_LAYOUT = layoutOf({ r: { x: 0, y: 0 } });

function sizesOf(sizes: Record<NodeId, Size>): ReadonlyMap<NodeId, Size> {
  return new Map(Object.entries(sizes));
}

function areaEndingAt(bottom: number): Rect {
  return { ...FULL_AREA, bottom };
}

function stubCoarsePointer(): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: query === "(pointer: coarse)", media: query }) as MediaQueryList,
  );
}

function userPansBy(dy: number): number {
  camera.panBy(0, dy);
  return camera.getCamera().y;
}

describe("KeyboardAssist revealing the edited node", () => {
  it("reveals the edited node when editing starts with the node below the visible area", () => {
    const assist = createAssist();
    visibleArea.rect = areaEndingAt(50);

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y + (50 - MARGIN - (INITIAL_CAMERA_Y + SMALL.height)));
  });

  it("aligns the top of a node taller than the visible area when editing starts", () => {
    const assist = createAssist();

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: TALLER_THAN_AREA }));

    expect(camera.getCamera().y).toBe(MARGIN);
  });

  it("does not snap the camera back when the user pans away and types without resizing the node", () => {
    const assist = createAssist();
    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));
    const pannedY = userPansBy(-500);

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: { ...SMALL } }));

    expect(camera.getCamera().y).toBe(pannedY);
  });

  it("reveals again when the node grows, aligning the bottom edge of a node taller than the area", () => {
    const assist = createAssist();
    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));
    userPansBy(-500);

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: TALLER_THAN_AREA }));

    const nodeBottomOnScreen = camera.getCamera().y + TALLER_THAN_AREA.height;
    expect(nodeBottomOnScreen).toBe(FULL_AREA.bottom - MARGIN);
  });

  it("reveals again when only the node width changes", () => {
    const assist = createAssist();
    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));
    userPansBy(-500);

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: { ...SMALL, width: 150 } }));

    expect(camera.getCamera().y).toBe(MARGIN);
  });

  it("aligns the top of a tall node when the visible area changes", () => {
    const assist = createAssist();
    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: TALLER_THAN_AREA }));
    userPansBy(100);
    visibleArea.rect = areaEndingAt(500);

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: TALLER_THAN_AREA }));

    expect(camera.getCamera().y).toBe(MARGIN);
  });

  it("reveals again when the visible area changes after the user panned away", () => {
    const assist = createAssist();
    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));
    userPansBy(-500);
    visibleArea.rect = areaEndingAt(500);

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(MARGIN);
  });

  it("reveals again when editing the same node restarts after editing stopped", () => {
    const assist = createAssist();
    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));
    userPansBy(-500);
    assist.sync(null, ROOT_LAYOUT, sizesOf({ r: SMALL }));

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(MARGIN);
  });

  it("reveals again when editing stopped because the layout is gone", () => {
    const assist = createAssist();
    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));
    userPansBy(-500);
    assist.sync("r", null, sizesOf({ r: SMALL }));

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(MARGIN);
  });

  it("reveals a different node even when the first one is unchanged", () => {
    const layout = layoutOf({ a: { x: 0, y: 0 }, b: { x: 0, y: 100 } });
    const sizes = sizesOf({ a: SMALL, b: SMALL });
    const assist = createAssist();
    assist.sync("a", layout, sizes);
    userPansBy(-500);

    assist.sync("b", layout, sizes);

    expect(camera.getCamera().y).toBe(MARGIN - 100);
  });

  it("does not pan when the node is already visible", () => {
    const assist = createAssist();

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y);
  });
});

describe("KeyboardAssist guards", () => {
  it("does not pan when the edited node has no position", () => {
    const assist = createAssist();
    visibleArea.rect = areaEndingAt(10);

    assist.sync("r", layoutOf({}), sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y);
  });

  it("does not pan when the edited node has no measured size", () => {
    const assist = createAssist();
    visibleArea.rect = areaEndingAt(10);

    assist.sync("r", ROOT_LAYOUT, sizesOf({}));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y);
  });

  it("reveals once the size becomes available after being missing", () => {
    const assist = createAssist();
    visibleArea.rect = areaEndingAt(50);
    assist.sync("r", ROOT_LAYOUT, sizesOf({}));

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y + (50 - MARGIN - (INITIAL_CAMERA_Y + SMALL.height)));
  });

  it("does not pan when the layout is null", () => {
    const assist = createAssist();
    visibleArea.rect = areaEndingAt(10);

    assist.sync("r", null, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y);
  });

  it("does not pan when nothing is being edited", () => {
    const assist = createAssist();
    visibleArea.rect = areaEndingAt(10);

    assist.sync(null, ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y);
  });

  it("does nothing without a visible area source", () => {
    const assist = createAssist(null);

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: TALLER_THAN_AREA }));

    expect(camera.getCamera().y).toBe(INITIAL_CAMERA_Y);
  });
});

describe("KeyboardAssist lifecycle", () => {
  it("notifies the owner when the visible area changes", () => {
    createAssist();

    visibleArea.resizeTo(areaEndingAt(300));

    expect(onVisibleAreaChanged).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes from the visible area on destroy", () => {
    const assist = createAssist();

    assist.destroy();

    expect(visibleArea.listeners.size).toBe(0);
  });

  it("removes the done bar on destroy", () => {
    stubCoarsePointer();
    const assist = createAssist();
    expect(document.querySelector(".pinchmap-done-bar")).not.toBeNull();

    assist.destroy();

    expect(document.querySelector(".pinchmap-done-bar")).toBeNull();
  });

  it("shows the done bar while editing and hides it when editing stops", () => {
    stubCoarsePointer();
    const assist = createAssist();

    assist.sync("r", ROOT_LAYOUT, sizesOf({ r: SMALL }));
    const shownWhileEditing = document.querySelector<HTMLElement>(".pinchmap-done-bar")?.hidden;
    assist.sync(null, ROOT_LAYOUT, sizesOf({ r: SMALL }));

    expect(shownWhileEditing).toBe(false);
    expect(document.querySelector<HTMLElement>(".pinchmap-done-bar")?.hidden).toBe(true);
  });

  it("does not create a done bar when the pointer is fine", () => {
    createAssist();

    expect(document.querySelector(".pinchmap-done-bar")).toBeNull();
  });
});
