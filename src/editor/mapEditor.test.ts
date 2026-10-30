// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { computeLayout } from "../layout";
import type { Size } from "../layout";
import { buildMindMap, getNode, readRootPosition, readSide } from "../model";
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
}

function nodeElement(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`node element ${id} not rendered`);
  return element;
}

function pointer(target: Element, type: string, timeStamp: number): void {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch" });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  target.dispatchEvent(event);
}

let clock = 0;
function tapOn(target: Element): void {
  clock += 1000;
  pointer(target, "pointerdown", clock);
  pointer(target, "pointerup", clock + 50);
  flushFrames();
}

function doubleTapOn(target: Element): void {
  clock += 1000;
  pointer(target, "pointerdown", clock);
  pointer(target, "pointerup", clock + 50);
  pointer(target, "pointerdown", clock + 120);
  pointer(target, "pointerup", clock + 170);
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
  return [...container.querySelectorAll<HTMLElement>(".pinchmap-node.is-selected")].map(
    (element) => element.getAttribute("data-node-id") ?? "",
  );
}

function plusButton(nodeId: string, kind: "add-child" | "add-sibling"): HTMLElement {
  const button = nodeElement(nodeId).querySelector<HTMLElement>(`[data-pinchmap-hit="${kind}"]`);
  if (button === null) throw new Error(`no ${kind} button on ${nodeId}`);
  return button;
}

describe("MapEditor selection", () => {
  it("selects a node when it is tapped", () => {
    openMap(SAMPLE);

    tapOn(nodeElement("a"));

    expect(selectedIds()).toEqual(["a"]);
  });

  it("moves the selection to another tapped node", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    tapOn(nodeElement("b"));

    expect(selectedIds()).toEqual(["b"]);
  });

  it("shows both plus buttons only on the selected node", () => {
    openMap(SAMPLE);

    tapOn(nodeElement("a"));

    expect(container.querySelectorAll(".pinchmap-add-button")).toHaveLength(2);
    expect(plusButton("a", "add-child").getAttribute("data-node-id")).toBe("a");
    expect(plusButton("a", "add-sibling").getAttribute("data-node-id")).toBe("a");
    expect(nodeElement("b").querySelector(".pinchmap-add-button")).toBeNull();
  });

  it("clears the selection when empty canvas is tapped", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    tapOn(canvas());

    expect(selectedIds()).toEqual([]);
    expect(container.querySelector(".pinchmap-add-button")).toBeNull();
  });

  it("does not select anything after a map is loaded", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    openMap(SAMPLE);

    expect(selectedIds()).toEqual([]);
  });

  it("does not change the map or autosave when only selecting", () => {
    openMap(SAMPLE);

    tapOn(nodeElement("a"));
    tapOn(canvas());

    expect(editor.getMap()).toBe(SAMPLE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });
});

