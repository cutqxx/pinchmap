// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, isNodeCollapsed } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./mapEditor";

const NODE_SIZE = { width: 80, height: 30 };
const LABELS = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", collapse: "Свернуть", expand: "Развернуть", resetLayout: "Сброс", delete: "Удалить" };

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
  { id: "a1x", text: "A1x", parentId: "a1" },
  { id: "b", text: "B", parentId: "r" },
  { id: "l", text: "L", parentId: "r", state: { side: "left" } },
  { id: "l1", text: "L1", parentId: "l" },
]);

const STARTS_COLLAPSED = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r", state: { collapsed: true } },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r" },
]);

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let pendingFrames: (() => void)[];
let clock = 0;

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

function toggleOf(id: string): HTMLElement {
  const element = nodeElement(id).querySelector<HTMLElement>(".pinchmap-collapse-toggle");
  if (element === null) throw new Error(`no collapse toggle on ${id}`);
  return element;
}

function pointer(target: Element, type: string, init: { pointerType: string; timeStamp: number; clientX?: number; clientY?: number }): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: init.pointerType,
    button: 0,
    isPrimary: true,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  });
  Object.defineProperty(event, "timeStamp", { value: init.timeStamp });
  target.dispatchEvent(event);
}

function tapOn(target: Element, pointerType: "touch" | "mouse" = "touch"): void {
  clock += 1000;
  pointer(target, "pointerdown", { pointerType, timeStamp: clock });
  pointer(target, "pointerup", { pointerType, timeStamp: clock + 50 });
  flushFrames();
}

function press(key: string, modifiers: KeyboardEventInit = {}, target: EventTarget = canvas()): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
  flushFrames();
}

function pressToggleShortcut(): void {
  press("/", { ctrlKey: true, code: "Slash" });
}

function pressUndo(): void {
  press("z", { ctrlKey: true, code: "KeyZ" });
}

function pressRedo(): void {
  press("Z", { ctrlKey: true, shiftKey: true, code: "KeyZ" });
}

function isCollapsed(id: string): boolean {
  const node = editor.getMap().nodes.get(id);
  return node !== undefined && isNodeCollapsed(node);
}

function isHidden(id: string): boolean {
  return nodeElement(id).classList.contains("is-hidden");
}

function selectedIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map((el) => el.getAttribute("data-node-id") ?? "");
}

function openNodeMenu(id: string): string[] {
  host.showMenu.mockClear();
  nodeElement(id).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  const items = host.showMenu.mock.calls[0]?.[0] ?? [];
  return items.map((item) => item.label);
}

describe("MapEditor collapse indicator", () => {
  it("collapses the branch on a tap on the indicator", () => {
    openMap(SAMPLE);

    tapOn(toggleOf("a"));

    expect(isCollapsed("a")).toBe(true);
    expect(isHidden("a1")).toBe(true);
    expect(isHidden("a1x")).toBe(true);
  });

  it("collapses the branch on a mouse click on the indicator", () => {
    openMap(SAMPLE);

    tapOn(toggleOf("a"), "mouse");

    expect(isCollapsed("a")).toBe(true);
  });

  it("expands the branch on a second tap on the indicator", () => {
    openMap(SAMPLE);
    tapOn(toggleOf("a"));

    tapOn(toggleOf("a"));

    expect(isCollapsed("a")).toBe(false);
    expect(isHidden("a1")).toBe(false);
  });

  it("selects the node whose indicator was tapped", () => {
    openMap(SAMPLE);

    tapOn(toggleOf("a"));

    expect(selectedIds()).toEqual(["a"]);
  });

  it("does not start editing the text on an indicator tap", () => {
    openMap(SAMPLE);

    tapOn(toggleOf("a"));

    expect(container.querySelector("textarea")).toBeNull();
  });

  it("does not move the node when a finger drags across the indicator", () => {
    openMap(SAMPLE);
    const before = nodeElement("a").style.left;
    const indicator = toggleOf("a");

    pointer(indicator, "pointerdown", { pointerType: "touch", timeStamp: 1000 });
    pointer(indicator, "pointermove", { pointerType: "touch", timeStamp: 1010, clientX: 200, clientY: 200 });
    pointer(indicator, "pointerup", { pointerType: "touch", timeStamp: 1020, clientX: 200, clientY: 200 });
    flushFrames();

    expect(nodeElement("a").style.left).toBe(before);
    expect(editor.getMap().nodes.get("a")?.state).toBeUndefined();
  });

  it("shows the descendant count on the collapsed node", () => {
    openMap(SAMPLE);

    tapOn(toggleOf("a"));

    expect(toggleOf("a").textContent).toBe("2");
  });

  it("marks the map changed so the collapsed state is saved", () => {
    openMap(SAMPLE);

    tapOn(toggleOf("a"));

    expect(host.onMapChanged).toHaveBeenCalled();
  });

  it("draws a node that was collapsed in the file with its children hidden", () => {
    openMap(STARTS_COLLAPSED);

    expect(isHidden("a1")).toBe(true);
    expect(toggleOf("a").textContent).toBe("1");
  });

  it("lays out the children when a node that started collapsed is expanded", () => {
    openMap(STARTS_COLLAPSED);

    tapOn(toggleOf("a"));

    expect(isHidden("a1")).toBe(false);
    expect(nodeElement("a1").style.left).not.toBe("");
  });

  it("closes the gap left by a collapsed branch by moving the next sibling up", () => {
    openMap(SAMPLE);
    const before = parseFloat(nodeElement("b").style.top);

    tapOn(toggleOf("a"));

    expect(parseFloat(nodeElement("b").style.top)).toBeLessThanOrEqual(before);
  });
});

