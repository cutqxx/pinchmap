// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, getNode, readManualPosition } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./mapEditor";

const NODE_SIZE = { width: 80, height: 30 };
const FAR_AWAY = { x: 3000, y: 3000 };

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PointerOptions {
  readonly kind?: "touch" | "mouse";
  readonly id?: number;
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly button?: number;
}

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onHistoryChanged: Mock<(canUndo: boolean, canRedo: boolean) => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<(items: readonly MenuItem[], at: Point) => { close(): void }>;
  notify: Mock<(message: string) => void>;
}

const LABELS = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", color: "Цвет", noColor: "Без цвета", colorNames: { red: "Красный", orange: "Оранжевый", yellow: "Жёлтый", green: "Зелёный", cyan: "Бирюзовый", purple: "Фиолетовый" }, copy: "Копировать", paste: "Вставить", duplicate: "Дублировать", collapse: "Свернуть", expand: "Развернуть", resetLayout: "Сброс", delete: "Удалить" };

const GROUP_MAP = buildMindMap([
  { id: "r1", text: "Root", parentId: null, state: { x: 0, y: 0 } },
  { id: "a", text: "A", parentId: "r1", state: { x: 200, y: -100 } },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r1", state: { x: 200, y: 100 } },
  { id: "c", text: "C", parentId: "r1", state: { x: 200, y: 300 } },
  { id: "r2", text: "Second", parentId: null, state: { x: 0, y: 600 } },
  { id: "r2c", text: "Second child", parentId: "r2" },
]);

const AUTO_ROOTS = buildMindMap([
  { id: "r1", text: "One", parentId: null },
  { id: "r2", text: "Two", parentId: null },
  { id: "r3", text: "Three", parentId: null },
]);

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let menuClosed: Mock<() => void>;
let pendingFrames: (() => void)[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(NODE_SIZE.width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(NODE_SIZE.height);
  container = document.createElement("div");
  document.body.appendChild(container);
  menuClosed = vi.fn();
  host = {
    onMapChanged: vi.fn(),
    onHistoryChanged: vi.fn(),
    onTextEditEnded: vi.fn(),
    showMenu: vi.fn(() => ({ close: menuClosed })),
    notify: vi.fn(),
  };
  pendingFrames = [];
  editor = new MapEditor({ container, host, requestFrame: (callback) => pendingFrames.push(callback), nodeMenuLabels: LABELS });
  const element = canvas();
  element.setPointerCapture = vi.fn();
  element.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
});

afterEach(() => {
  editor.destroy();
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
}

function fire(target: Element, type: string, at: Point, options: PointerOptions = {}, time = 10): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: options.id ?? 1,
    pointerType: options.kind ?? "touch",
    button: options.button ?? 0,
    isPrimary: true,
    clientX: at.x,
    clientY: at.y,
    shiftKey: options.shiftKey ?? false,
    metaKey: options.metaKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
  });
  Object.defineProperty(event, "timeStamp", { value: time });
  target.dispatchEvent(event);
  flushFrames();
}

function placement(id: string): Point {
  const element = nodeElement(id);
  return { x: parseFloat(element.style.left), y: parseFloat(element.style.top) };
}

function centerOf(id: string): Point {
  const camera = cameraParts();
  const at = placement(id);
  return { x: (at.x + NODE_SIZE.width / 2) * camera.zoom + camera.x, y: (at.y + NODE_SIZE.height / 2) * camera.zoom + camera.y };
}