describe("MapEditor adding nodes", () => {
  it("adds a last child with Tab, selects it and opens it for text input", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("r1"));

    press("Tab");

    const [newId] = selectedIds();
    expect(nodeElement(newId ?? "").contains(textarea())).toBe(true);
    expect(editor.isEditingText()).toBe(true);
    typeAndCommit("x");
    const childIds = getNode(editor.getMap(), "r1").childIds;
    expect(childIds).toHaveLength(4);
    expect(childIds[3]).toBe(newId);
  });

  it("keeps the typed text of a new child and reports one change", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("r1"));
    press("Tab");

    typeAndCommit("Fresh");

    const childIds = getNode(editor.getMap(), "r1").childIds;
    expect(getNode(editor.getMap(), childIds[3] ?? "").text).toBe("Fresh");
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
    expect(editor.isEditingText()).toBe(false);
  });

  it("adds a sibling right after the selected node with Enter", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    press("Enter");

    const selectionWhileEditing = selectedIds();
    typeAndCommit("x");
    const childIds = getNode(editor.getMap(), "r1").childIds;
    expect(childIds).toHaveLength(4);
    expect(childIds[0]).toBe("a");
    expect(childIds[2]).toBe("b");
    expect(selectionWhileEditing).toEqual([childIds[1]]);
  });

  it("adds a new root right after the selected root with Enter, not at the end", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("r1"));

    press("Enter");
    typeAndCommit("x");

    const { rootIds } = editor.getMap();
    expect(rootIds).toHaveLength(3);
    expect(rootIds[0]).toBe("r1");
    expect(rootIds[2]).toBe("r2");
    expect(getNode(editor.getMap(), rootIds[1] ?? "").parentId).toBeNull();
  });

  it("adds a child when the plus button on the right is tapped", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    tapOn(plusButton("a", "add-child"));
    expect(editor.isEditingText()).toBe(true);
    typeAndCommit("x");

    expect(getNode(editor.getMap(), "a").childIds).toHaveLength(1);
  });

  it("adds a sibling when the plus button below is tapped", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    tapOn(plusButton("a", "add-sibling"));
    typeAndCommit("x");

    const childIds = getNode(editor.getMap(), "r1").childIds;
    expect(childIds).toHaveLength(4);
    expect(childIds[0]).toBe("a");
    expect(childIds[2]).toBe("b");
  });

  it("does nothing on Tab or Enter when no node is selected", () => {
    openMap(SAMPLE);

    press("Tab");
    press("Enter");

    expect(editor.getMap()).toBe(SAMPLE);
    expect(editor.isEditingText()).toBe(false);
  });

  it("gives every new node an id that no existing node has", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("r1"));

    press("Tab");
    typeAndCommit("one");
    press("Tab");
    typeAndCommit("two");

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size + 2);
  });
});

describe("MapEditor discarding an empty new node", () => {
  it("removes a new node whose input finished empty and reports no map change", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Enter");

    typeAndCommit("");

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".pinchmap-node")).toHaveLength(SAMPLE.nodes.size);
  });

  it("restores the selection that existed before the node was created", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");

    typeAndCommit("");

    expect(selectedIds()).toEqual(["a"]);
  });

  it("restores the map exactly, including the root list", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("r1"));
    press("Enter");

    typeAndCommit("");

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
  });

  it("discards a new node whose text is only whitespace", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Enter");

    typeAndCommit("   ");

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("discards a new node when the pending edit is committed from outside", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Enter");

    editor.commitPendingEdit();

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("discards a new node when the user taps elsewhere", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Enter");

    tapOn(canvas());

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size);
    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(editor.isEditingText()).toBe(false);
  });
});

describe("MapEditor clearing the text of an existing node", () => {
  it("keeps the node on the map as an empty node and reports the change", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    expect(editor.isEditingText()).toBe(true);

    typeAndCommit("");

    expect(getNode(editor.getMap(), "a").text).toBe("");
    expect(getNode(editor.getMap(), "r1").childIds).toContain("a");
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });
});

describe("MapEditor deleting", () => {
  it("deletes the selected node with its descendants on Delete", () => {
    const deep = buildMindMap([
      { id: "r1", text: "Root", parentId: null },
      { id: "a", text: "A", parentId: "r1" },
      { id: "a1", text: "A1", parentId: "a" },
      { id: "b", text: "B", parentId: "r1" },
    ]);
    openMap(deep);
    tapOn(nodeElement("a"));

    press("Delete");

    expect([...editor.getMap().nodes.keys()].sort()).toEqual(["b", "r1"]);
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll(".pinchmap-node")).toHaveLength(2);
  });

  it("deletes with Backspace too", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("b"));

    press("Backspace");

    expect(editor.getMap().nodes.has("b")).toBe(false);
  });

  it("selects the previous sibling after deleting", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("b"));

    press("Delete");

    expect(selectedIds()).toEqual(["a"]);
  });

  it("selects the next sibling after deleting the first child", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    press("Delete");

    expect(selectedIds()).toEqual(["b"]);
  });

  it("selects the parent after deleting an only child", () => {
    const single = buildMindMap([
      { id: "r1", text: "Root", parentId: null },
      { id: "a", text: "A", parentId: "r1" },
    ]);
    openMap(single);
    tapOn(nodeElement("a"));

    press("Delete");

    expect(selectedIds()).toEqual(["r1"]);
  });

  it("keeps the only root blank and selected after deleting it", () => {
    openMap(buildMindMap([{ id: "r1", text: "Root", parentId: null }]));
    tapOn(nodeElement("r1"));

    press("Delete");

    expect([...editor.getMap().nodes.values()].map((node) => node.text)).toEqual([""]);
    expect(selectedIds()).toEqual(["r1"]);
  });

  it("does nothing on Delete when no node is selected", () => {
    openMap(SAMPLE);

    press("Delete");

    expect(editor.getMap()).toBe(SAMPLE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("does not delete the node when Delete or Backspace is pressed while editing its text", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));

    press("Delete", textarea());
    press("Backspace", textarea());

    expect(editor.getMap().nodes.has("a")).toBe(true);
    expect(editor.isEditingText()).toBe(true);
  });

  it("does not turn Tab or Enter into new nodes while editing text", () => {
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    const sizeBefore = editor.getMap().nodes.size;

    press("Tab", textarea());

    expect(editor.getMap().nodes.size).toBe(sizeBefore);
  });
});

