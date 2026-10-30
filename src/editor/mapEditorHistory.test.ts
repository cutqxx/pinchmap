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

const SAMPLE = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "b", text: "B", parentId: "r1" },
  { id: "c", text: "C", parentId: "r1" },
  { id: "r2", text: "Second root", parentId: null },
]);

const BRANCHY = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1", state: { side: "right", custom: 5 } },
  { id: "a1", text: "A1", parentId: "a", state: { x: 10, y: 20 } },
  { id: "a2", text: "A2", parentId: "a" },
  { id: "b", text: "B", parentId: "r1", state: { side: "left" } },
  { id: "c", text: "C", parentId: "r1" },
]);

beforeEach(() => {
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

function touch(target: Element, type: string, pointerId: number, timeStamp: number): void {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "touch" });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  target.dispatchEvent(event);
}

function tapOn(target: Element): void {
  clock += 1000;
  touch(target, "pointerdown", 1, clock);
  touch(target, "pointerup", 1, clock + 50);
  flushFrames();
}

function doubleTapOn(target: Element): void {
  clock += 1000;
  touch(target, "pointerdown", 1, clock);
  touch(target, "pointerup", 1, clock + 50);
  touch(target, "pointerdown", 1, clock + 120);
  touch(target, "pointerup", 1, clock + 170);
  flushFrames();
}

function tapWithFingers(count: number): void {
  clock += 1000;
  const fingers = Array.from({ length: count }, (_, index) => index + 1);
  fingers.forEach((id) => touch(canvas(), "pointerdown", id, clock));
  fingers.forEach((id) => touch(canvas(), "pointerup", id, clock + 100));
  flushFrames();
}

function press(key: string, target: EventTarget = canvas(), modifiers: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
  flushFrames();
}

function pressUndo(): void {
  press("z", canvas(), { ctrlKey: true, code: "KeyZ" });
}

function pressRedo(): void {
  press("Z", canvas(), { ctrlKey: true, shiftKey: true, code: "KeyZ" });
}

function textarea(): HTMLTextAreaElement {
  const element = container.querySelector("textarea");
  if (element === null) throw new Error("no text input is open");
  return element;
}

function typeText(text: string): void {
  const input = textarea();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function typeAndCommit(text: string): void {
  typeText(text);
  press("Enter", textarea(), { ctrlKey: true });
}

function selectedIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map(
    (element) => element.getAttribute("data-node-id") ?? "",
  );
}

function textOf(id: string): string | undefined {
  return editor.getMap().nodes.get(id)?.text;
}

function lastHistoryReport(): [boolean, boolean] | undefined {
  return host.onHistoryChanged.mock.calls[host.onHistoryChanged.mock.calls.length - 1];
}

function selectAndDelete(id: string): void {
  tapOn(nodeElement(id));
  press("Delete");
}

describe("MapEditor undoing a delete", () => {
  it("restores the whole branch with the same ids, list position and node state", () => {
    openMap(BRANCHY);
    selectAndDelete("a");

    editor.undo();

    expect(editor.getMap()).toEqual(BRANCHY);
  });

  it("puts the restored branch back in its original place among siblings", () => {
    openMap(BRANCHY);
    selectAndDelete("a");

    editor.undo();

    expect(editor.getMap().nodes.get("r1")?.childIds).toEqual(["a", "b", "c"]);
  });

  it("renders the restored branch", () => {
    openMap(BRANCHY);
    selectAndDelete("a");

    editor.undo();
    flushFrames();

    expect([...container.querySelectorAll(".pinchmap-node")]).toHaveLength(BRANCHY.nodes.size);
  });

  it("deletes the branch again on redo", () => {
    openMap(BRANCHY);
    selectAndDelete("a");
    const afterDelete = editor.getMap();
    editor.undo();

    editor.redo();

    expect(editor.getMap()).toEqual(afterDelete);
  });

  it("undoes the deletion of a root with its position in the root list", () => {
    openMap(SAMPLE);
    selectAndDelete("r1");

    editor.undo();

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
  });
});

