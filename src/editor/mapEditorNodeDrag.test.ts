// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, getNode, readManualPosition } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./mapEditor";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onHistoryChanged: Mock<(canUndo: boolean, canRedo: boolean) => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<(items: readonly MenuItem[], at: { x: number; y: number }) => void>;
  notify: Mock<(message: string) => void>;
}

interface Pointer {
  readonly id?: number;
  readonly kind?: "touch" | "mouse";
  readonly button?: number;
  readonly isPrimary?: boolean;
}

const LABELS = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", collapse: "Свернуть", expand: "Развернуть", resetLayout: "Сброс", delete: "Удалить" };
const SAMPLE = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r1" },
]);

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let pendingFrames: (() => void)[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  host = {
    onMapChanged: vi.fn(),
    onHistoryChanged: vi.fn(),
    onTextEditEnded: vi.fn(),
    showMenu: vi.fn(),
    notify: vi.fn(),
  };
  pendingFrames = [];
  editor = new MapEditor({
    container,
    host,
    requestFrame: (callback) => pendingFrames.push(callback),
    nodeMenuLabels: LABELS,
  });
  const element = canvas();
  element.setPointerCapture = vi.fn();
  element.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
});

afterEach(() => {
  editor.destroy();
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function canvas(): HTMLElement {
  const element = container.querySelector<HTMLElement>(".pinchmap-canvas");
  if (element === null) throw new Error("canvas not rendered");
  return element;
}

function nodeElement(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`node element ${id} not rendered`);
  return element;
}

function flushFrames(): void {
  while (pendingFrames.length > 0) pendingFrames.shift()?.();
}

function openMap(map: MindMap): void {
  editor.loadMap(map);
  flushFrames();
  host.onMapChanged.mockClear();
  host.onHistoryChanged.mockClear();
}

function fire(target: Element, type: string, at: { x: number; y: number }, pointer: Pointer = {}, time = 0): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: pointer.id ?? 1,
    pointerType: pointer.kind ?? "touch",
    button: pointer.button ?? 0,
    isPrimary: pointer.isPrimary ?? true,
    clientX: at.x,
    clientY: at.y,
  });
  Object.defineProperty(event, "timeStamp", { value: time });
  target.dispatchEvent(event);
}

function down(target: Element, at = { x: 100, y: 100 }, pointer: Pointer = {}): void {
  fire(target, "pointerdown", at, pointer);
}

function moveBy(target: Element, dx: number, dy = 0, pointer: Pointer = {}): void {
  fire(target, "pointermove", { x: 100 + dx, y: 100 + dy }, pointer, 10);
  flushFrames();
}

function up(target: Element, dx = 0, dy = 0, pointer: Pointer = {}): void {
  fire(target, "pointerup", { x: 100 + dx, y: 100 + dy }, pointer, 100);
  flushFrames();
}

function drag(nodeId: string, dx: number, dy = 0, pointer: Pointer = {}): void {
  const target = nodeElement(nodeId);
  down(target, { x: 100, y: 100 }, pointer);
  moveBy(target, dx, dy, pointer);
  up(target, dx, dy, pointer);
}

function zoom(): number {
  const world = container.querySelector<HTMLElement>(".pinchmap-world");
  const match = /scale\((-?[\d.e-]+)\)/.exec(world?.style.transform ?? "");
  if (match === null) throw new Error("no camera transform");
  return Number(match[1]);
}

function cameraTransform(): string {
  return container.querySelector<HTMLElement>(".pinchmap-world")?.style.transform ?? "";
}

function placement(id: string): { x: number; y: number } {
  const element = nodeElement(id);
  return { x: parseFloat(element.style.left), y: parseFloat(element.style.top) };
}

function offsetFromParent(id: string, parentId: string): { x: number; y: number } {
  const own = placement(id);
  const parent = placement(parentId);
  return { x: own.x - parent.x, y: own.y - parent.y };
}

function pinnedPosition(map: MindMap, id: string): { x: number; y: number } | undefined {
  return readManualPosition(getNode(map, id).state);
}

function pressUndo(): void {
  canvas().dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, code: "KeyZ", bubbles: true, cancelable: true }));
  flushFrames();
}

