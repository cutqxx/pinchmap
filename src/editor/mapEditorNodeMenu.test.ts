// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, getNode } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./mapEditor";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const CANVAS_OFFSET = { left: 10, top: 20 };
const LABELS = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", color: "Цвет", noColor: "Без цвета", colorNames: { red: "Красный", orange: "Оранжевый", yellow: "Жёлтый", green: "Зелёный", cyan: "Бирюзовый", purple: "Фиолетовый" }, copy: "Копировать", paste: "Вставить", duplicate: "Дублировать", collapse: "Свернуть", expand: "Развернуть", resetLayout: "Сброс", delete: "Удалить" };
const SAMPLE = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r1" },
  { id: "c", text: "C", parentId: "r1" },
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
  editor = new MapEditor({
    container,
    host,
    requestFrame: (callback) => pendingFrames.push(callback),
    nodeMenuLabels: LABELS,
    addNodeLabel: "Добавить ноду",
  });
  const element = canvas();
  element.setPointerCapture = vi.fn();
  element.getBoundingClientRect = () => ({ ...CANVAS_OFFSET }) as DOMRect;
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

function longPressOn(target: Element, at = { x: 5, y: 5 }): void {
  touch(target, "pointerdown", at);
  vi.advanceTimersByTime(500);
  touch(target, "pointerup", at, 600);
  flushFrames();
}

function rightClickOn(target: Element, at = { x: 5, y: 5 }): void {
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

function offeredMenu(callIndex = 0): { items: readonly MenuItem[]; at: { x: number; y: number } } {
  const call = host.showMenu.mock.calls[callIndex];
  if (call === undefined) throw new Error("no menu was shown");
  return { items: call[0], at: call[1] };
}

function choose(label: string, callIndex = 0): void {
  const item = offeredMenu(callIndex).items.find((candidate) => candidate.label === label);
  if (item === undefined) throw new Error(`no menu item ${label}`);
  item.onSelect();
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

const NODE_LABELS = ["Добавить дочернюю", "Добавить соседнюю", "Цвет", "Копировать", "Вставить", "Дублировать", "Удалить"];

describe("MapEditor node menu opening", () => {
  it("shows the three node items after a right click on a node", () => {
    openMap(SAMPLE);

    rightClickOn(nodeElement("b"));

    expect(host.showMenu).toHaveBeenCalledTimes(1);
    expect(offeredMenu().items.map((item) => item.label)).toEqual(NODE_LABELS);
  });

  it("shows the three node items after a long press on a node", () => {
    openMap(SAMPLE);

    longPressOn(nodeElement("b"));

    expect(host.showMenu).toHaveBeenCalledTimes(1);
    expect(offeredMenu().items.map((item) => item.label)).toEqual(NODE_LABELS);
  });

  it("shows the menu at the pressed point including the canvas offset", () => {
    openMap(SAMPLE);

    rightClickOn(nodeElement("a"), { x: 30, y: 40 });

    expect(offeredMenu().at).toEqual({ x: 40, y: 60 });
  });

  it("selects the node the menu was opened on", () => {
    openMap(SAMPLE);

    longPressOn(nodeElement("b"));

    expect(selectedIds()).toEqual(["b"]);
  });

  it("reports no tap or edit when the long press ends", () => {
    openMap(SAMPLE);

    longPressOn(nodeElement("b"));

    expect(editor.isEditingText()).toBe(false);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("opens no menu when the finger moves more than 8 px before the duration", () => {
    openMap(SAMPLE);

    touch(nodeElement("a"), "pointerdown", { x: 5, y: 5 });
    touch(nodeElement("a"), "pointermove", { x: 25, y: 5 }, 100);
    vi.advanceTimersByTime(1000);

    expect(host.showMenu).not.toHaveBeenCalled();
  });

  it("opens no menu from a long press on a plus button", () => {
    openMap(SAMPLE);
    selectViaMenuTarget("a");
    host.showMenu.mockClear();
    const plus = nodeElement("a").querySelector<HTMLElement>('[data-pinchmap-hit="add-child"]');
    if (plus === null) throw new Error("no plus button");

    touch(plus, "pointerdown", { x: 5, y: 5 }, 2000);
    vi.advanceTimersByTime(1000);

    expect(host.showMenu).not.toHaveBeenCalled();
  });

  it("still offers the empty-space items on empty canvas", () => {
    openMap(SAMPLE);

    rightClickOn(canvas(), { x: 600, y: 600 });

    expect(offeredMenu().items.map((item) => item.label)).toEqual(["Добавить ноду", "Reset map to auto-layout"]);
  });

  it("still offers the add-node item after a long press on empty canvas", () => {
    openMap(SAMPLE);

    longPressOn(canvas(), { x: 600, y: 600 });

    expect(offeredMenu().items.map((item) => item.label)).toEqual(["Добавить ноду", "Reset map to auto-layout"]);
  });
});

function selectViaMenuTarget(id: string): void {
  touch(nodeElement(id), "pointerdown", { x: 5, y: 5 }, 100);
  touch(nodeElement(id), "pointerup", { x: 5, y: 5 }, 150);
  flushFrames();
}

describe("MapEditor node menu delete", () => {
  it("removes the node with its descendants", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("a"));

    choose("Удалить");

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["b", "c", "r1"]);
    expect(container.querySelector('.pinchmap-node[data-node-id="a1"]')).toBeNull();
  });

  it("reports exactly one change", () => {
    openMap(SAMPLE);
    longPressOn(nodeElement("a"));

    choose("Удалить");

    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("selects the previous sibling afterwards (ОВ-12)", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("b"));

    choose("Удалить");

    expect(selectedIds()).toEqual(["a"]);
  });

  it("selects the next sibling when the first child is deleted (ОВ-12)", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("a"));

    choose("Удалить");

    expect(selectedIds()).toEqual(["b"]);
  });

  it("selects the parent when an only child is deleted (ОВ-12)", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("a1"));

    choose("Удалить");

    expect(selectedIds()).toEqual(["a"]);
  });
});