describe("MapEditor undoing text edits", () => {
  it("undoes a text edit of an existing node in one step", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    typeText("Al");
    typeText("Alp");
    typeAndCommit("Alpha");

    editor.undo();

    expect(textOf("a")).toBe("A");
  });

  it("redoes the whole text session in one step", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    typeText("Al");
    typeAndCommit("Alpha");
    editor.undo();

    editor.redo();

    expect(textOf("a")).toBe("Alpha");
  });

  it("undoes a new node together with its text in one step", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");
    typeAndCommit("Fresh");

    editor.undo();

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("brings the new node and its text back on redo", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");
    typeAndCommit("Fresh");
    editor.undo();

    editor.redo();

    const texts = [...editor.getMap().nodes.values()].map((node) => node.text);
    expect(texts).toContain("Fresh");
    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size + 1);
  });

  it("leaves no history entry for a new node left empty, so undo reverts the earlier action", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    tapOn(nodeElement("a"));
    press("Enter");
    typeAndCommit("");

    editor.undo();

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("does not enable undo for a new node left empty on a fresh map", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Enter");
    typeAndCommit("");

    editor.undo();

    expect(editor.getMap()).toEqual(SAMPLE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("commits a pending text edit first and then undoes it", () => {
    openMap(SAMPLE);
    selectAndDelete("c");
    doubleTapOn(nodeElement("a"));
    typeText("Pending");

    editor.undo();

    expect(textOf("a")).toBe("A");
    expect(editor.getMap().nodes.has("c")).toBe(false);
    expect(editor.isEditingText()).toBe(false);
  });

  it("discards an open empty new node on undo without undoing the earlier change", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    typeAndCommit("Changed");
    tapOn(nodeElement("a"));
    press("Enter");

    editor.undo();

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(textOf("a")).toBe("Changed");
    expect(editor.isEditingText()).toBe(false);

    editor.undo();

    expect(textOf("a")).toBe("A");
  });

  it.each(["   ", "\n \n"])("discards an open new node holding only whitespace %j on undo and keeps the earlier change", (blank) => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    typeAndCommit("Changed");
    tapOn(nodeElement("a"));
    press("Enter");
    typeText(blank);

    editor.undo();

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(textOf("a")).toBe("Changed");
  });

  it("removes a new node with uncommitted typed text in a single undo", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");
    typeText("Typed");

    editor.undo();

    expect(editor.getMap()).toEqual(SAMPLE);
    expect(editor.isEditingText()).toBe(false);
  });

  it("discards an open empty new node on redo and then redoes", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    typeAndCommit("Changed");
    editor.undo();
    tapOn(nodeElement("a"));
    press("Enter");

    editor.redo();

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(textOf("a")).toBe("Changed");
  });

  it("keeps the committed pending edit redoable", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    typeText("Pending");
    editor.undo();

    editor.redo();

    expect(textOf("a")).toBe("Pending");
  });

  it("commits a pending new node's text first when redo is requested", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");
    typeText("Typed");

    editor.redo();

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size + 1);
    expect(editor.isEditingText()).toBe(false);
  });
});

describe("MapEditor redo availability", () => {
  it("clears redo when a new action follows an undo", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    editor.undo();
    selectAndDelete("c");

    editor.redo();

    expect(editor.getMap().nodes.has("b")).toBe(true);
    expect(editor.getMap().nodes.has("c")).toBe(false);
    expect(lastHistoryReport()).toEqual([true, false]);
  });

  it("does nothing on undo with an empty history", () => {
    openMap(SAMPLE);

    editor.undo();

    expect(editor.getMap()).toEqual(SAMPLE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("does nothing on redo with an empty redo stack", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    host.onMapChanged.mockClear();

    editor.redo();

    expect(editor.getMap().nodes.has("b")).toBe(false);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });
});

describe("MapEditor onHistoryChanged", () => {
  it("reports no undo and no redo after a map is loaded", () => {
    editor.loadMap(SAMPLE);

    expect(lastHistoryReport()).toEqual([false, false]);
  });

  it("reports canUndo after an edit", () => {
    openMap(SAMPLE);

    selectAndDelete("b");

    expect(lastHistoryReport()).toEqual([true, false]);
  });

  it("reports canRedo and no undo after undoing the only step", () => {
    openMap(SAMPLE);
    selectAndDelete("b");

    editor.undo();

    expect(lastHistoryReport()).toEqual([false, true]);
  });

  it("reports both in the middle of the history", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    selectAndDelete("c");

    editor.undo();

    expect(lastHistoryReport()).toEqual([true, true]);
  });

  it("reports no redo after redoing the last undone step", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    editor.undo();

    editor.redo();

    expect(lastHistoryReport()).toEqual([true, false]);
  });

  it("reports a committed new node as an undoable step", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");
    typeAndCommit("Fresh");

    expect(lastHistoryReport()).toEqual([true, false]);
  });

  it("does not report a change when a new node is discarded for empty text", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Enter");
    typeAndCommit("");

    expect(host.onHistoryChanged).not.toHaveBeenCalled();
  });
});