describe("MapEditor autosave and an uncommitted new node", () => {
  // Production bug: getMap() (read by MapView.getViewData on any autosave or Obsidian save)
  // already contains the empty new node while its text input is open.
  it("keeps an uncommitted new node out of the map handed to autosave", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");

    expect(editor.isEditingText()).toBe(true);
    expect([...editor.getMap().nodes.keys()].sort()).toEqual([...SAMPLE.nodes.keys()].sort());
    expect(container.querySelectorAll(".pinchmap-node")).toHaveLength(SAMPLE.nodes.size + 1);
  });

  it("includes the new node in the map once its text is committed", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");

    typeAndCommit("New");

    expect(editor.getMap().nodes.size).toBe(SAMPLE.nodes.size + 1);
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect an uncommitted new node when a map is loaded", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");

    openMap(SAMPLE);

    expect(editor.isEditingText()).toBe(false);
    expect(editor.getMap()).toBe(SAMPLE);
    expect(container.querySelectorAll(".pinchmap-node")).toHaveLength(SAMPLE.nodes.size);
  });

  it("keeps a typed but uncommitted new node out of the map until the pending edit is committed", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("Tab");
    const [newId = ""] = selectedIds();
    const input = textarea();
    input.value = "Draft";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(editor.getMap().nodes.has(newId)).toBe(false);
    expect(host.onMapChanged).not.toHaveBeenCalled();

    editor.commitPendingEdit();

    expect(getNode(editor.getMap(), newId).text).toBe("Draft");
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
    expect(editor.isEditingText()).toBe(false);
  });

  it("labels the plus buttons for assistive technology", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    expect(plusButton("a", "add-child").getAttribute("aria-label")).toBe("Add child");
    expect(plusButton("a", "add-sibling").getAttribute("aria-label")).toBe("Add sibling");
    expect(plusButton("a", "add-child").getAttribute("role")).toBe("button");
  });
});

