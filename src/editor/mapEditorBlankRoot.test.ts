// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onHistoryChanged: Mock<(canUndo: boolean, canRedo: boolean) => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<() => void>;
  notify: Mock<(message: string) => void>;
}

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let pendingFrames: (() => void)[];
let clock = 0;

const TREE = buildMindMap([
  { id: "r1", text: "Root", parentId: null, state: { color: "red" } },
  { id: "a", text: "A", parentId: "r1" },
]);

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  host = { onMapChanged: vi.fn(), onHistoryChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() };
  pendingFrames = [];
  editor = new MapEditor({ container, host, requestFrame: (callback) => pendingFrames.push(callback) });
  canvas().setPointerCapture = vi.fn();
});

afterEach(() => {
  editor.destroy();
  container.remove();
  vi.unstubAllGlobals();
});

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
  host.onMapChanged.mockClear();
  host.onHistoryChanged.mockClear();
}

function nodeElement(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`node element ${id} not rendered`);
  return element;
}

function touch(target: Element, type: string, timeStamp: number): void {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch" });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  target.dispatchEvent(event);
}

function tapOn(target: Element): void {
  clock += 1000;
  touch(target, "pointerdown", clock);
  touch(target, "pointerup", clock + 50);
  flushFrames();
}

function doubleTapOn(target: Element): void {
  clock += 1000;
  touch(target, "pointerdown", clock);
  touch(target, "pointerup", clock + 50);
  touch(target, "pointerdown", clock + 120);
  touch(target, "pointerup", clock + 170);
  flushFrames();
}

function press(key: string, target: EventTarget = canvas(), modifiers: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
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
  press("Enter", input, { ctrlKey: true });
}

function selectedIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map((element) => element.dataset.nodeId ?? "");
}

function texts(): string[] {
  return [...editor.getMap().nodes.values()].map((node) => node.text);
}

function lastHistoryReport(): [boolean, boolean] | undefined {
  return host.onHistoryChanged.mock.calls[host.onHistoryChanged.mock.calls.length - 1];
}

describe("MapEditor deleting everything", () => {
  it("leaves the deleted root as one blank node that is selected and not open for typing", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));

    press("Delete");

    expect(editor.getMap().rootIds).toEqual(["r1"]);
    expect(texts()).toEqual([""]);
    expect(selectedIds()).toEqual(["r1"]);
    expect(editor.isEditingText()).toBe(false);
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("renders the blank root", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));

    press("Delete");

    expect([...container.querySelectorAll(".pinchmap-node")]).toHaveLength(1);
  });

  it("reports one change for the deletion", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));

    press("Delete");

    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("does nothing more when Delete is pressed on the blank root", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));
    press("Delete");
    host.onMapChanged.mockClear();

    press("Delete");

    expect(texts()).toEqual([""]);
    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(selectedIds()).toEqual(["r1"]);
  });

  it("brings the whole tree back, with its colour, on undo", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));
    press("Delete");

    editor.undo();

    expect(editor.getMap()).toEqual(TREE);
  });

  it("makes the map blank again on redo", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));
    press("Delete");
    editor.undo();

    editor.redo();

    expect(editor.getMap().rootIds).toEqual(["r1"]);
    expect(texts()).toEqual([""]);
  });

  it("lets the blank root be typed into and undone back to blank", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));
    press("Delete");
    editor.beginEditingNode("r1");

    typeAndCommit("Fresh start");
    expect(texts()).toEqual(["Fresh start"]);
    editor.undo();

    expect(texts()).toEqual([""]);
  });

  it("enables undo and not redo after the deletion", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));

    press("Delete");

    expect(lastHistoryReport()).toEqual([true, false]);
  });
});

describe("MapEditor creating the first node of an empty map", () => {
  it("keeps a root left empty as the blank root of the map", () => {
    openMap(buildMindMap([]));

    doubleTapOn(canvas());
    typeAndCommit("");

    expect(editor.getMap().nodes.size).toBe(1);
    expect(texts()).toEqual([""]);
    expect(selectedIds()).toHaveLength(1);
  });

  it("still discards an empty new node when the map had nodes before", () => {
    openMap(TREE);

    doubleTapOn(canvas());
    typeAndCommit("");

    expect(editor.getMap()).toEqual(TREE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("keeps the typed text of a first node", () => {
    openMap(buildMindMap([]));

    doubleTapOn(canvas());
    typeAndCommit("Hello");

    expect(texts()).toEqual(["Hello"]);
  });
});
