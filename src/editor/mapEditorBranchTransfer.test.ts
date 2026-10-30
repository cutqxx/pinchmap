// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, getNode } from "../model";
import type { BranchDraft, MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { BranchClipboard, MenuItem } from "./mapEditor";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const LABELS = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", color: "Цвет", noColor: "Без цвета", colorNames: { red: "Красный", orange: "Оранжевый", yellow: "Жёлтый", green: "Зелёный", cyan: "Бирюзовый", purple: "Фиолетовый" }, copy: "Копировать", paste: "Вставить", duplicate: "Дублировать", collapse: "Свернуть", expand: "Развернуть", resetLayout: "Сброс", delete: "Удалить" };

const SAMPLE = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1", state: { color: "red" } },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r1" },
  { id: "r2", text: "Second", parentId: null },
]);

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onHistoryChanged: Mock<(canUndo: boolean, canRedo: boolean) => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<(items: readonly MenuItem[], at: { x: number; y: number }) => void>;
  notify: Mock<(message: string) => void>;
}

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let pendingFrames: (() => void)[];
let clock = 0;
let written: string[];
let readResolvers: ((drafts: readonly BranchDraft[]) => void)[];

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  host = { onMapChanged: vi.fn(), onHistoryChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() };
  pendingFrames = [];
  written = [];
  readResolvers = [];
  const clipboard: BranchClipboard = {
    writeBranch: (map, nodeId) => {
      written.push(branchTexts(map, nodeId));
      return Promise.resolve();
    },
    readBranches: () => new Promise((resolve) => readResolvers.push(resolve)),
  };
  editor = new MapEditor({ container, host, requestFrame: (callback) => pendingFrames.push(callback), nodeMenuLabels: LABELS, clipboard });
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

function press(key: string, target: EventTarget = canvas(), modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  target.dispatchEvent(event);
  flushFrames();
  return event;
}

const pressCopy = (): KeyboardEvent => press("c", canvas(), { ctrlKey: true, code: "KeyC" });
const pressPaste = (): KeyboardEvent => press("v", canvas(), { ctrlKey: true, code: "KeyV" });
const pressDuplicate = (): KeyboardEvent => press("d", canvas(), { ctrlKey: true, code: "KeyD" });

async function clipboardHolds(drafts: readonly BranchDraft[]): Promise<void> {
  readResolvers.shift()?.(drafts);
  await Promise.resolve();
  await Promise.resolve();
  flushFrames();
}

function branchTexts(map: MindMap, nodeId: string): string {
  const node = getNode(map, nodeId);
  return [node.text, ...node.childIds.map((childId) => branchTexts(map, childId))].join(">");
}

function leaf(text: string): BranchDraft {
  return { text, children: [] };
}

function selectedIds(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map((element) => element.getAttribute("data-node-id") ?? "");
}

function childTexts(id: string): string[] {
  const map = editor.getMap();
  return getNode(map, id).childIds.map((childId) => getNode(map, childId).text);
}

function rightClickOn(target: Element): void {
  target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  flushFrames();
}

function choose(label: string): void {
  const items = host.showMenu.mock.calls[host.showMenu.mock.calls.length - 1]?.[0] ?? [];
  const item = items.find((candidate) => candidate.label === label);
  if (item === undefined) throw new Error(`no menu item ${label}`);
  item.onSelect();
  flushFrames();
}

describe("MapEditor copying a branch", () => {
  it("writes the selected branch to the clipboard on Ctrl+C", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressCopy();

    expect(written).toEqual(["A>A1"]);
  });

  it("writes the branch on Cmd+C as well", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("b"));

    press("c", canvas(), { metaKey: true, code: "KeyC" });

    expect(written).toEqual(["B"]);
  });

  it("writes nothing without a selection", () => {
    openMap(SAMPLE);

    pressCopy();

    expect(written).toEqual([]);
  });

  it("does not change the map or the history", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressCopy();

    expect(editor.getMap()).toEqual(SAMPLE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("copies through the node menu", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("a"));

    choose("Копировать");

    expect(written).toEqual(["A>A1"]);
  });
});