describe("MapEditor node drag", () => {
  it("moves the node by the finger movement divided by the zoom, without selecting it first", () => {
    openMap(SAMPLE);
    const before = offsetFromParent("a", "r1");

    drag("a", 60, 30);

    const pinned = pinnedPosition(editor.getMap(), "a");
    expect(pinned?.x).toBeCloseTo(before.x + 60 / zoom());
    expect(pinned?.y).toBeCloseTo(before.y + 30 / zoom());
  });

  it("moves the node with the mouse too", () => {
    openMap(SAMPLE);
    const before = offsetFromParent("a", "r1");

    drag("a", 50, 0, { kind: "mouse" });

    expect(pinnedPosition(editor.getMap(), "a")?.x).toBeCloseTo(before.x + 50 / zoom());
  });

  it("selects the dragged node", () => {
    openMap(SAMPLE);

    drag("a", 60);

    expect(nodeElement("a").classList.contains("is-selected")).toBe(true);
  });

  it("shows the node at the new place while the finger is still down", () => {
    openMap(SAMPLE);
    const before = placement("a");

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 40, 0);

    expect(placement("a").x).toBeCloseTo(before.x + 40 / zoom());
  });

  it("moves the children of the dragged node together with it", () => {
    openMap(SAMPLE);
    const childOffsetBefore = offsetFromParent("a1", "a");

    drag("a", 60, 30);

    expect(offsetFromParent("a1", "a")).toEqual(childOffsetBefore);
  });

  it("does not move the siblings or the parent of the dragged node", () => {
    openMap(SAMPLE);
    const before = { b: placement("b"), r1: placement("r1") };

    drag("a", 60, 30);

    expect(placement("b")).toEqual(before.b);
    expect(placement("r1")).toEqual(before.r1);
  });

  it("moves the whole tree when the root is dragged", () => {
    openMap(SAMPLE);
    const before = { r1: placement("r1"), a1: placement("a1"), b: placement("b") };

    drag("r1", 80, 40);

    const dx = placement("r1").x - before.r1.x;
    const dy = placement("r1").y - before.r1.y;
    expect(dx).toBeCloseTo(80 / zoom());
    expect(dy).toBeCloseTo(40 / zoom());
    expect(placement("a1").x - before.a1.x).toBeCloseTo(dx);
    expect(placement("b").y - before.b.y).toBeCloseTo(dy);
  });

  it("stores the dragged root as an absolute position", () => {
    openMap(SAMPLE);
    const before = placement("r1");

    drag("r1", 80, 40);

    const pinned = pinnedPosition(editor.getMap(), "r1");
    expect(pinned?.x).toBeCloseTo(before.x + 80 / zoom());
    expect(pinned?.y).toBeCloseTo(before.y + 40 / zoom());
  });

  it("keeps a pinned descendant at its offset from the parent when the ancestor is dragged", () => {
    const pinnedChild = buildMindMap([
      { id: "r1", text: "Root", parentId: null },
      { id: "a", text: "A", parentId: "r1" },
      { id: "a1", text: "A1", parentId: "a", state: { x: 70, y: -30 } },
    ]);
    openMap(pinnedChild);

    drag("a", 60, 30);

    expect(offsetFromParent("a1", "a")).toEqual({ x: 70, y: -30 });
  });

  it("reports one change for the whole drag, at the end", () => {
    openMap(SAMPLE);

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 20);
    moveBy(nodeElement("a"), 40);
    expect(host.onMapChanged).not.toHaveBeenCalled();
    up(nodeElement("a"), 40);

    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("undoes the whole move with a single undo", () => {
    openMap(SAMPLE);
    const before = placement("a");

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 20);
    moveBy(nodeElement("a"), 40, 10);
    up(nodeElement("a"), 40, 10);
    pressUndo();

    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
    expect(placement("a")).toEqual(before);
  });

  it("makes no history entry and no change when the drop is back at the starting point", () => {
    openMap(SAMPLE);

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 50);
    moveBy(nodeElement("a"), 0);
    up(nodeElement("a"), 0);

    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(host.onHistoryChanged).not.toHaveBeenCalled();
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("does not move or change anything for a tap-sized movement", () => {
    openMap(SAMPLE);

    drag("a", 8);

    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("starts moving for a movement just beyond 8 px", () => {
    openMap(SAMPLE);

    drag("a", 8.5);

    expect(pinnedPosition(editor.getMap(), "a")).toBeDefined();
  });

  it("puts the node back and records nothing when the pointer is cancelled", () => {
    openMap(SAMPLE);
    const before = placement("a");

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 80);
    fire(nodeElement("a"), "pointercancel", { x: 180, y: 100 });
    flushFrames();

    expect(placement("a")).toEqual(before);
    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("puts the node back when a second finger cancels the drag", () => {
    openMap(SAMPLE);
    const before = placement("a");

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 80);
    down(canvas(), { x: 300, y: 300 }, { id: 2, isPrimary: false });
    flushFrames();

    expect(placement("a")).toEqual(before);
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("pinches the canvas after a second finger cancelled the drag", () => {
    openMap(SAMPLE);
    down(nodeElement("a"));
    moveBy(nodeElement("a"), 80);
    down(canvas(), { x: 300, y: 100 }, { id: 2, isPrimary: false });
    const transformBefore = cameraTransform();

    fire(canvas(), "pointermove", { x: 400, y: 100 }, { id: 2, isPrimary: false }, 20);
    flushFrames();

    expect(cameraTransform()).not.toBe(transformBefore);
    expect(zoom()).toBeGreaterThan(0);
  });

  it("does not pan the canvas while a node is dragged", () => {
    openMap(SAMPLE);
    const transformBefore = cameraTransform();

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 80, 40);
    up(nodeElement("a"), 80, 40);

    expect(cameraTransform()).toBe(transformBefore);
  });

  it("still pans the canvas with a one-finger drag on empty canvas", () => {
    openMap(SAMPLE);
    const transformBefore = cameraTransform();

    down(canvas());
    moveBy(canvas(), 80, 40);
    up(canvas(), 80, 40);

    expect(cameraTransform()).not.toBe(transformBefore);
  });

  it("does not move a node on a long press followed by finger movement", () => {
    openMap(SAMPLE);

    down(nodeElement("a"));
    vi.advanceTimersByTime(500);
    moveBy(nodeElement("a"), 80);
    up(nodeElement("a"), 80);

    expect(host.showMenu).toHaveBeenCalledTimes(1);
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("does not move a node with the mouse while space is held", () => {
    openMap(SAMPLE);
    canvas().dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));

    drag("a", 80, 0, { kind: "mouse" });

    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("drops an unfinished drag when another map is loaded", () => {
    openMap(SAMPLE);
    down(nodeElement("a"));
    moveBy(nodeElement("a"), 80);

    openMap(SAMPLE);
    up(nodeElement("a"), 80);

    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });
});

describe("MapEditor getMap during a drag", () => {
  it("returns the committed map, not the preview, while the node is being dragged", () => {
    openMap(SAMPLE);
    const committed = editor.getMap();

    down(nodeElement("a"));
    moveBy(nodeElement("a"), 80);

    expect(editor.getMap()).toBe(committed);
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("leaves no preview position in a map saved mid-drag after the drag is cancelled", () => {
    openMap(SAMPLE);
    down(nodeElement("a"));
    moveBy(nodeElement("a"), 80);
    const savedMidDrag = editor.getMap();
    fire(nodeElement("a"), "pointercancel", { x: 180, y: 100 });
    flushFrames();

    expect(pinnedPosition(savedMidDrag, "a")).toBeUndefined();
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("returns the moved map once the drag ended", () => {
    openMap(SAMPLE);

    drag("a", 80);

    expect(pinnedPosition(editor.getMap(), "a")).toBeDefined();
  });
});

describe("MapEditor node drag persistence", () => {
  it("shows a moved node at the same place after its map is loaded again", () => {
    openMap(SAMPLE);
    const before = offsetFromParent("a", "r1");

    drag("a", 60, 30);
    openMap(editor.getMap());

    expect(offsetFromParent("a", "r1").x).toBeCloseTo(before.x + 60 / zoom());
    expect(offsetFromParent("a", "r1").y).toBeCloseTo(before.y + 30 / zoom());
  });
});

describe("MapEditor reset layout", () => {
  function choose(label: string): void {
    const item = host.showMenu.mock.calls[host.showMenu.mock.calls.length - 1]?.[0].find((candidate: MenuItem) => candidate.label === label);
    if (item === undefined) throw new Error(`no menu item ${label}`);
    item.onSelect();
    flushFrames();
  }

  function openNodeMenu(id: string): readonly string[] {
    host.showMenu.mockClear();
    nodeElement(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    flushFrames();
    return host.showMenu.mock.calls[host.showMenu.mock.calls.length - 1]?.[0].map((item) => item.label) ?? [];
  }

  it("offers the reset item before delete on a node that was moved", () => {
    openMap(SAMPLE);
    drag("a", 60);

    expect(openNodeMenu("a")).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Свернуть", "Сброс", "Удалить"]);
  });

  it("offers no reset item on a node that was not moved", () => {
    openMap(SAMPLE);
    drag("a", 60);

    expect(openNodeMenu("b")).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Удалить"]);
  });

  it("puts the node back to the auto-layout place when the reset item is chosen", () => {
    openMap(SAMPLE);
    const before = placement("a");
    drag("a", 60, 30);

    openNodeMenu("a");
    choose("Сброс");

    expect(placement("a")).toEqual(before);
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("undoes the reset with a single undo", () => {
    openMap(SAMPLE);
    drag("a", 60, 30);
    const moved = placement("a");

    openNodeMenu("a");
    choose("Сброс");
    pressUndo();

    expect(placement("a")).toEqual(moved);
  });

  it("resets only the selected node with the palette command", () => {
    openMap(SAMPLE);
    drag("a", 60);
    drag("b", 60);

    editor.resetSelectedNodeLayout();
    flushFrames();

    expect(pinnedPosition(editor.getMap(), "b")).toBeUndefined();
    expect(pinnedPosition(editor.getMap(), "a")).toBeDefined();
  });

  it("clears the positions of all non-roots but keeps the roots with the map command", () => {
    openMap(SAMPLE);
    drag("a", 60);
    drag("r1", 60);

    editor.resetMapLayout();
    flushFrames();

    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
    expect(pinnedPosition(editor.getMap(), "r1")).toBeDefined();
  });

  it("reports whether a node is selected", () => {
    openMap(SAMPLE);
    expect(editor.hasSelection()).toBe(false);

    drag("a", 60);

    expect(editor.hasSelection()).toBe(true);
  });
});

describe("MapEditor commands arriving while a node is dragged", () => {
  function pressKey(key: string): void {
    canvas().dispatchEvent(new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true }));
    flushFrames();
  }

  function startDragOfA(): void {
    down(nodeElement("a"), { x: 100, y: 100 }, { kind: "mouse" });
    moveBy(nodeElement("a"), 80, 0, { kind: "mouse" });
  }

  // The canvas captures the pointer, so the rest of the drag reaches it even if node "a" is gone.
  function finishDragOfA(): void {
    moveBy(canvas(), 120, 0, { kind: "mouse" });
    up(canvas(), 120, 0, { kind: "mouse" });
  }

  it("cancels the drag and undoes the previous move when undo is pressed mid-drag", () => {
    openMap(SAMPLE);
    const placementOfA = placement("a");
    drag("b", 60, 0, { kind: "mouse" });

    startDragOfA();
    pressUndo();
    finishDragOfA();

    expect(pinnedPosition(editor.getMap(), "b")).toBeUndefined();
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
    expect(placement("a")).toEqual(placementOfA);
  });

  it("cancels the drag before an undo from the toolbar", () => {
    openMap(SAMPLE);
    drag("b", 60, 0, { kind: "mouse" });

    startDragOfA();
    editor.undo();
    flushFrames();
    finishDragOfA();

    expect(pinnedPosition(editor.getMap(), "b")).toBeUndefined();
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("deletes the dragged node for good when Delete is pressed mid-drag", () => {
    openMap(SAMPLE);

    startDragOfA();
    pressKey("Delete");
    finishDragOfA();

    expect(editor.getMap().nodes.has("a")).toBe(false);
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("brings back the node without the preview position when that delete is undone", () => {
    openMap(SAMPLE);

    startDragOfA();
    pressKey("Delete");
    finishDragOfA();
    pressUndo();

    expect(editor.getMap().nodes.has("a")).toBe(true);
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });

  it("cancels the drag before the reset-map command runs", () => {
    openMap(SAMPLE);
    drag("b", 60, 0, { kind: "mouse" });

    startDragOfA();
    editor.resetMapLayout();
    finishDragOfA();

    expect(pinnedPosition(editor.getMap(), "b")).toBeUndefined();
    expect(pinnedPosition(editor.getMap(), "a")).toBeUndefined();
  });
});
