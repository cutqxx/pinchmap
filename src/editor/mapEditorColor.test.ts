// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, effectiveColor } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./mapEditor";

const NODE_SIZE = { width: 80, height: 30 };
const LABELS = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", color: "Цвет", noColor: "Без цвета", colorNames: { red: "Красный", orange: "Оранжевый", yellow: "Жёлтый", green: "Зелёный", cyan: "Бирюзовый", purple: "Фиолетовый" }, copy: "Копировать", paste: "Вставить", duplicate: "Дублировать", collapse: "Свернуть", expand: "Развернуть", resetLayout: "Сброс", delete: "Удалить" };

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onHistoryChanged: Mock<(canUndo: boolean, canRedo: boolean) => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<(items: readonly MenuItem[], at: { x: number; y: number }) => void>;
  notify: Mock<(message: string) => void>;
}

const SAMPLE = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r", state: { color: "green" } },
]);

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let pendingFrames: (() => void)[];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(NODE_SIZE.width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(NODE_SIZE.height);
  container = document.createElement("div");
  document.body.appendChild(container);
  host = { onMapChanged: vi.fn(), onHistoryChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() };
  pendingFrames = [];
  editor = new MapEditor({ container, host, requestFrame: (callback) => pendingFrames.push(callback), nodeMenuLabels: LABELS });
  canvas().setPointerCapture = vi.fn();
});

afterEach(() => {
  editor.destroy();
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

function rightClickOn(target: Element): void {
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  flushFrames();
}

function lastMenu(): readonly MenuItem[] {
  const call = host.showMenu.mock.calls[host.showMenu.mock.calls.length - 1];
  if (call === undefined) throw new Error("no menu was shown");
  return call[0];
}

function chooseColor(nodeId: string, label: string): void {
  rightClickOn(nodeElement(nodeId));
  const submenu = lastMenu().find((item) => item.label === "Цвет")?.submenu;
  const entry = submenu?.find((item) => item.label === label);
  if (entry === undefined) throw new Error(`no colour entry ${label}`);
  entry.onSelect();
  flushFrames();
}

function press(key: string, modifiers: KeyboardEventInit): void {
  canvas().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
  flushFrames();
}

function pressUndo(): void {
  press("z", { ctrlKey: true, code: "KeyZ" });
}

function colorOf(id: string): string | undefined {
  return effectiveColor(editor.getMap(), id);
}

describe("choosing a colour from the node menu", () => {
  it("colours the node and its descendants, and renders the mark", () => {
    openMap(SAMPLE);

    chooseColor("a", "Красный");

    expect(colorOf("a")).toBe("red");
    expect(colorOf("a1")).toBe("red");
    expect(nodeElement("a1").getAttribute("data-pinchmap-color")).toBe("red");
  });

  it("notifies the host that the map changed", () => {
    openMap(SAMPLE);

    chooseColor("a", "Бирюзовый");

    expect(host.onMapChanged).toHaveBeenCalled();
  });

  it("keeps a coloured child's own colour when its parent is recoloured", () => {
    openMap(SAMPLE);

    chooseColor("r", "Фиолетовый");

    expect(colorOf("b")).toBe("green");
    expect(colorOf("a")).toBe("purple");
  });

  it("returns the inherited colour when no colour is chosen", () => {
    openMap(SAMPLE);
    chooseColor("r", "Красный");

    chooseColor("b", "Без цвета");

    expect(colorOf("b")).toBe("red");
    expect(nodeElement("b").getAttribute("data-pinchmap-color")).toBe("red");
  });

  it("shows the current own colour as checked on the next menu", () => {
    openMap(SAMPLE);

    rightClickOn(nodeElement("b"));

    const checked = lastMenu().find((item) => item.label === "Цвет")?.submenu?.filter((item) => item.isChecked === true);
    expect(checked?.map((item) => item.label)).toEqual(["Зелёный"]);
  });

  it("undoes the colour change in one step and redo restores it", () => {
    openMap(SAMPLE);
    chooseColor("a", "Жёлтый");

    pressUndo();

    expect(colorOf("a")).toBeUndefined();
    expect(editor.getMap()).toBe(SAMPLE);
    press("Z", { ctrlKey: true, shiftKey: true, code: "KeyZ" });
    expect(colorOf("a")).toBe("yellow");
  });

  it("adds no extra undo step when the same colour is chosen again", () => {
    openMap(SAMPLE);
    chooseColor("a", "Красный");
    chooseColor("a", "Красный");

    pressUndo();

    expect(editor.getMap()).toBe(SAMPLE);
  });

  it("ignores a colour chosen for a node that an external reload removed while the menu was open", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("a1"));
    const red = lastMenu().find((item) => item.label === "Цвет")?.submenu?.find((item) => item.label === "Красный");
    const reloaded = buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "a", text: "A", parentId: "r" },
    ]);
    editor.reloadMap(reloaded);
    flushFrames();
    host.onMapChanged.mockClear();

    red?.onSelect();
    flushFrames();

    expect(editor.getMap().nodes.has("a1")).toBe(false);
    expect(colorOf("a")).toBeUndefined();
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });
});