describe("MapEditor returning focus to the canvas", () => {
  let focusSpy: ReturnType<typeof vi.spyOn>;
  let outsideInput: HTMLInputElement;

  beforeEach(() => {
    outsideInput = document.createElement("input");
    document.body.appendChild(outsideInput);
    openMap(SAMPLE);
    doubleTapOn(nodeElement("a"));
    focusSpy = vi.spyOn(canvas(), "focus");
  });

  afterEach(() => {
    outsideInput.remove();
  });

  it("does not take focus back when the user focuses an outside input mid-edit", () => {
    outsideInput.focus();
    flushFrames();

    expect(editor.isEditingText()).toBe(false);
    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outsideInput);
  });

  it("focuses the canvas after the edit is committed with Ctrl+Enter", () => {
    typeAndCommit("Changed");

    expect(document.activeElement).toBe(canvas());
  });

  it("focuses the canvas after the edit is ended with Escape", () => {
    press("Escape", textarea());

    expect(document.activeElement).toBe(canvas());
  });

  it("focuses the canvas when the input loses focus to an element inside the canvas", () => {
    textarea().dispatchEvent(new FocusEvent("blur", { relatedTarget: nodeElement("b") }));

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it("does not take focus when the input loses focus to an element outside the canvas", () => {
    textarea().dispatchEvent(new FocusEvent("blur", { relatedTarget: outsideInput }));

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("does not take focus when the input loses focus to nothing", () => {
    textarea().dispatchEvent(new FocusEvent("blur"));

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("does not refocus the canvas when the edit is committed programmatically", () => {
    editor.commitPendingEdit();

    expect(editor.isEditingText()).toBe(false);
    expect(focusSpy).not.toHaveBeenCalled();
  });
});

describe("MapEditor placing a new root", () => {
  const TREE = buildMindMap([
    { id: "r1", text: "Root", parentId: null },
    { id: "a", text: "A", parentId: "r1" },
    { id: "b", text: "B", parentId: "r1" },
    { id: "c", text: "C", parentId: "r1" },
    { id: "r2", text: "Second root", parentId: null },
  ]);
  const PINNED = buildMindMap([{ id: "far", text: "Far", parentId: null, state: { x: 2000, y: 0 } }]);
  const ROOT_GAP = 48;
  const NODE_HEIGHT = 20;
  let sizeSpies: ReturnType<typeof vi.spyOn>[];

  function giveEveryNodeASize(): void {
    sizeSpies = [
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100),
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(NODE_HEIGHT),
    ];
  }

  afterEach(() => {
    sizeSpies?.forEach((spy) => spy.mockRestore());
    sizeSpies = [];
  });

  function newRootPosition(afterAnchor: string) {
    const roots = editor.getMap().rootIds;
    const newId = roots[roots.indexOf(afterAnchor) + 1] ?? "";
    return { id: newId, position: readRootPosition(getNode(editor.getMap(), newId).state) };
  }

  it("passes no position when no node has been measured", () => {
    openMap(TREE);
    tapOn(nodeElement("r1"));

    press("Enter");
    typeAndCommit("New root");

    expect(newRootPosition("r1").position).toBeUndefined();
  });

  function layoutOfCurrentMap() {
    const sizes = new Map<string, Size>(
      [...editor.getMap().nodes.keys()].map((id) => [id, { width: 100, height: NODE_HEIGHT }]),
    );
    return computeLayout(editor.getMap(), sizes);
  }

  function layoutRect(layout: ReturnType<typeof layoutOfCurrentMap>, id: string) {
    const center = layout.positions.get(id) ?? { x: Number.NaN, y: Number.NaN };
    const heights = layout.sideHeights.get(id) ?? { left: 0, right: 0 };
    const blockHeight = Math.max(NODE_HEIGHT, heights.left, heights.right);
    const top = center.y - blockHeight / 2;
    return { x: center.x, top, bottom: top + blockHeight };
  }

  it("adds an unpositioned root right after an unpositioned anchor and stacks it under the anchor tree", () => {
    giveEveryNodeASize();
    openMap(TREE);
    const before = layoutOfCurrentMap();
    tapOn(nodeElement("r1"));

    press("Enter");
    typeAndCommit("New root");

    const { id, position } = newRootPosition("r1");
    const after = layoutOfCurrentMap();
    expect(position).toBeUndefined();
    expect(getNode(editor.getMap(), id).state).toBeUndefined();
    expect(layoutRect(after, id).top).toBeGreaterThanOrEqual(layoutRect(after, "r1").bottom + ROOT_GAP);
    expect(after.positions.get("r1")).toEqual(before.positions.get("r1"));
  });

  it("keeps the anchor's saved position and puts the new root's rect under its tree", () => {
    giveEveryNodeASize();
    openMap(
      buildMindMap([
        { id: "far", text: "Far", parentId: null, state: { x: 2000, y: 0 } },
        { id: "f1", text: "F1", parentId: "far" },
        { id: "loose", text: "Loose", parentId: null },
      ]),
    );
    const before = layoutOfCurrentMap();
    tapOn(nodeElement("far"));

    press("Enter");
    typeAndCommit("Below far");

    const { id } = newRootPosition("far");
    const after = layoutOfCurrentMap();
    const newRect = layoutRect(after, id);
    expect(newRect.x).toBe(2000);
    expect(newRect.top).toBeGreaterThanOrEqual(layoutRect(after, "far").bottom + ROOT_GAP);
    expect(after.positions.get("far")).toEqual(before.positions.get("far"));
    expect(readRootPosition(getNode(editor.getMap(), "loose").state)).toBeUndefined();
  });

  it("places a new root under the anchor, not under another tree, when the anchor has a saved position", () => {
    giveEveryNodeASize();
    openMap(
      buildMindMap([
        { id: "far", text: "Far", parentId: null, state: { x: 2000, y: 0 } },
        { id: "near", text: "Near", parentId: null, state: { x: 0, y: 0 } },
        { id: "n1", text: "N1", parentId: "near" },
        { id: "n2", text: "N2", parentId: "near" },
      ]),
    );
    tapOn(nodeElement("far"));

    press("Enter");
    typeAndCommit("Below far");

    expect(newRootPosition("far").position).toEqual({ x: 2000, y: NODE_HEIGHT + ROOT_GAP });
  });

  it("stores the position of a new root in the map and reports one change", () => {
    giveEveryNodeASize();
    openMap(PINNED);
    tapOn(nodeElement("far"));
    press("Enter");

    typeAndCommit("New root");

    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
    expect(newRootPosition("far").position).toEqual({ x: 2000, y: NODE_HEIGHT + ROOT_GAP });
  });

  it("does not give a position to a sibling that is not a root", () => {
    giveEveryNodeASize();
    openMap(TREE);
    tapOn(nodeElement("a"));

    press("Enter");
    typeAndCommit("Sibling");

    const childIds = getNode(editor.getMap(), "r1").childIds;
    expect(getNode(editor.getMap(), childIds[1] ?? "").state).toBeUndefined();
  });
});

describe("MapEditor choosing the side of a new branch", () => {
  const LEFT_BRANCH = buildMindMap([
    { id: "r1", text: "Root", parentId: null },
    { id: "a", text: "A", parentId: "r1" },
    { id: "l", text: "L", parentId: "r1", state: { side: "left" } },
  ]);
  let sizeSpies: ReturnType<typeof vi.spyOn>[];

  beforeEach(() => {
    sizeSpies = [
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100),
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(20),
    ];
  });

  afterEach(() => {
    sizeSpies.forEach((spy) => spy.mockRestore());
  });

  function newChildOf(parentId: string, existing: readonly string[]): string {
    const created = getNode(editor.getMap(), parentId).childIds.find((id) => !existing.includes(id));
    if (created === undefined) throw new Error("no new child");
    return created;
  }

  it("puts a sibling of a left first-level branch on the left", () => {
    openMap(LEFT_BRANCH);
    tapOn(nodeElement("l"));

    press("Enter");
    typeAndCommit("Another left");

    const created = newChildOf("r1", ["a", "l"]);
    expect(readSide(getNode(editor.getMap(), created).state)).toBe("left");
  });

  it("puts a sibling of a right first-level branch on the right", () => {
    openMap(LEFT_BRANCH);
    tapOn(nodeElement("a"));

    press("Enter");
    typeAndCommit("Another right");

    const created = newChildOf("r1", ["a", "l"]);
    expect(readSide(getNode(editor.getMap(), created).state)).toBe("right");
  });

  it("adds a branch to the lighter left side when Tab is pressed on a root with a heavier right side", () => {
    openMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "a", text: "A", parentId: "r1" },
        { id: "b", text: "B", parentId: "r1" },
      ]),
    );
    tapOn(nodeElement("r1"));

    press("Tab");
    typeAndCommit("Balanced");

    const created = newChildOf("r1", ["a", "b"]);
    expect(readSide(getNode(editor.getMap(), created).state)).toBe("left");
  });

  it("adds a branch to the right when Tab is pressed on a root with a heavier left side", () => {
    openMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "l1", text: "L1", parentId: "r1", state: { side: "left" } },
        { id: "l2", text: "L2", parentId: "r1", state: { side: "left" } },
      ]),
    );
    tapOn(nodeElement("r1"));

    press("Tab");
    typeAndCommit("Right one");

    const created = newChildOf("r1", ["l1", "l2"]);
    expect(readSide(getNode(editor.getMap(), created).state)).toBe("right");
  });
});