describe("MapEditor undo and redo notifications", () => {
  it("calls onMapChanged once for an undo", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    host.onMapChanged.mockClear();

    editor.undo();

    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("calls onMapChanged once for a redo", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    editor.undo();
    host.onMapChanged.mockClear();

    editor.redo();

    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });
});

describe("MapEditor reloading from outside", () => {
  it("clears the history and reports neither undo nor redo", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    selectAndDelete("c");
    editor.undo();

    editor.loadMap(SAMPLE);

    expect(lastHistoryReport()).toEqual([false, false]);
  });

  it("makes undo a no-op after the reload", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    const reloaded = buildMindMap([{ id: "x", text: "External", parentId: null }]);
    editor.loadMap(reloaded);

    editor.undo();
    editor.redo();

    expect(editor.getMap()).toEqual(reloaded);
  });
});

describe("MapEditor selection after undo and redo", () => {
  it("keeps the selection when the selected node still exists", () => {
    openMap(SAMPLE);
    selectAndDelete("c");
    tapOn(nodeElement("a"));

    editor.undo();
    flushFrames();

    expect(selectedIds()).toEqual(["a"]);
  });

  it("clears the selection when undo removes the selected node", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");
    typeAndCommit("Fresh");

    editor.undo();
    flushFrames();

    expect(selectedIds()).toEqual([]);
  });

  it("clears the selection when redo removes the selected node", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    editor.undo();
    flushFrames();
    tapOn(nodeElement("b"));

    editor.redo();
    flushFrames();

    expect(selectedIds()).toEqual([]);
  });

  it("keeps a selection that survives a redo", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    editor.undo();
    tapOn(nodeElement("a"));

    editor.redo();
    flushFrames();

    expect(selectedIds()).toEqual(["a"]);
  });

  it("does not select anything when nothing was selected", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    tapOn(canvas());

    editor.undo();
    flushFrames();

    expect(selectedIds()).toEqual([]);
  });
});

describe("MapEditor undo and redo intents", () => {
  it("undoes on Ctrl+Z on the canvas", () => {
    openMap(SAMPLE);
    selectAndDelete("b");

    pressUndo();

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("undoes on Meta+Z on the canvas", () => {
    openMap(SAMPLE);
    selectAndDelete("b");

    press("z", canvas(), { metaKey: true, code: "KeyZ" });

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("redoes on Ctrl+Shift+Z on the canvas", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    pressUndo();

    pressRedo();

    expect(editor.getMap().nodes.has("b")).toBe(false);
  });

  it("redoes on Ctrl+Y on the canvas", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    pressUndo();

    press("y", canvas(), { ctrlKey: true, code: "KeyY" });

    expect(editor.getMap().nodes.has("b")).toBe(false);
  });

  it("undoes with a Russian keyboard layout", () => {
    openMap(SAMPLE);
    selectAndDelete("b");

    press("я", canvas(), { ctrlKey: true, code: "KeyZ" });

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("ignores Ctrl+Z inside the textarea so the browser edits the text", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    doubleTapOn(nodeElement("a"));

    press("z", textarea(), { ctrlKey: true, code: "KeyZ" });

    expect(editor.getMap().nodes.has("b")).toBe(false);
    expect(editor.isEditingText()).toBe(true);
  });

  it("undoes on a two-finger tap", () => {
    openMap(SAMPLE);
    selectAndDelete("b");

    tapWithFingers(2);

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("redoes on a three-finger tap", () => {
    openMap(SAMPLE);
    selectAndDelete("b");
    tapWithFingers(2);

    tapWithFingers(3);

    expect(editor.getMap().nodes.has("b")).toBe(false);
  });

  it("commits a pending text edit before a two-finger tap undoes", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    typeText("Pending");

    tapWithFingers(2);

    expect(textOf("a")).toBe("A");
    expect(editor.isEditingText()).toBe(false);
  });
});