function cameraParts(): { x: number; y: number; zoom: number } {
  const transform = container.querySelector<HTMLElement>(".pinchmap-world")?.style.transform ?? "";
  const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\((-?[\d.e-]+)\)/.exec(transform);
  if (match === null) throw new Error(`no camera transform: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

let clock = 0;

/** Each click happens a second after the last one, so two clicks never pair into a double tap. */
function click(id: string, options: PointerOptions = {}): void {
  const at = centerOf(id);
  clock += 1000;
  fire(nodeElement(id), "pointerdown", at, options, clock);
  fire(nodeElement(id), "pointerup", at, options, clock + 50);
}

function clickAdditively(id: string): void {
  click(id, { kind: "mouse", shiftKey: true });
}

function select(...ids: string[]): void {
  const [first, ...rest] = ids;
  if (first === undefined) return;
  click(first, { kind: "mouse" });
  rest.forEach(clickAdditively);
}

function selectedIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map((element) => element.dataset.nodeId ?? "").sort();
}

function addButtons(): number {
  return container.querySelectorAll(".pinchmap-add-button").length;
}

function dragNode(id: string, delta: Point, options: PointerOptions = { kind: "mouse" }): void {
  const start = centerOf(id);
  fire(nodeElement(id), "pointerdown", start, options, 10);
  fire(canvas(), "pointermove", { x: start.x + delta.x / 2, y: start.y + delta.y / 2 }, options, 20);
  fire(canvas(), "pointermove", { x: start.x + delta.x, y: start.y + delta.y }, options, 30);
  fire(canvas(), "pointerup", { x: start.x + delta.x, y: start.y + delta.y }, options, 100);
}

function press(key: string, modifiers: KeyboardEventInit = {}): void {
  canvas().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
  flushFrames();
}

function manual(id: string): Point | undefined {
  return readManualPosition(getNode(editor.getMap(), id).state);
}

function parentOf(id: string): string | null {
  return getNode(editor.getMap(), id).parentId;
}

describe("additive click", () => {
  it("shift-click on an unselected node adds it to the selection", () => {
    openMap(GROUP_MAP);
    select("a");

    clickAdditively("b");

    expect(selectedIds()).toEqual(["a", "b"]);
  });

  it("cmd-click on an unselected node adds it to the selection", () => {
    openMap(GROUP_MAP);
    select("a");

    click("b", { kind: "mouse", metaKey: true });

    expect(selectedIds()).toEqual(["a", "b"]);
  });

  it("ctrl-click on an unselected node adds it to the selection", () => {
    openMap(GROUP_MAP);
    select("a");

    click("b", { kind: "mouse", ctrlKey: true });

    expect(selectedIds()).toEqual(["a", "b"]);
  });

  it("shift-click on a selected node removes only that node", () => {
    openMap(GROUP_MAP);
    select("a", "b", "c");

    clickAdditively("b");

    expect(selectedIds()).toEqual(["a", "c"]);
  });

  it("a plain click on one node of the group selects it alone", () => {
    openMap(GROUP_MAP);
    select("a", "b", "c");

    click("b", { kind: "mouse" });

    expect(selectedIds()).toEqual(["b"]);
  });

  it("shift-click on the only selected node leaves nothing selected", () => {
    openMap(GROUP_MAP);
    select("a");

    clickAdditively("a");

    expect(selectedIds()).toEqual([]);
  });

  it("a tap on empty space clears the whole group", () => {
    openMap(GROUP_MAP);
    select("a", "b", "c");

    const at = FAR_AWAY;
    fire(canvas(), "pointerdown", at, { kind: "touch" }, 10);
    fire(canvas(), "pointerup", at, { kind: "touch" }, 100);

    expect(selectedIds()).toEqual([]);
  });

  it("a mouse click on empty space clears the whole group", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    fire(canvas(), "pointerdown", FAR_AWAY, { kind: "mouse" }, 10);
    fire(canvas(), "pointerup", FAR_AWAY, { kind: "mouse" }, 100);

    expect(selectedIds()).toEqual([]);
  });

  it("Escape clears the whole group", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    press("Escape");

    expect(selectedIds()).toEqual([]);
  });
});

describe("add buttons", () => {
  it("shows the add buttons for exactly one selected node", () => {
    openMap(GROUP_MAP);

    select("a");

    expect(addButtons()).toBeGreaterThan(0);
  });

  it("hides every add button while more than one node is selected", () => {
    openMap(GROUP_MAP);

    select("a", "b");

    expect(addButtons()).toBe(0);
  });

  it("brings the add buttons back when the group shrinks to one node", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    clickAdditively("b");

    expect(addButtons()).toBeGreaterThan(0);
  });
});

describe("moving a group", () => {
  it("dragging any selected node moves every selected node by the same distance", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const before = { b: placement("b"), c: placement("c") };

    dragNode("c", { x: 40, y: 25 });

    expect(placement("b")).toEqual({ x: before.b.x + 40, y: before.b.y + 25 });
    expect(placement("c")).toEqual({ x: before.c.x + 40, y: before.c.y + 25 });
  });

  it("dragging the first selected node moves the group too", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const before = placement("c");

    dragNode("b", { x: -30, y: 10 });

    expect(placement("c")).toEqual({ x: before.x - 30, y: before.y + 10 });
  });

  it("does not move unselected nodes", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const before = placement("a");

    dragNode("b", { x: 40, y: 25 });

    expect(placement("a")).toEqual(before);
  });

  it("keeps the group selected after the move", () => {
    openMap(GROUP_MAP);
    select("b", "c");

    dragNode("b", { x: 40, y: 25 });

    expect(selectedIds()).toEqual(["b", "c"]);
  });

  it("moves with a touch drag as well as a mouse drag", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const before = placement("c");

    dragNode("b", { x: 40, y: 0 }, { kind: "touch" });

    expect(placement("c")).toEqual({ x: before.x + 40, y: before.y });
  });

  it("divides the screen distance by the zoom", () => {
    openMap(GROUP_MAP);
    canvas().getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 }) as DOMRect;
    press("=", { ctrlKey: true });
    press("=", { ctrlKey: true });
    const zoom = cameraParts().zoom;
    select("b", "c");
    const before = placement("c");

    dragNode("b", { x: 40, y: 0 });

    expect(zoom).toBeGreaterThan(1);
    expect(placement("c").x - before.x).toBeCloseTo(40 / zoom, 5);
  });

  it("moves the whole branch of a group member and does not double-move a selected descendant", () => {
    openMap(GROUP_MAP);
    select("a", "a1", "b");
    const before = { a: placement("a"), a1: placement("a1"), b: placement("b") };

    dragNode("a1", { x: 40, y: 20 });

    expect(placement("a")).toEqual({ x: before.a.x + 40, y: before.a.y + 20 });
    expect(placement("a1")).toEqual({ x: before.a1.x + 40, y: before.a1.y + 20 });
    expect(placement("b")).toEqual({ x: before.b.x + 40, y: before.b.y + 20 });
  });

  it("stores no manual position for a selected descendant that follows its ancestor", () => {
    openMap(GROUP_MAP);
    select("a", "a1");

    dragNode("a", { x: 40, y: 20 });

    expect(manual("a")).toEqual({ x: 240, y: -80 });
    expect(manual("a1")).toBeUndefined();
  });

  it("moves a group of a root and a child of another root", () => {
    openMap(GROUP_MAP);
    select("r2", "b");
    const before = { r2: placement("r2"), r2c: placement("r2c"), b: placement("b") };

    dragNode("b", { x: 30, y: -20 });

    expect(placement("r2")).toEqual({ x: before.r2.x + 30, y: before.r2.y - 20 });
    expect(placement("r2c")).toEqual({ x: before.r2c.x + 30, y: before.r2c.y - 20 });
    expect(placement("b")).toEqual({ x: before.b.x + 30, y: before.b.y - 20 });
  });

  it("stores child offsets relative to the parent and root positions as absolute", () => {
    openMap(GROUP_MAP);
    select("r2", "b");

    dragNode("b", { x: 30, y: -20 });

    expect(manual("r2")).toEqual({ x: 30, y: 580 });
    expect(manual("b")).toEqual({ x: 230, y: 80 });
  });

  it("keeps auto-placed roots that stay behind where they were", () => {
    openMap(AUTO_ROOTS);
    const before = { r1: placement("r1"), r3: placement("r3") };
    select("r1", "r2");

    dragNode("r1", { x: 50, y: 0 });

    expect(placement("r3")).toEqual(before.r3);
    expect(placement("r1").x).toBe(before.r1.x + 50);
  });

  it("does not shift an unmoved root when only non-root nodes move", () => {
    openMap(GROUP_MAP);
    const before = placement("r2");
    select("b", "c");

    dragNode("b", { x: 0, y: 40 });

    expect(placement("r2")).toEqual(before);
  });

  it("is undone by a single undo step", () => {
    openMap(GROUP_MAP);
    select("b", "c", "r2");
    const before = { b: placement("b"), c: placement("c"), r2: placement("r2") };
    dragNode("b", { x: 40, y: 25 });

    press("z", { ctrlKey: true });

    expect({ b: placement("b"), c: placement("c"), r2: placement("r2") }).toEqual(before);
    expect(editor.getMap()).toEqual(GROUP_MAP);
  });

  it("is redone by a single redo step", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    dragNode("b", { x: 40, y: 25 });
    const moved = { b: placement("b"), c: placement("c") };
    press("z", { ctrlKey: true });

    press("z", { ctrlKey: true, shiftKey: true });

    expect({ b: placement("b"), c: placement("c") }).toEqual(moved);
  });

  it("records no undo step for a group drag that ends where it started", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const start = centerOf("b");
    fire(nodeElement("b"), "pointerdown", start, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: start.x + 20, y: start.y }, { kind: "mouse" }, 20);
    fire(canvas(), "pointermove", start, { kind: "mouse" }, 30);
    fire(canvas(), "pointerup", start, { kind: "mouse" }, 100);
    host.onHistoryChanged.mockClear();

    press("z", { ctrlKey: true });

    expect(host.onHistoryChanged).not.toHaveBeenCalledWith(false, true);
  });

  it("does not reparent when the group is released over another node", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const target = centerOf("r2");
    const start = centerOf("b");
    fire(nodeElement("b"), "pointerdown", start, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 }, { kind: "mouse" }, 20);
    fire(canvas(), "pointermove", target, { kind: "mouse" }, 30);
    fire(canvas(), "pointerup", target, { kind: "mouse" }, 100);

    expect(parentOf("b")).toBe("r1");
    expect(parentOf("c")).toBe("r1");
  });

  it("does not highlight a drop target while a group is dragged over a node", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const target = centerOf("r2");
    const start = centerOf("b");
    fire(nodeElement("b"), "pointerdown", start, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 }, { kind: "mouse" }, 20);
    fire(canvas(), "pointermove", target, { kind: "mouse" }, 30);

    expect(container.querySelectorAll(".pinchmap-node--drop-target")).toHaveLength(0);
  });

  it("does not reparent a group released over its own parent's other child", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    const target = centerOf("c");
    const start = centerOf("a");
    fire(nodeElement("a"), "pointerdown", start, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 }, { kind: "mouse" }, 20);
    fire(canvas(), "pointermove", target, { kind: "mouse" }, 30);
    fire(canvas(), "pointerup", target, { kind: "mouse" }, 100);

    expect(parentOf("a")).toBe("r1");
    expect(parentOf("c")).toBe("r1");
  });

  it("a second finger cancels a group drag and leaves the map unchanged", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const before = placement("c");
    const start = centerOf("b");
    fire(nodeElement("b"), "pointerdown", start, { kind: "touch" }, 10);
    fire(canvas(), "pointermove", { x: start.x + 40, y: start.y }, { kind: "touch" }, 20);

    fire(canvas(), "pointerdown", { x: 700, y: 700 }, { kind: "touch", id: 2 }, 30);

    expect(placement("c")).toEqual(before);
  });

  it("pointercancel during a group drag restores positions", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const before = placement("c");
    const start = centerOf("b");
    fire(nodeElement("b"), "pointerdown", start, { kind: "touch" }, 10);
    fire(canvas(), "pointermove", { x: start.x + 40, y: start.y }, { kind: "touch" }, 20);
    fire(canvas(), "pointermove", { x: start.x + 60, y: start.y }, { kind: "touch" }, 30);

    fire(canvas(), "pointercancel", { x: start.x + 60, y: start.y }, { kind: "touch" }, 40);

    expect(placement("c")).toEqual(before);
  });

  it("dragging an unselected node while a group is selected moves only that node and selects it", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    const before = { b: placement("b"), a: placement("a") };

    dragNode("a", { x: 0, y: 30 });

    expect(placement("b")).toEqual(before.b);
    expect(placement("a")).toEqual({ x: before.a.x, y: before.a.y + 30 });
    expect(selectedIds()).toEqual(["a"]);
  });
});

describe("single node drag still works", () => {
  it("reparents a lone selected node released over another node", () => {
    openMap(GROUP_MAP);
    select("c");
    const target = centerOf("b");
    const start = centerOf("c");
    fire(nodeElement("c"), "pointerdown", start, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 }, { kind: "mouse" }, 20);
    fire(canvas(), "pointermove", target, { kind: "mouse" }, 30);
    fire(canvas(), "pointerup", target, { kind: "mouse" }, 100);

    expect(parentOf("c")).toBe("b");
  });

  it("reparents an unselected node dragged over another while nothing is selected", () => {
    openMap(GROUP_MAP);
    const target = centerOf("b");
    const start = centerOf("c");
    fire(nodeElement("c"), "pointerdown", start, { kind: "touch" }, 10);
    fire(canvas(), "pointermove", { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 }, { kind: "touch" }, 20);
    fire(canvas(), "pointermove", target, { kind: "touch" }, 30);
    fire(canvas(), "pointerup", target, { kind: "touch" }, 100);

    expect(parentOf("c")).toBe("b");
  });

  it("reparents after the group shrank back to a single selected node", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    clickAdditively("b");
    const target = centerOf("a");
    const start = centerOf("c");
    fire(nodeElement("c"), "pointerdown", start, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 }, { kind: "mouse" }, 20);
    fire(canvas(), "pointermove", target, { kind: "mouse" }, 30);
    fire(canvas(), "pointerup", target, { kind: "mouse" }, 100);

    expect(parentOf("c")).toBe("a");
  });
});

describe("marquee", () => {
  function dragOnEmptySpace(from: Point, to: Point, options: PointerOptions): void {
    fire(canvas(), "pointerdown", from, options, 10);
    fire(canvas(), "pointermove", { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, options, 20);
    fire(canvas(), "pointermove", to, options, 30);
  }

  function marqueeElement(): HTMLElement | null {
    return container.querySelector<HTMLElement>(".pinchmap-marquee");
  }

  function boundsAround(...ids: string[]): { from: Point; to: Point } {
    const boxes = ids.map((id) => placement(id));
    const camera = cameraParts();
    const left = Math.min(...boxes.map((box) => box.x)) - 5;
    const top = Math.min(...boxes.map((box) => box.y)) - 5;
    const right = Math.max(...boxes.map((box) => box.x)) + NODE_SIZE.width + 5;
    const bottom = Math.max(...boxes.map((box) => box.y)) + NODE_SIZE.height + 5;
    return {
      from: { x: left * camera.zoom + camera.x, y: top * camera.zoom + camera.y },
      to: { x: right * camera.zoom + camera.x, y: bottom * camera.zoom + camera.y },
    };
  }

  it("a mouse drag on empty space draws the marquee rectangle", () => {
    openMap(GROUP_MAP);

    dragOnEmptySpace({ x: 1000, y: 1000 }, { x: 1100, y: 1060 }, { kind: "mouse" });

    const marquee = marqueeElement();
    expect(marquee?.style.left).toBe("1000px");
    expect(marquee?.style.top).toBe("1000px");
    expect(marquee?.style.width).toBe("100px");
    expect(marquee?.style.height).toBe("60px");
  });

  it("draws no marquee for a movement within 8 px", () => {
    openMap(GROUP_MAP);

    fire(canvas(), "pointerdown", { x: 1000, y: 1000 }, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: 1008, y: 1000 }, { kind: "mouse" }, 20);

    expect(marqueeElement()).toBeNull();
  });

  it("draws the marquee once the pointer is 9 px away", () => {
    openMap(GROUP_MAP);

    fire(canvas(), "pointerdown", { x: 1000, y: 1000 }, { kind: "mouse" }, 10);
    fire(canvas(), "pointermove", { x: 1009, y: 1000 }, { kind: "mouse" }, 20);

    expect(marqueeElement()).not.toBeNull();
  });

  it("selects the nodes wholly inside the rectangle on release", () => {
    openMap(GROUP_MAP);
    const { from, to } = boundsAround("b", "c");
    dragOnEmptySpace(from, to, { kind: "mouse" });

    fire(canvas(), "pointerup", to, { kind: "mouse" }, 100);

    expect(selectedIds()).toEqual(["b", "c"]);
  });

  it("removes the rectangle on release", () => {
    openMap(GROUP_MAP);
    const { from, to } = boundsAround("b", "c");
    dragOnEmptySpace(from, to, { kind: "mouse" });

    fire(canvas(), "pointerup", to, { kind: "mouse" }, 100);

    expect(marqueeElement()).toBeNull();
  });

  it("does not select a node that is only partly covered", () => {
    openMap(GROUP_MAP);
    const { from, to } = boundsAround("b", "c");

    dragOnEmptySpace(from, { x: to.x - 50, y: to.y }, { kind: "mouse" });
    fire(canvas(), "pointerup", { x: to.x - 50, y: to.y }, { kind: "mouse" }, 100);

    expect(selectedIds()).toEqual([]);
  });

  it("replaces an earlier selection", () => {
    openMap(GROUP_MAP);
    select("a");
    const { from, to } = boundsAround("b", "c");

    dragOnEmptySpace(from, to, { kind: "mouse" });
    fire(canvas(), "pointerup", to, { kind: "mouse" }, 100);

    expect(selectedIds()).toEqual(["b", "c"]);
  });

  it("clears the selection when the rectangle covers no node", () => {
    openMap(GROUP_MAP);
    select("a");

    dragOnEmptySpace({ x: 1000, y: 1000 }, { x: 1100, y: 1100 }, { kind: "mouse" });
    fire(canvas(), "pointerup", { x: 1100, y: 1100 }, { kind: "mouse" }, 100);

    expect(selectedIds()).toEqual([]);
  });

  it("selects a marquee-covered group that can then be dragged together", () => {
    openMap(GROUP_MAP);
    const { from, to } = boundsAround("b", "c");
    dragOnEmptySpace(from, to, { kind: "mouse" });
    fire(canvas(), "pointerup", to, { kind: "mouse" }, 100);
    const before = placement("c");

    dragNode("b", { x: 20, y: 20 });

    expect(placement("c")).toEqual({ x: before.x + 20, y: before.y + 20 });
  });

  it("a mouse drag does not pan the canvas", () => {
    openMap(GROUP_MAP);
    const camera = cameraParts();

    dragOnEmptySpace({ x: 1000, y: 1000 }, { x: 1100, y: 1100 }, { kind: "mouse" });

    expect(cameraParts()).toEqual(camera);
  });

  it("a Space-held mouse drag pans the canvas and draws no marquee", () => {
    openMap(GROUP_MAP);
    const camera = cameraParts();
    canvas().dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true, cancelable: true }));

    dragOnEmptySpace({ x: 1000, y: 1000 }, { x: 1100, y: 1050 }, { kind: "mouse" });

    expect(marqueeElement()).toBeNull();
    expect(cameraParts().x).toBeCloseTo(camera.x + 100);
    expect(cameraParts().y).toBeCloseTo(camera.y + 50);
  });

  it("a touch drag on empty space pans and draws no marquee", () => {
    openMap(GROUP_MAP);
    const camera = cameraParts();

    dragOnEmptySpace({ x: 1000, y: 1000 }, { x: 1100, y: 1050 }, { kind: "touch" });

    expect(marqueeElement()).toBeNull();
    expect(cameraParts().x).not.toBeCloseTo(camera.x);
  });

  it("a touch drag after a long press on empty space closes the menu and draws the marquee", () => {
    openMap(GROUP_MAP);
    const from = { x: 1000, y: 1000 };
    fire(canvas(), "pointerdown", from, { kind: "touch" }, 10);
    vi.advanceTimersByTime(500);
    expect(host.showMenu).toHaveBeenCalledTimes(1);

    fire(canvas(), "pointermove", { x: 1030, y: 1000 }, { kind: "touch" }, 600);

    expect(menuClosed).toHaveBeenCalledTimes(1);
    expect(marqueeElement()).not.toBeNull();
  });

  it("keeps the menu open when the finger stays within 8 px after the long press", () => {
    openMap(GROUP_MAP);
    fire(canvas(), "pointerdown", { x: 1000, y: 1000 }, { kind: "touch" }, 10);
    vi.advanceTimersByTime(500);

    fire(canvas(), "pointermove", { x: 1008, y: 1000 }, { kind: "touch" }, 600);

    expect(menuClosed).not.toHaveBeenCalled();
    expect(marqueeElement()).toBeNull();
  });

  it("a touch marquee after the long press selects the covered nodes", () => {
    openMap(GROUP_MAP);
    const { from, to } = boundsAround("b", "c");
    fire(canvas(), "pointerdown", from, { kind: "touch" }, 10);
    vi.advanceTimersByTime(500);
    fire(canvas(), "pointermove", { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, { kind: "touch" }, 600);
    fire(canvas(), "pointermove", to, { kind: "touch" }, 700);

    fire(canvas(), "pointerup", to, { kind: "touch" }, 800);

    expect(selectedIds()).toEqual(["b", "c"]);
  });

  it("pointercancel during a marquee removes the rectangle and keeps the selection", () => {
    openMap(GROUP_MAP);
    select("a");
    const { from, to } = boundsAround("b", "c");
    dragOnEmptySpace(from, to, { kind: "mouse" });

    fire(canvas(), "pointercancel", to, { kind: "mouse" }, 100);

    expect(marqueeElement()).toBeNull();
    expect(selectedIds()).toEqual(["a"]);
  });

  it("loading another map mid-marquee removes the rectangle", () => {
    openMap(GROUP_MAP);
    dragOnEmptySpace({ x: 1000, y: 1000 }, { x: 1100, y: 1100 }, { kind: "mouse" });

    openMap(AUTO_ROOTS);

    expect(marqueeElement()).toBeNull();
  });
});

describe("deleting a group", () => {
  it("Delete removes every selected branch", () => {
    openMap(GROUP_MAP);
    select("a", "c");

    press("Delete");

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["b", "r1", "r2", "r2c"]);
  });

  it("removes the descendants of the deleted branches too", () => {
    openMap(GROUP_MAP);
    select("a", "r2");

    press("Delete");

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["b", "c", "r1"]);
    expect(editor.getMap().rootIds).toEqual(["r1"]);
  });

  it("copes with a parent and its descendant both selected", () => {
    openMap(GROUP_MAP);
    select("a", "a1", "b");

    press("Delete");

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["c", "r1", "r2", "r2c"]);
  });

  it("copes with a descendant selected before its parent", () => {
    openMap(GROUP_MAP);
    select("a1", "a");

    press("Delete");

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["b", "c", "r1", "r2", "r2c"]);
  });

  it("selects nothing afterwards", () => {
    openMap(GROUP_MAP);
    select("a", "c");

    press("Delete");

    expect(selectedIds()).toEqual([]);
  });

  it("Backspace removes the group as well", () => {
    openMap(GROUP_MAP);
    select("a", "c");

    press("Backspace");

    expect(editor.getMap().nodes.has("a")).toBe(false);
    expect(editor.getMap().nodes.has("c")).toBe(false);
  });

  it("is undone by a single undo step", () => {
    openMap(GROUP_MAP);
    select("a", "c", "r2");
    press("Delete");

    press("z", { ctrlKey: true });

    expect(editor.getMap()).toEqual(GROUP_MAP);
  });

  it("leaves nothing selected after undoing the deletion", () => {
    openMap(GROUP_MAP);
    select("a", "c");
    press("Delete");

    press("z", { ctrlKey: true });

    expect(selectedIds()).toEqual([]);
  });

  it("is redone by a single redo step", () => {
    openMap(GROUP_MAP);
    select("a", "c");
    press("Delete");
    press("z", { ctrlKey: true });

    press("z", { ctrlKey: true, shiftKey: true });

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["b", "r1", "r2", "r2c"]);
  });

  it("deleting one lone node still selects its neighbour", () => {
    openMap(GROUP_MAP);
    select("b");

    press("Delete");

    expect(selectedIds()).toEqual(["a"]);
  });
});

describe("keyboard with several nodes selected", () => {
  it("Tab adds no child", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    press("Tab");

    expect(editor.getMap().nodes.size).toBe(GROUP_MAP.nodes.size);
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("Enter adds no sibling", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    press("Enter");

    expect(editor.getMap().nodes.size).toBe(GROUP_MAP.nodes.size);
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("F2 does not start editing", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    press("F2");

    expect(container.querySelector("textarea")).toBeNull();
  });

  it("Space does not collapse a selected branch", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    press(" ");

    expect(editor.getMap()).toEqual(GROUP_MAP);
  });

  it("does not duplicate on Ctrl+D", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    press("d", { ctrlKey: true });

    expect(editor.getMap().nodes.size).toBe(GROUP_MAP.nodes.size);
  });

  it("reports no single selection for the host", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    expect(editor.hasSelection()).toBe(false);
  });

  it("reports a single selection for exactly one node", () => {
    openMap(GROUP_MAP);
    select("a");

    expect(editor.hasSelection()).toBe(true);
  });

  it("does not duplicate through the command-palette entry point", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    editor.duplicateSelectedBranch();

    expect(editor.getMap().nodes.size).toBe(GROUP_MAP.nodes.size);
  });

  it("does not reset the layout of a group through the command entry point", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    editor.resetSelectedNodeLayout();

    expect(editor.getMap()).toEqual(GROUP_MAP);
  });

  it("an arrow key navigates from the primary node and selects only the target", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    press("ArrowLeft");

    expect(selectedIds()).toEqual(["r1"]);
  });

  it("right-click on a node selects it alone and opens the node menu", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    fire(nodeElement("c"), "pointerdown", centerOf("c"), { kind: "mouse", button: 2 }, 10);
    nodeElement("c").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: centerOf("c").x, clientY: centerOf("c").y }));
    flushFrames();

    expect(selectedIds()).toEqual(["c"]);
  });
});

describe("macOS Ctrl+click, which the system turns into a right-click", () => {
  function ctrlClickWithContextMenu(id: string): void {
    const at = centerOf(id);
    clock += 1000;
    fire(nodeElement(id), "pointerdown", at, { kind: "mouse", ctrlKey: true }, clock);
    nodeElement(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, ctrlKey: true }));
    fire(nodeElement(id), "pointerup", at, { kind: "mouse", ctrlKey: true }, clock + 50);
  }

  it("keeps the node selected while its menu is open instead of toggling it off", () => {
    openMap(GROUP_MAP);
    select("a");

    ctrlClickWithContextMenu("a");

    expect(host.showMenu).toHaveBeenCalledTimes(1);
    expect(selectedIds()).toEqual(["a"]);
  });

  it("selects an unselected node alone, like a right-click", () => {
    openMap(GROUP_MAP);
    select("a", "b");

    ctrlClickWithContextMenu("c");

    expect(selectedIds()).toEqual(["c"]);
  });
});

describe("history with a group selected", () => {
  it("keeps the selected nodes selected when undo only moves them back", () => {
    openMap(GROUP_MAP);
    select("b", "c");
    dragNode("b", { x: 40, y: 25 });

    press("z", { ctrlKey: true });

    expect(selectedIds()).toEqual(["b", "c"]);
  });

  it("drops only the nodes that undo removed from the selection", () => {
    openMap(GROUP_MAP);
    select("c");
    press("Tab");
    const input = container.querySelector("textarea");
    if (input === null) throw new Error("no text input is open");
    input.value = "New";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
    flushFrames();
    const added = [...editor.getMap().nodes.keys()].find((id) => !GROUP_MAP.nodes.has(id));
    if (added === undefined) throw new Error("child was not added");
    select("b", added);

    press("z", { ctrlKey: true });

    expect(editor.getMap().nodes.has(added)).toBe(false);
    expect(selectedIds()).toEqual(["b"]);
  });
});

describe("collapse indicator with a group selected", () => {
  it("selects the toggled node alone", () => {
    openMap(GROUP_MAP);
    select("a1", "b");
    const toggle = nodeElement("a").querySelector<HTMLElement>(".pinchmap-collapse-toggle");
    if (toggle === null) throw new Error("no collapse toggle on a");
    clock += 1000;
    fire(toggle, "pointerdown", { x: 5, y: 5 }, { kind: "touch" }, clock);
    fire(toggle, "pointerup", { x: 5, y: 5 }, { kind: "touch" }, clock + 50);

    expect(selectedIds()).toEqual(["a"]);
  });
});
