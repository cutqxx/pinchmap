// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, getNode, readRootPosition } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

let container: HTMLElement;
let editor: MapEditor;
let host: { onMapChanged: Mock<() => void>; onTextEditEnded: Mock<() => void>; showMenu: Mock<() => void>; notify: Mock<(message: string) => void> };
let pendingFrames: (() => void)[];

const SAMPLE = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "b", text: "B", parentId: "r1" },
  { id: "c", text: "C", parentId: "r1" },
  { id: "r2", text: "Second root", parentId: null },
]);

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  host = { onMapChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() };
  pendingFrames = [];
  editor = new MapEditor({ container, host, requestFrame: (callback) => pendingFrames.push(callback) });
});

afterEach(() => {
  editor.destroy();
  container.remove();
  vi.unstubAllGlobals();
});

function flushFrames(): void {
  while (pendingFrames.length > 0) pendingFrames.shift()?.();
}

function openMap(map: MindMap): void {
  editor.loadMap(map);
  flushFrames();
}

function press(key: string, target: EventTarget, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  target.dispatchEvent(event);
  flushFrames();
  return event;
}

function pointer(target: Element, type: string, timeStamp: number): void {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch" });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  target.dispatchEvent(event);
}

function doubleTapOnCanvas(): void {
  const canvas = container.querySelector<HTMLElement>(".pinchmap-canvas");
  if (canvas === null) throw new Error("canvas not rendered");
  canvas.setPointerCapture = vi.fn();
  pointer(canvas, "pointerdown", 1000);
  pointer(canvas, "pointerup", 1050);
  pointer(canvas, "pointerdown", 1120);
  pointer(canvas, "pointerup", 1170);
  flushFrames();
}

function pressOnCanvas(key: string): void {
  const canvas = container.querySelector<HTMLElement>(".pinchmap-canvas");
  if (canvas === null) throw new Error("canvas not rendered");
  press(key, canvas);
}

function textarea(): HTMLTextAreaElement {
  const element = container.querySelector("textarea");
  if (element === null) throw new Error("no text input is open");
  return element;
}

function type(text: string): void {
  const input = textarea();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  flushFrames();
}

function selectedIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map(
    (element) => element.getAttribute("data-node-id") ?? "",
  );
}

function renderedNodeCount(): number {
  return container.querySelectorAll(".pinchmap-node").length;
}

function editedNodeId(): string {
  const id = textarea().closest(".pinchmap-node")?.getAttribute("data-node-id");
  if (id == null) throw new Error("text input is not inside a node");
  return id;
}

function startEditing(nodeId: string): void {
  openMap(SAMPLE);
  editor.beginEditingNode(nodeId);
  flushFrames();
}

function textOf(nodeId: string): string {
  return getNode(editor.getMap(), nodeId).text;
}

const ENDING_WITH_NEW_NODE: [string, string, KeyboardEventInit][] = [
  ["Tab", "Tab", {}],
  ["Ctrl+Enter", "Enter", { ctrlKey: true }],
  ["Cmd+Enter", "Enter", { metaKey: true }],
];

describe("MapEditor Tab while editing text", () => {
  it("commits the typed text", () => {
    startEditing("a");
    type("Alpha");

    press("Tab", textarea());

    expect(textOf("a")).toBe("Alpha");
  });

  it("opens a new last child of the edited node for text input", () => {
    startEditing("a");
    type("Alpha");

    press("Tab", textarea());

    expect(renderedNodeCount()).toBe(SAMPLE.nodes.size + 1);
    const newId = editedNodeId();
    expect(newId).not.toBe("a");
    expect(selectedIds()).toEqual([newId]);
    type("Child");
    press("Escape", textarea());
    expect(getNode(editor.getMap(), "a").childIds).toEqual([newId]);
    expect(textOf(newId)).toBe("Child");
  });

  it("closes the previous input so only one is open", () => {
    startEditing("a");

    press("Tab", textarea());

    expect(container.querySelectorAll("textarea")).toHaveLength(1);
  });
});