describe("MapEditor node menu add", () => {
  it("creates a child of the pressed node and opens it for text input", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("b"));

    choose("Добавить дочернюю");

    const [newId] = selectedIds();
    expect(editor.isEditingText()).toBe(true);
    expect(nodeElement(newId ?? "").contains(textarea())).toBe(true);
    typeAndCommit("Kid");
    expect(getNode(editor.getMap(), newId ?? "")).toMatchObject({ text: "Kid", parentId: "b" });
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("creates a sibling right after the pressed node and opens it for text input", () => {
    openMap(SAMPLE);
    longPressOn(nodeElement("a"));

    choose("Добавить соседнюю");

    const [newId] = selectedIds();
    expect(editor.isEditingText()).toBe(true);
    expect(nodeElement(newId ?? "").contains(textarea())).toBe(true);
    typeAndCommit("Next");
    expect(getNode(editor.getMap(), "r1").childIds).toEqual(["a", newId, "b", "c"]);
  });

  it("targets the node the menu was opened on, not a later selection", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("b"));
    selectViaMenuTarget("c");

    choose("Добавить дочернюю");
    const [newId] = selectedIds();
    typeAndCommit("Kid");

    expect(getNode(editor.getMap(), newId ?? "").parentId).toBe("b");
  });
});

describe("MapEditor node menu while editing", () => {
  it("commits the edit of another node first", () => {
    openMap(SAMPLE);
    selectViaMenuTarget("b");
    canvas().dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true, cancelable: true }));
    flushFrames();
    if (!editor.isEditingText()) throw new Error("edit did not start");
    const input = textarea();
    input.value = "B edited";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    rightClickOn(nodeElement("c"));

    expect(editor.isEditingText()).toBe(false);
    expect(getNode(editor.getMap(), "b").text).toBe("B edited");
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
    expect(selectedIds()).toEqual(["c"]);
    expect(offeredMenu().items.map((item) => item.label)).toEqual(NODE_LABELS);
  });
});

describe("MapEditor node menu with a stale node", () => {
  const WITHOUT_A = buildMindMap([
    { id: "r1", text: "Root", parentId: null },
    { id: "b", text: "B", parentId: "r1" },
    { id: "c", text: "C", parentId: "r1" },
  ]);

  it.each(NODE_LABELS)("choosing %s after the node disappeared does nothing and does not throw", (label) => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("a"));
    editor.loadMap(WITHOUT_A);
    flushFrames();
    host.onMapChanged.mockClear();

    expect(() => choose(label)).not.toThrow();

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["b", "c", "r1"]);
    expect(editor.isEditingText()).toBe(false);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });
});

describe("MapEditor node menu delete focus", () => {
  it("leaves the canvas focused after choosing Удалить", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("a"));
    const otherControl = document.createElement("button");
    document.body.appendChild(otherControl);
    otherControl.focus();

    choose("Удалить");

    expect(document.activeElement).toBe(canvas());
    otherControl.remove();
  });
});