describe("MapEditor pasting a branch", () => {
  it("adds the pasted branch as the last child of the selected node", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressPaste();
    await clipboardHolds([{ text: "P", children: [leaf("P1")] }]);

    expect(childTexts("a")).toEqual(["A1", "P"]);
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("selects the first pasted top node", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressPaste();
    await clipboardHolds([leaf("P"), leaf("Q")]);

    const pastedId = getNode(editor.getMap(), "a").childIds[1] ?? "";
    expect(selectedIds()).toEqual([pastedId]);
  });

  it("pastes as new roots when nothing is selected", async () => {
    openMap(SAMPLE);

    pressPaste();
    await clipboardHolds([leaf("P"), leaf("Q")]);

    const roots = editor.getMap().rootIds.map((id) => getNode(editor.getMap(), id).text);
    expect(roots).toEqual(["Root", "Second", "P", "Q"]);
  });

  it("changes nothing when the clipboard has no branches", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressPaste();
    await clipboardHolds([]);

    expect(editor.getMap()).toEqual(SAMPLE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(host.onHistoryChanged).not.toHaveBeenCalled();
  });

  it("undoes the whole paste in one step", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressPaste();
    await clipboardHolds([{ text: "P", children: [leaf("P1"), leaf("P2")] }, leaf("Q")]);

    editor.undo();

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("pastes into the node selected when the paste began, even if the selection moves while reading", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressPaste();

    tapOn(nodeElement("b"));
    await clipboardHolds([leaf("P")]);

    expect(childTexts("a")).toEqual(["A1", "P"]);
    expect(childTexts("b")).toEqual([]);
  });

  it("ignores the paste when the target was deleted while reading", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("b"));
    pressPaste();
    press("Delete");

    await clipboardHolds([leaf("P")]);

    expect(editor.getMap().nodes.has("b")).toBe(false);
    expect([...editor.getMap().nodes.values()].map((node) => node.text)).not.toContain("P");
  });

  it("does nothing when the editor was destroyed while reading", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressPaste();
    editor.destroy();

    await expect(clipboardHolds([leaf("P")])).resolves.toBeUndefined();

    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("pastes through the node menu into the menu's node", async () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("b"));

    choose("Вставить");
    await clipboardHolds([leaf("P")]);

    expect(childTexts("b")).toEqual(["P"]);
  });

  it("expands a collapsed target so the pasted node is visible", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("/", canvas(), { ctrlKey: true, code: "Slash" });
    expect(nodeElement("a1").classList.contains("is-hidden")).toBe(true);

    pressPaste();
    await clipboardHolds([leaf("P")]);

    expect(nodeElement("a1").classList.contains("is-hidden")).toBe(false);
  });
});

describe("MapEditor duplicating a branch", () => {
  it("puts the copy right after the original on Ctrl+D", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressDuplicate();

    expect(childTexts("r1")).toEqual(["A", "A", "B"]);
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("selects the copy and keeps the original's colour", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    pressDuplicate();

    const copyId = getNode(editor.getMap(), "r1").childIds[1] ?? "";
    expect(selectedIds()).toEqual([copyId]);
    expect(getNode(editor.getMap(), copyId).state).toEqual({ color: "red" });
  });

  it("undoes the duplicate in one step", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressDuplicate();

    editor.undo();

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("does nothing without a selection", () => {
    openMap(SAMPLE);

    pressDuplicate();

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("duplicates through the node menu", () => {
    openMap(SAMPLE);
    rightClickOn(nodeElement("b"));

    choose("Дублировать");

    expect(childTexts("r1")).toEqual(["A", "B", "B"]);
  });

  it("duplicates the selected branch via duplicateSelectedBranch for the view hotkey", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("b"));

    editor.duplicateSelectedBranch();

    expect(childTexts("r1")).toEqual(["A", "B", "B"]);
  });
});

describe("MapEditor branch shortcuts while editing text", () => {
  function startEditing(id: string): HTMLTextAreaElement {
    tapOn(nodeElement(id));
    press("F2");
    const input = container.querySelector("textarea");
    if (input === null) throw new Error("no text input is open");
    return input;
  }

  it.each([
    ["c", "KeyC"],
    ["v", "KeyV"],
    ["d", "KeyD"],
  ])("leaves Ctrl+%s to the text input", async (key, code) => {
    openMap(SAMPLE);
    const input = startEditing("a");

    const event = press(key, input, { ctrlKey: true, code });
    await clipboardHolds([leaf("P")]);

    expect(event.defaultPrevented).toBe(false);
    expect(editor.getMap()).toEqual(SAMPLE);
    expect(written).toEqual([]);
    expect(readResolvers).toHaveLength(0);
  });

  it("ignores the view hotkey for duplicate", () => {
    openMap(SAMPLE);
    startEditing("a");

    editor.duplicateSelectedBranch();

    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("saves a pending text edit before a menu paste lands", async () => {
    openMap(SAMPLE);
    const input = startEditing("b");
    input.value = "B edited";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    rightClickOn(nodeElement("a"));

    choose("Вставить");
    await clipboardHolds([leaf("P")]);

    expect(getNode(editor.getMap(), "b").text).toBe("B edited");
    expect(childTexts("a")).toEqual(["A1", "P"]);
    expect(editor.isEditingText()).toBe(false);
  });
});

describe("MapEditor paste landing while something else happens", () => {
  function pointer(target: Element, type: string, x: number, timeStamp: number): void {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: x, clientY: 100 });
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
    target.dispatchEvent(event);
    flushFrames();
  }

  it("keeps the pasted branch when a node drag was running as the clipboard answered", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressPaste();
    clock += 1000;
    pointer(nodeElement("b"), "pointerdown", 100, clock);
    pointer(nodeElement("b"), "pointermove", 160, clock + 10);

    await clipboardHolds([leaf("P")]);
    pointer(nodeElement("b"), "pointermove", 200, clock + 20);
    pointer(nodeElement("b"), "pointerup", 200, clock + 30);

    expect(childTexts("a")).toEqual(["A1", "P"]);
    editor.undo();
    expect(editor.getMap()).toEqual(SAMPLE);
  });

  it("drops the paste when another map was opened in the view while the clipboard was read", async () => {
    openMap(SAMPLE);
    pressPaste();
    const other = buildMindMap([{ id: "x", text: "Other note", parentId: null }]);
    openMap(other);

    await clipboardHolds([leaf("P")]);

    expect(editor.getMap()).toEqual(other);
  });

  it("still pastes when the same map was reloaded after a sync while the clipboard was read", async () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    pressPaste();
    editor.reloadMap(SAMPLE);

    await clipboardHolds([leaf("P")]);

    expect(childTexts("a")).toEqual(["A1", "P"]);
  });
});