describe("MapEditor keyboard shortcuts for text input", () => {
  it("opens text input for the selected node on F2", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    press("F2");

    expect(textarea().value).toBe("A");
    expect(editor.isEditingText()).toBe(true);
  });

  it("does nothing on F2 when no node is selected", () => {
    openMap(SAMPLE);

    press("F2");

    expect(container.querySelector("textarea")).toBeNull();
    expect(editor.isEditingText()).toBe(false);
  });

  it("saves the text edited after F2 when committed with Ctrl+Enter", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("F2");

    typeAndCommit("Renamed");

    expect(getNode(editor.getMap(), "a").text).toBe("Renamed");
  });

  it("clears the selection on Escape outside text input", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    press("Escape");

    expect(selectedIds()).toEqual([]);
    expect(container.querySelector(".pinchmap-add-button")).toBeNull();
  });

  it("keeps the map unchanged when Escape clears the selection", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    press("Escape");

    expect(editor.getMap()).toBe(SAMPLE);
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("ends text input but keeps the selection when Escape is pressed in the input", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("F2");

    press("Escape", textarea());

    expect(editor.isEditingText()).toBe(false);
    expect(selectedIds()).toEqual(["a"]);
  });

  it("creates no node and keeps editing when Enter is pressed in the input", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("F2");
    const nodeCount = editor.getMap().nodes.size;

    press("Enter", textarea());

    expect(editor.getMap().nodes.size).toBe(nodeCount);
    expect(editor.isEditingText()).toBe(true);
  });

  it("creates no node when the input is committed with Ctrl+Enter", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));
    press("F2");
    const nodeCount = editor.getMap().nodes.size;

    press("Enter", textarea(), { ctrlKey: true });

    expect(editor.getMap().nodes.size).toBe(nodeCount);
    expect(editor.isEditingText()).toBe(false);
  });
});

