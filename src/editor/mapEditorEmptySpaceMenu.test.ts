// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { EMPTY_MIND_MAP, buildMindMap, getNode, readRootPosition } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./mapEditor";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const CANVAS_OFFSET = { left: 10, top: 20 };
const SAMPLE = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "r2", text: "Second root", parentId: null },
]);

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<(items: readonly MenuItem[], at: { x: number; y: number }) => void>;
  notify: Mock<(message: string) => void>;
}

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let pendingFrames: (() => void)[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  host = { onMapChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() };
  pendingFrames = [];
  editor = createEditor({});
});

afterEach(() => {
  editor.destroy();
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function createEditor(options: { addNodeLabel?: string; longPressSeconds?: number }): MapEditor {
  const created = new MapEditor({
    container,
    host,
    requestFrame: (callback) => pendingFrames.push(callback),
    ...options,
  });
  const element = canvas();
  element.setPointerCapture = vi.fn();
  element.getBoundingClientRect = () => ({ ...CANVAS_OFFSET }) as DOMRect;
  return created;
}

function canvas(): HTMLElement {
  const element = container.querySelector<HTMLElement>(".pinchmap-canvas");
  if (element === null) throw new Error("canvas not rendered");
  return element;
}

function flushFrames(): void {
  while (pendingFrames.length > 0) pendingFrames.shift()?.();
}

function openMap(map: MindMap): void {
  editor.loadMap(map);
  flushFrames();
}

function nodeElement(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`node element ${id} not rendered`);
  return element;
}

/** Dispatches a touch pointer event at a canvas-relative point. */
function touch(target: Element, type: string, at: { x: number; y: number }, timeStamp = 0): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "touch",
    clientX: at.x + CANVAS_OFFSET.left,
    clientY: at.y + CANVAS_OFFSET.top,
  });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  target.dispatchEvent(event);
}

function longPressAt(at: { x: number; y: number }, target: Element = canvas()): void {
  touch(target, "pointerdown", at);
  vi.advanceTimersByTime(500);
  touch(target, "pointerup", at, 600);
  flushFrames();
}

function rightClickAt(at: { x: number; y: number }, target: Element = canvas()): void {
  target.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: at.x + CANVAS_OFFSET.left,
      clientY: at.y + CANVAS_OFFSET.top,
    }),
  );
  flushFrames();
}

function doubleTapAt(at: { x: number; y: number }, target: Element = canvas()): void {
  touch(target, "pointerdown", at, 1000);
  touch(target, "pointerup", at, 1050);
  touch(target, "pointerdown", at, 1120);
  touch(target, "pointerup", at, 1170);
  flushFrames();
}

function panCanvasBy(dy: number): void {
  const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -dy });
  canvas().dispatchEvent(wheel);
  flushFrames();
}

function offeredMenu(callIndex = 0): { items: readonly MenuItem[]; at: { x: number; y: number } } {
  const call = host.showMenu.mock.calls[callIndex];
  if (call === undefined) throw new Error("no menu was shown");
  return { items: call[0], at: call[1] };
}

function chooseOnlyMenuItem(callIndex = 0): void {
  offeredMenu(callIndex).items[0]?.onSelect();
  flushFrames();
}

function textarea(): HTMLTextAreaElement {
  const element = container.querySelector("textarea");
  if (element === null) throw new Error("no text input is open");
  return element;
}

function typeAndCommit(text: string): void {
  const input = textarea();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
  flushFrames();
}

function selectedIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map(
    (element) => element.getAttribute("data-node-id") ?? "",
  );
}

function lastRootId(): string {
  const { rootIds } = editor.getMap();
  return rootIds[rootIds.length - 1] ?? "";
}