describe("MapEditor Ctrl/Cmd+Enter while editing text", () => {
  it.each(ENDING_WITH_NEW_NODE.slice(1))("commits the typed text on %s", (_label, key, modifiers) => {
    startEditing("a");
    type("Alpha");

    press(key, textarea(), modifiers);

    expect(textOf("a")).toBe("Alpha");
  });

  it.each(ENDING_WITH_NEW_NODE.slice(1))(
    "opens a new sibling right after the edited node on %s",
    (_label, key, modifiers) => {
      startEditing("a");
      type("Alpha");

      press(key, textarea(), modifiers);

      expect(renderedNodeCount()).toBe(SAMPLE.nodes.size + 1);
      const newId = editedNodeId();
      type("Sibling");
      press("Escape", textarea());
      expect(getNode(editor.getMap(), "r1").childIds).toEqual(["a", newId, "b", "c"]);
      expect(textOf(newId)).toBe("Sibling");
    },
  );

  it.each(ENDING_WITH_NEW_NODE.slice(1))(
    "opens a new root right below an edited root on %s",
    (_label, key, modifiers) => {
      startEditing("r1");

      press(key, textarea(), modifiers);

      const newId = editedNodeId();
      type("New root");
      press("Escape", textarea());
      const { rootIds } = editor.getMap();
      expect(rootIds).toEqual(["r1", newId, "r2"]);
      expect(getNode(editor.getMap(), newId).parentId).toBeNull();
    },
  );
});

describe("MapEditor Enter while editing text", () => {
  it.each([{}, { shiftKey: true }])("keeps editing and opens no new node on Enter %o", (modifiers) => {
    startEditing("a");
    type("Alpha");

    const event = press("Enter", textarea(), modifiers);

    expect(event.defaultPrevented).toBe(false);
    expect(editor.isEditingText()).toBe(true);
    expect(editedNodeId()).toBe("a");
    expect(renderedNodeCount()).toBe(SAMPLE.nodes.size);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });
});

describe("MapEditor Escape while editing text", () => {
  it("commits the text, opens no node and stops editing", () => {
    startEditing("a");
    type("Alpha");

    press("Escape", textarea());

    expect(textOf("a")).toBe("Alpha");
    expect(editor.isEditingText()).toBe(false);
    expect(container.querySelector("textarea")).toBeNull();
    expect(renderedNodeCount()).toBe(SAMPLE.nodes.size);
  });
});

describe("MapEditor shortcuts on an empty new node", () => {
  it.each(ENDING_WITH_NEW_NODE)("discards it on %s and opens no new node", (_label, key, modifiers) => {
    startEditing("a");
    press("Escape", textarea());
    pressOnCanvas("Tab");
    expect(renderedNodeCount()).toBe(SAMPLE.nodes.size + 1);

    press(key, textarea(), modifiers);

    expect(renderedNodeCount()).toBe(SAMPLE.nodes.size);
    expect(editor.isEditingText()).toBe(false);
    expect(container.querySelector("textarea")).toBeNull();
    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
  });
});

describe("MapEditor undo after a shortcut that opens a new node", () => {
  it("undoes the new node first and the earlier text change second", () => {
    startEditing("a");
    type("Alpha");
    press("Tab", textarea());
    type("Child");
    press("Escape", textarea());

    editor.undo();

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(textOf("a")).toBe("Alpha");

    editor.undo();

    expect(textOf("a")).toBe("A");
  });
});

describe("MapEditor side of a child opened with Tab", () => {
  it("opens a child of the root on the lighter side", () => {
    openMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "a", text: "A", parentId: "r1", state: { side: "right" } },
        { id: "b", text: "B", parentId: "r1", state: { side: "right" } },
      ]),
    );
    editor.beginEditingNode("r1");
    flushFrames();

    press("Tab", textarea());

    const newId = editedNodeId();
    type("Left one");
    press("Escape", textarea());
    expect(getNode(editor.getMap(), newId).state).toMatchObject({ side: "left" });
  });
});

describe("MapEditor layout used for the node opened by a shortcut", () => {
  it("places a new root below the height of the text committed by the same keystroke", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return 20 * (this.textContent ?? "").split("\n").length;
    });
    openMap(buildMindMap([{ id: "r1", text: "Root", parentId: null, state: { x: 2000, y: 0 } }]));
    editor.beginEditingNode("r1");
    flushFrames();
    textarea().value = "one\ntwo\nthree";
    textarea().dispatchEvent(new Event("input", { bubbles: true }));

    press("Enter", textarea(), { ctrlKey: true });

    const newId = editedNodeId();
    type("Next");
    press("Escape", textarea());
    expect(readRootPosition(getNode(editor.getMap(), newId).state)).toEqual({ x: 2000, y: 108 });
  });
});

describe("MapEditor Tab on the kept blank first root", () => {
  it("opens a child of that root for input", () => {
    openMap(buildMindMap([]));
    doubleTapOnCanvas();

    press("Tab", textarea());

    const childId = editedNodeId();
    type("Child");
    press("Escape", textarea());
    const [rootId = ""] = editor.getMap().rootIds;
    expect(childId).not.toBe(rootId);
    expect(getNode(editor.getMap(), rootId).childIds).toEqual([childId]);
  });
});