describe("MapEditor beginEditingNode", () => {
  it("selects the node and opens its text input", () => {
    openMap(SAMPLE);

    editor.beginEditingNode("b");

    expect(selectedIds()).toEqual(["b"]);
    expect(nodeElement("b").contains(textarea())).toBe(true);
    expect(editor.isEditingText()).toBe(true);
  });

  it("moves the selection from another node to the edited one", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    editor.beginEditingNode("c");

    expect(selectedIds()).toEqual(["c"]);
  });

  it("opens an empty root for typing with an empty input", () => {
    openMap(buildMindMap([{ id: "only", text: "", parentId: null }]));

    editor.beginEditingNode("only");

    expect(textarea().value).toBe("");
    expect(selectedIds()).toEqual(["only"]);
  });

  it("does nothing for an unknown id", () => {
    openMap(SAMPLE);
    tapOn(nodeElement("a"));

    editor.beginEditingNode("missing");

    expect(selectedIds()).toEqual(["a"]);
    expect(editor.isEditingText()).toBe(false);
    expect(container.querySelector("textarea")).toBeNull();
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("persists the text committed after it", () => {
    openMap(buildMindMap([{ id: "only", text: "", parentId: null }]));
    editor.beginEditingNode("only");

    typeAndCommit("First idea");

    expect(getNode(editor.getMap(), "only").text).toBe("First idea");
    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
    expect(editor.isEditingText()).toBe(false);
  });

  it("keeps an emptied existing node on the map when committed empty", () => {
    openMap(SAMPLE);
    editor.beginEditingNode("a");

    typeAndCommit("");

    expect(editor.getMap().nodes.has("a")).toBe(true);
  });
});