describe("MapEditor menu on empty space", () => {
  it("offers a single add-node item after a long press on empty canvas", () => {
    openMap(SAMPLE);

    longPressAt({ x: 140, y: 240 });

    expect(host.showMenu).toHaveBeenCalledTimes(1);
    expect(offeredMenu().items.map((item) => item.label)).toEqual(["Add node"]);
  });

  it("uses the configured add-node label", () => {
    editor.destroy();
    container.replaceChildren();
    editor = createEditor({ addNodeLabel: "Добавить ноду" });
    openMap(SAMPLE);

    longPressAt({ x: 140, y: 240 });

    expect(offeredMenu().items.map((item) => item.label)).toEqual(["Добавить ноду"]);
  });

  it("shows the menu at the pressed screen point", () => {
    openMap(SAMPLE);

    longPressAt({ x: 140, y: 240 });

    expect(offeredMenu().at).toEqual({ x: 150, y: 260 });
  });

  it("offers the same menu after a right click on empty canvas", () => {
    openMap(SAMPLE);

    rightClickAt({ x: 140, y: 240 });

    expect(offeredMenu().items.map((item) => item.label)).toEqual(["Add node"]);
    expect(offeredMenu().at).toEqual({ x: 150, y: 260 });
  });

  it("opens no menu on a right click over a node", () => {
    openMap(SAMPLE);

    rightClickAt({ x: 5, y: 5 }, nodeElement("r1"));

    expect(host.showMenu).not.toHaveBeenCalled();
  });

  it("opens no menu when the press is shorter than the long press duration", () => {
    openMap(SAMPLE);

    touch(canvas(), "pointerdown", { x: 140, y: 240 });
    vi.advanceTimersByTime(400);
    touch(canvas(), "pointerup", { x: 140, y: 240 }, 400);

    expect(host.showMenu).not.toHaveBeenCalled();
  });

  it("opens no menu when the finger moves farther than 8 px first", () => {
    openMap(SAMPLE);

    touch(canvas(), "pointerdown", { x: 140, y: 240 });
    touch(canvas(), "pointermove", { x: 160, y: 240 }, 100);
    vi.advanceTimersByTime(1000);

    expect(host.showMenu).not.toHaveBeenCalled();
  });

  it("opens no menu on a long press over a node", () => {
    openMap(SAMPLE);

    longPressAt({ x: 5, y: 5 }, nodeElement("r1"));

    expect(host.showMenu).not.toHaveBeenCalled();
  });

  it("uses the long press duration set at runtime in seconds", () => {
    openMap(SAMPLE);
    editor.setLongPressSeconds(1.5);

    touch(canvas(), "pointerdown", { x: 140, y: 240 });
    vi.advanceTimersByTime(1499);
    expect(host.showMenu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(host.showMenu).toHaveBeenCalledTimes(1);
  });

  it("uses the long press duration given at construction", () => {
    editor.destroy();
    container.replaceChildren();
    editor = createEditor({ longPressSeconds: 0.2 });
    openMap(SAMPLE);

    touch(canvas(), "pointerdown", { x: 140, y: 240 });
    vi.advanceTimersByTime(200);

    expect(host.showMenu).toHaveBeenCalledTimes(1);
  });
});

describe("MapEditor adding a root from the menu", () => {
  it("creates a last root at the map point under the press", () => {
    openMap(SAMPLE);
    longPressAt({ x: 140, y: 240 });

    chooseOnlyMenuItem();
    typeAndCommit("Fresh");

    expect(editor.getMap().rootIds).toHaveLength(3);
    expect(readRootPosition(getNode(editor.getMap(), lastRootId()).state)).toEqual({ x: 100, y: 200 });
  });

  it("selects the new root and opens it for text input", () => {
    openMap(SAMPLE);
    rightClickAt({ x: 140, y: 240 });

    chooseOnlyMenuItem();

    const [newId] = selectedIds();
    expect(selectedIds()).toHaveLength(1);
    expect(SAMPLE.nodes.has(newId ?? "")).toBe(false);
    expect(editor.isEditingText()).toBe(true);
    expect(nodeElement(newId ?? "").contains(textarea())).toBe(true);
  });

  it("keeps the typed text and reports exactly one change", () => {
    openMap(SAMPLE);
    rightClickAt({ x: 140, y: 240 });
    chooseOnlyMenuItem();

    typeAndCommit("Fresh");

    expect(getNode(editor.getMap(), lastRootId()).text).toBe("Fresh");
    expect(readRootPosition(getNode(editor.getMap(), lastRootId()).state)).toEqual({ x: 100, y: 200 });
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("places the root where the menu was invoked even if the canvas is panned before choosing", () => {
    openMap(SAMPLE);
    rightClickAt({ x: 140, y: 240 });

    panCanvasBy(50);
    chooseOnlyMenuItem();
    typeAndCommit("Fresh");

    expect(readRootPosition(getNode(editor.getMap(), lastRootId()).state)).toEqual({ x: 100, y: 200 });
  });

  it("sees the panned canvas when the menu is invoked again at the same screen point", () => {
    openMap(SAMPLE);
    panCanvasBy(50);

    rightClickAt({ x: 140, y: 240 });
    chooseOnlyMenuItem();
    typeAndCommit("Fresh");

    expect(readRootPosition(getNode(editor.getMap(), lastRootId()).state)).toEqual({ x: 100, y: 150 });
  });

  it("rounds the map point to whole numbers", () => {
    openMap(SAMPLE);
    rightClickAt({ x: 140.6, y: 240.4 });

    chooseOnlyMenuItem();
    typeAndCommit("Fresh");

    expect(readRootPosition(getNode(editor.getMap(), lastRootId()).state)).toEqual({ x: 101, y: 200 });
  });

  it("creates the first root on an empty canvas", () => {
    openMap(EMPTY_MIND_MAP);
    rightClickAt({ x: 90, y: 90 });

    chooseOnlyMenuItem();
    typeAndCommit("First");

    expect(editor.getMap().rootIds).toHaveLength(1);
    expect(getNode(editor.getMap(), lastRootId())).toMatchObject({ text: "First", parentId: null });
    expect(readRootPosition(getNode(editor.getMap(), lastRootId()).state)).toEqual({ x: 50, y: 50 });
  });

  it("leaves existing nodes untouched", () => {
    openMap(SAMPLE);
    rightClickAt({ x: 140, y: 240 });

    chooseOnlyMenuItem();
    typeAndCommit("Fresh");

    for (const [id, node] of SAMPLE.nodes) expect(getNode(editor.getMap(), id)).toEqual(node);
  });

  it("discards the new root and reports no change when the text stays empty", () => {
    openMap(SAMPLE);
    rightClickAt({ x: 140, y: 240 });
    chooseOnlyMenuItem();

    typeAndCommit("");

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("restores the earlier selection when the new root is discarded", () => {
    openMap(SAMPLE);
    touch(nodeElement("a"), "pointerdown", { x: 5, y: 5 });
    touch(nodeElement("a"), "pointerup", { x: 5, y: 5 }, 50);
    rightClickAt({ x: 140, y: 240 });
    chooseOnlyMenuItem();

    typeAndCommit("");

    expect(selectedIds()).toEqual(["a"]);
  });
});

describe("MapEditor double tap", () => {
  it("creates a root at the tapped point and opens it for text input", () => {
    openMap(SAMPLE);

    doubleTapAt({ x: 140, y: 240 });

    const [newId] = selectedIds();
    expect(editor.isEditingText()).toBe(true);
    expect(nodeElement(newId ?? "").contains(textarea())).toBe(true);
    typeAndCommit("Fresh");
    expect(editor.getMap().rootIds).toEqual(["r1", "r2", newId]);
    expect(readRootPosition(getNode(editor.getMap(), lastRootId()).state)).toEqual({ x: 100, y: 200 });
  });

  it("does not open the menu for a double tap", () => {
    openMap(SAMPLE);

    doubleTapAt({ x: 140, y: 240 });

    expect(host.showMenu).not.toHaveBeenCalled();
  });

  it("discards the double-tap root when it is committed empty", () => {
    openMap(SAMPLE);
    doubleTapAt({ x: 140, y: 240 });

    typeAndCommit("");

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("edits the node instead of adding a root when the double tap is on a node", () => {
    openMap(SAMPLE);

    doubleTapAt({ x: 5, y: 5 }, nodeElement("a"));

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
    expect(selectedIds()).toEqual(["a"]);
    expect(nodeElement("a").contains(textarea())).toBe(true);
  });

  it("adds no root for a single tap on empty canvas", () => {
    openMap(SAMPLE);

    touch(canvas(), "pointerdown", { x: 140, y: 240 }, 1000);
    touch(canvas(), "pointerup", { x: 140, y: 240 }, 1050);
    flushFrames();

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
    expect(editor.isEditingText()).toBe(false);
  });
});

describe("MapEditor after destroy", () => {
  it("shows no menu for a long press that was pending when the editor was destroyed", () => {
    openMap(SAMPLE);
    touch(canvas(), "pointerdown", { x: 140, y: 240 });

    editor.destroy();
    vi.advanceTimersByTime(1000);

    expect(host.showMenu).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("creates no root for a double tap on the detached canvas", () => {
    openMap(SAMPLE);
    const detachedCanvas = canvas();
    editor.destroy();

    doubleTapAt({ x: 140, y: 240 }, detachedCanvas);

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
    expect(editor.isEditingText()).toBe(false);
  });

  it("can be destroyed twice without error", () => {
    editor.destroy();

    expect(() => editor.destroy()).not.toThrow();
  });
});