describe("MapEditor collapse shortcut", () => {
  it("collapses the selected node with Ctrl+/", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressToggleShortcut();

    expect(isCollapsed("a")).toBe(true);
  });

  it("expands it again with a second Ctrl+/", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressToggleShortcut();

    pressToggleShortcut();

    expect(isCollapsed("a")).toBe(false);
  });

  it("works with Cmd+/ too", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    press("/", { metaKey: true, code: "Slash" });

    expect(isCollapsed("a")).toBe(true);
  });

  it("does nothing with no selection", () => {
    openMap(SAMPLE);

    pressToggleShortcut();

    expect(editor.getMap()).toBe(SAMPLE);
  });

  it("does nothing for a selected leaf", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("b"));

    pressToggleShortcut();

    expect(editor.getMap().nodes.get("b")?.state).toBeUndefined();
  });

  it("leaves a leaf out of undo history", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("b"));

    pressToggleShortcut();

    expect(host.onHistoryChanged).not.toHaveBeenCalledWith(true, false);
  });

  it("does not collapse while the node text is being edited", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("F2");

    press("/", { ctrlKey: true, code: "Slash" }, container.querySelector("textarea") ?? canvas());

    expect(isCollapsed("a")).toBe(false);
  });
});

describe("MapEditor collapse and arrow keys", () => {
  it("does not enter the hidden children of a collapsed node with the right arrow", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressToggleShortcut();

    press("ArrowRight");

    expect(selectedIds()).toEqual(["a"]);
  });

  it("does not enter the hidden children of a collapsed left node with the left arrow", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("l"));
    pressToggleShortcut();

    press("ArrowLeft");

    expect(selectedIds()).toEqual(["l"]);
  });

  it("enters the children again after the node is expanded", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressToggleShortcut();
    pressToggleShortcut();

    press("ArrowRight");

    expect(selectedIds()).toEqual(["a1"]);
  });
});

describe("MapEditor undoing collapse", () => {
  it("undoes a collapse in one step", () => {
    openMap(SAMPLE);
    tapOn(toggleOf("a"));

    pressUndo();

    expect(isCollapsed("a")).toBe(false);
    expect(isHidden("a1")).toBe(false);
  });

  it("redoes the collapse", () => {
    openMap(SAMPLE);
    tapOn(toggleOf("a"));
    pressUndo();

    pressRedo();

    expect(isCollapsed("a")).toBe(true);
    expect(isHidden("a1")).toBe(true);
  });

  it("undoes an expand back to collapsed", () => {
    openMap(STARTS_COLLAPSED);
    tapOn(toggleOf("a"));

    pressUndo();

    expect(isCollapsed("a")).toBe(true);
  });

  it("moves a selection that undo hides to the collapsed ancestor", () => {
    openMap(STARTS_COLLAPSED);
    tapOn(toggleOf("a"));
    tapOn(nodeElement("a1"));

    press("z", { ctrlKey: true, code: "KeyZ" });

    expect(selectedIds()).toEqual(["a"]);
  });
});

describe("MapEditor adding a child to a collapsed node", () => {
  it("expands the node and shows the new child", () => {
    openMap(STARTS_COLLAPSED);
    tapOn(nodeElement("a"));

    press("Tab");

    expect(isHidden("a1")).toBe(false);
    expect(nodeElement("a").querySelector(".pinchmap-collapse-toggle")?.textContent).toBe("−");
  });

  it("restores the collapsed node in one undo step after committing the new child", () => {
    openMap(STARTS_COLLAPSED);
    tapOn(nodeElement("a"));
    press("Tab");
    const input = container.querySelector("textarea");
    if (input === null) throw new Error("no text input");
    input.value = "New";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    press("Enter", { ctrlKey: true }, input);

    pressUndo();

    expect(isCollapsed("a")).toBe(true);
    expect([...editor.getMap().nodes.values()].some((node) => node.text === "New")).toBe(false);
  });

  it("keeps the node collapsed when the new child is abandoned", () => {
    openMap(STARTS_COLLAPSED);
    tapOn(nodeElement("a"));
    press("Tab");

    press("Escape", {}, container.querySelector("textarea") ?? canvas());

    expect(isCollapsed("a")).toBe(true);
  });
});

describe("MapEditor node menu collapse item", () => {
  it("offers Collapse before the reset item for a node with children", () => {
    openMap(SAMPLE);

    expect(openNodeMenu("a")).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Свернуть", "Удалить"]);
  });

  it("offers Expand once the node is collapsed", () => {
    openMap(STARTS_COLLAPSED);

    expect(openNodeMenu("a")).toContain("Развернуть");
    expect(openNodeMenu("a")).not.toContain("Свернуть");
  });

  it("offers no collapse item for a leaf", () => {
    openMap(SAMPLE);

    expect(openNodeMenu("b")).toEqual(["Добавить дочернюю", "Добавить соседнюю", "Удалить"]);
  });

  it("collapses the node when the item is chosen", () => {
    openMap(SAMPLE);
    openNodeMenu("a");

    host.showMenu.mock.calls[0]?.[0].find((item) => item.label === "Свернуть")?.onSelect();
    flushFrames();

    expect(isCollapsed("a")).toBe(true);
  });
});
