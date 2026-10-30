// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap, getNode, readManualPosition } from "../model";
import type { MindMap } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./mapEditor";

const NODE_SIZE = { width: 80, height: 30 };
const DROP_TARGET_CLASS = "pinchmap-node--drop-target";
const FAR_AWAY = { x: 3000, y: 3000 };

interface Point {
  readonly x: number;
  readonly y: number;
}

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onHistoryChanged: Mock<(canUndo: boolean, canRedo: boolean) => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<(items: readonly MenuItem[], at: Point) => void>;
  notify: Mock<(message: string) => void>;
}

const LABELS = { addChild: "Добавить дочернюю", addSibling: "Добавить соседнюю", resetLayout: "Сброс", delete: "Удалить" };
const SAMPLE = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "a1x", text: "A1x", parentId: "a1" },
  { id: "b", text: "B", parentId: "r1", state: { color: "red" } },
  { id: "c", text: "C", parentId: "r1" },
  { id: "r2", text: "Second", parentId: null },
]);

// Unpositioned roots are stacked below the dragged (positioned) root, so they would run away from the finger.
const PINNED_ROOTS = buildMindMap([
  { id: "r1", text: "Root", parentId: null, state: { x: 0, y: 0 } },
  { id: "a", text: "A", parentId: "r1" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "c", text: "C", parentId: "r1" },
  { id: "r2", text: "Second", parentId: null, state: { x: 0, y: 600 } },
]);

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let pendingFrames: (() => void)[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(NODE_SIZE.width);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(NODE_SIZE.height);
  container = document.createElement("div");
  document.body.appendChild(container);
  host = { onMapChanged: vi.fn(), onHistoryChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() };
  pendingFrames = [];
  editor = new MapEditor({
    container,
    host,
    requestFrame: (callback) => pendingFrames.push(callback),
    nodeMenuLabels: LABELS,
  });
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

function reloadMap(map: MindMap): void {
  editor.reloadMap(map);
  flushFrames();
}

function openMap(map: MindMap): void {
  editor.loadMap(map);
  flushFrames();
  host.onMapChanged.mockClear();
  host.onHistoryChanged.mockClear();
}

function fire(target: Element, type: string, at: Point, pointerId = 1, isPrimary = true): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: "touch",
    button: 0,
    isPrimary,
    clientX: at.x,
    clientY: at.y,
  });
  Object.defineProperty(event, "timeStamp", { value: type === "pointerup" ? 100 : 10 });
  target.dispatchEvent(event);
  flushFrames();
}

function cameraParts(): { x: number; y: number; zoom: number } {
  const transform = container.querySelector<HTMLElement>(".pinchmap-world")?.style.transform ?? "";
  const match = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\) scale\((-?[\d.e-]+)\)/.exec(transform);
  if (match === null) throw new Error(`no camera transform: ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]), zoom: Number(match[3]) };
}

/** Screen position of the node's center, where a finger would touch it. */
function centerOf(id: string): Point {
  const element = nodeElement(id);
  const camera = cameraParts();
  return {
    x: (parseFloat(element.style.left) + NODE_SIZE.width / 2) * camera.zoom + camera.x,
    y: (parseFloat(element.style.top) + NODE_SIZE.height / 2) * camera.zoom + camera.y,
  };
}

function placement(id: string): Point {
  const element = nodeElement(id);
  return { x: parseFloat(element.style.left), y: parseFloat(element.style.top) };
}

function pressOn(id: string): Point {
  const start = centerOf(id);
  fire(nodeElement(id), "pointerdown", start);
  return start;
}

function dragTo(start: Point, to: Point): void {
  fire(canvas(), "pointermove", { x: start.x + (to.x - start.x) / 2, y: start.y + (to.y - start.y) / 2 });
  fire(canvas(), "pointermove", to);
}

function hover(draggedId: string, over: Point): Point {
  const start = pressOn(draggedId);
  dragTo(start, over);
  return start;
}

function release(at: Point): void {
  fire(canvas(), "pointerup", at);
}

function dragOnto(draggedId: string, targetId: string): void {
  const target = centerOf(targetId);
  hover(draggedId, target);
  release(target);
}

function highlighted(): string[] {
  return [...container.querySelectorAll<HTMLElement>(`.pinchmap-node.${DROP_TARGET_CLASS}`)].map((element) => element.dataset.nodeId ?? "");
}

function parentOf(id: string): string | null {
  return getNode(editor.getMap(), id).parentId;
}

function pinned(id: string): Point | undefined {
  return readManualPosition(getNode(editor.getMap(), id).state);
}

function pressKey(key: string, modifiers: { shiftKey?: boolean } = {}): void {
  canvas().dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, code: `Key${key.toUpperCase()}`, bubbles: true, cancelable: true, ...modifiers }));
  flushFrames();
}

describe("drop target highlight", () => {
  it("highlights the node under the finger while another node is dragged over it", () => {
    openMap(SAMPLE);

    hover("a", centerOf("b"));

    expect(highlighted()).toEqual(["b"]);
  });

  it("highlights nothing before the drag starts", () => {
    openMap(SAMPLE);

    pressOn("a");

    expect(highlighted()).toEqual([]);
  });

  it("highlights nothing over empty space", () => {
    openMap(SAMPLE);

    hover("a", FAR_AWAY);

    expect(highlighted()).toEqual([]);
  });

  it("moves the highlight from one node to the next as the finger moves", () => {
    openMap(SAMPLE);
    const start = hover("a", centerOf("b"));

    dragTo(start, centerOf("c"));

    expect(highlighted()).toEqual(["c"]);
  });

  it("removes the highlight when the finger leaves the target for empty space", () => {
    openMap(SAMPLE);
    const start = hover("a", centerOf("b"));

    dragTo(start, FAR_AWAY);

    expect(highlighted()).toEqual([]);
  });

  it("does not highlight the dragged node itself", () => {
    openMap(SAMPLE);

    hover("a", centerOf("b"));

    expect(nodeElement("a").classList.contains(DROP_TARGET_CLASS)).toBe(false);
  });

  it("does not highlight a child of the dragged node when the finger is over it", () => {
    openMap(SAMPLE);
    const start = pressOn("a");
    const childCenter = centerOf("a1");

    dragTo(start, childCenter);

    expect(highlighted()).toEqual([]);
  });

  it("does not highlight a deeper descendant of the dragged node", () => {
    openMap(SAMPLE);
    const start = pressOn("a");
    const deepCenter = centerOf("a1x");

    dragTo(start, deepCenter);

    expect(highlighted()).toEqual([]);
  });

  it("does not highlight the current parent", () => {
    openMap(SAMPLE);

    hover("a", centerOf("r1"));

    expect(highlighted()).toEqual([]);
  });

  it("highlights a node outside the dragged branch even when it is a sibling of the parent", () => {
    openMap(SAMPLE);

    hover("a1", centerOf("c"));

    expect(highlighted()).toEqual(["c"]);
  });

  it("highlights a node of another root while a root is dragged", () => {
    openMap(PINNED_ROOTS);

    hover("r2", centerOf("c"));

    expect(highlighted()).toEqual(["c"]);
  });

  it("does not highlight a descendant of a dragged root", () => {
    openMap(PINNED_ROOTS);
    const start = pressOn("r1");

    dragTo(start, centerOf("c"));

    expect(highlighted()).toEqual([]);
  });

  it("still highlights the target after the camera was zoomed", () => {
    openMap(SAMPLE);
    canvas().dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
    flushFrames();

    hover("a", centerOf("b"));

    expect(highlighted()).toEqual(["b"]);
  });
});

describe("clearing the highlight", () => {
  it("clears it when the drag ends", () => {
    openMap(SAMPLE);
    dragOnto("a", "b");

    expect(highlighted()).toEqual([]);
  });

  it("clears it when the drag ends over empty space", () => {
    openMap(SAMPLE);
    const start = hover("a", centerOf("b"));
    dragTo(start, FAR_AWAY);
    release(FAR_AWAY);

    expect(highlighted()).toEqual([]);
  });

  it("clears it when the pointer is cancelled", () => {
    openMap(SAMPLE);
    const target = centerOf("b");
    hover("a", target);

    fire(canvas(), "pointercancel", target);

    expect(highlighted()).toEqual([]);
  });

  it("clears it when a second finger cancels the drag", () => {
    openMap(SAMPLE);
    hover("a", centerOf("b"));

    fire(canvas(), "pointerdown", { x: 600, y: 500 }, 2, false);

    expect(highlighted()).toEqual([]);
  });

  it("clears it when another map is loaded mid-drag", () => {
    openMap(SAMPLE);
    hover("a", centerOf("b"));

    openMap(SAMPLE);

    expect(highlighted()).toEqual([]);
  });
});

describe("releasing a dragged node", () => {
  it("makes the node the last child of the node it is released over", () => {
    openMap(SAMPLE);

    dragOnto("a", "b");

    expect(parentOf("a")).toBe("b");
    expect(getNode(editor.getMap(), "b").childIds).toEqual(["a"]);
  });

  it("appends after the existing children of the target", () => {
    openMap(SAMPLE);

    dragOnto("c", "a");

    expect(getNode(editor.getMap(), "a").childIds).toEqual(["a1", "c"]);
  });

  it("takes the node out of the list of its old siblings", () => {
    openMap(SAMPLE);

    dragOnto("a", "b");

    expect(getNode(editor.getMap(), "r1").childIds).toEqual(["b", "c"]);
  });

  it("brings the children of the moved node along", () => {
    openMap(SAMPLE);

    dragOnto("a", "b");

    expect(parentOf("a1")).toBe("a");
    expect(parentOf("a1x")).toBe("a1");
  });

  it("keeps the node ids and the other state of the moved node", () => {
    openMap(SAMPLE);

    dragOnto("b", "c");

    expect(getNode(editor.getMap(), "b").state).toEqual({ color: "red" });
    expect([...editor.getMap().nodes.keys()].sort()).toEqual([...SAMPLE.nodes.keys()].sort());
  });

  it("does not store the drop position: the node stands at its auto-layout place under the new parent", () => {
    openMap(SAMPLE);

    dragOnto("a", "b");

    expect(pinned("a")).toBeUndefined();
    expect(placement("a").x).toBeGreaterThan(placement("b").x);
  });

  it("drops a previous manual position of the moved node", () => {
    openMap(SAMPLE);
    const start = pressOn("a");
    dragTo(start, FAR_AWAY);
    release(FAR_AWAY);
    expect(pinned("a")).toBeDefined();

    dragOnto("a", "b");

    expect(pinned("a")).toBeUndefined();
  });

  it("makes a root a child of the node it is released over, together with its tree", () => {
    openMap(PINNED_ROOTS);

    dragOnto("r2", "a1");

    expect(editor.getMap().rootIds).toEqual(["r1"]);
    expect(parentOf("r2")).toBe("a1");
    expect(pinned("r2")).toBeUndefined();
  });

  it("moves a whole root tree under another root as a branch", () => {
    openMap(PINNED_ROOTS);

    dragOnto("r1", "r2");

    expect(editor.getMap().rootIds).toEqual(["r2"]);
    expect(getNode(editor.getMap(), "r2").childIds).toEqual(["r1"]);
    expect(getNode(editor.getMap(), "r1").childIds).toEqual(["a", "c"]);
  });

  it("reports one change for the whole drag, at release", () => {
    openMap(SAMPLE);
    const target = centerOf("b");
    const start = hover("a", target);
    dragTo(start, target);
    expect(host.onMapChanged).not.toHaveBeenCalled();

    release(target);

    expect(host.onMapChanged).toHaveBeenCalledTimes(1);
  });

  it("selects the moved node", () => {
    openMap(SAMPLE);

    dragOnto("a", "b");

    expect(nodeElement("a").classList.contains("is-selected")).toBe(true);
  });
});

describe("the side of a branch moved under a root", () => {
  it("puts the branch on the left when the right side of the root is the taller one", () => {
    openMap(SAMPLE);

    dragOnto("a1", "r1");

    expect(getNode(editor.getMap(), "a1").state).toEqual({ side: "left" });
    expect(placement("a1").x).toBeLessThan(placement("r1").x);
  });

  it("puts the branch on the right when the root has nothing on either side", () => {
    openMap(SAMPLE);

    dragOnto("a", "r2");

    expect(getNode(editor.getMap(), "a").state).toBeUndefined();
    expect(placement("a").x).toBeGreaterThan(placement("r2").x);
  });

  it("puts the branch on the right when the left side of the root is the taller one", () => {
    openMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "a", text: "A", parentId: "r1" },
        { id: "x", text: "X", parentId: "a" },
        { id: "l1", text: "L1", parentId: "r1", state: { side: "left" } },
        { id: "l2", text: "L2", parentId: "r1", state: { side: "left" } },
        { id: "l3", text: "L3", parentId: "r1", state: { side: "left" } },
      ]),
    );

    dragOnto("x", "r1");

    expect(getNode(editor.getMap(), "x").state).toBeUndefined();
    expect(placement("x").x).toBeGreaterThan(placement("r1").x);
  });

  it("stores no side for a branch moved under a node that is not a root", () => {
    openMap(SAMPLE);
    dragOnto("a1", "r1");

    dragOnto("a1", "b");

    expect(getNode(editor.getMap(), "a1").state).toBeUndefined();
  });
});

describe("releasing without a target", () => {
  it("only moves the node over empty space and keeps the parent", () => {
    openMap(SAMPLE);
    const start = pressOn("a");

    dragTo(start, FAR_AWAY);
    release(FAR_AWAY);

    expect(parentOf("a")).toBe("r1");
    expect(getNode(editor.getMap(), "r1").childIds).toEqual(["a", "b", "c"]);
    expect(pinned("a")).toBeDefined();
  });

  it("only moves the node when it is released over its current parent", () => {
    openMap(SAMPLE);
    const parent = centerOf("r1");
    hover("a", parent);

    release(parent);

    expect(parentOf("a")).toBe("r1");
    expect(getNode(editor.getMap(), "r1").childIds).toEqual(["a", "b", "c"]);
    expect(pinned("a")).toBeDefined();
  });

  it("only moves the node when it is released over a part of its own branch", () => {
    openMap(SAMPLE);
    const start = pressOn("a");
    const childCenter = centerOf("a1");

    dragTo(start, childCenter);
    release(childCenter);

    expect(parentOf("a")).toBe("r1");
    expect(parentOf("a1")).toBe("a");
  });

  it("changes nothing for a movement below the drag threshold", () => {
    openMap(SAMPLE);
    const start = pressOn("a");

    fire(canvas(), "pointermove", { x: start.x + 5, y: start.y });
    release({ x: start.x + 5, y: start.y });

    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(parentOf("a")).toBe("r1");
  });

  it("changes nothing when the pointer is cancelled over a target", () => {
    openMap(SAMPLE);
    const target = centerOf("b");
    hover("a", target);

    fire(canvas(), "pointercancel", target);

    expect(parentOf("a")).toBe("r1");
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("changes nothing when a second finger cancels a drag over a target", () => {
    openMap(SAMPLE);
    hover("a", centerOf("b"));

    fire(canvas(), "pointerdown", { x: 600, y: 500 }, 2, false);
    release(centerOf("b"));

    expect(parentOf("a")).toBe("r1");
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("does not reparent when the finger left the target again before release", () => {
    openMap(SAMPLE);
    const start = hover("a", centerOf("b"));

    dragTo(start, FAR_AWAY);
    release(FAR_AWAY);

    expect(parentOf("a")).toBe("r1");
  });
});

describe("a reparent preview before release", () => {
  it("keeps the saved map unchanged while the node hovers over a target", () => {
    openMap(SAMPLE);
    const committed = editor.getMap();

    hover("a", centerOf("b"));

    expect(editor.getMap()).toBe(committed);
    expect(parentOf("a")).toBe("r1");
    expect(pinned("a")).toBeUndefined();
  });

  it("leaves the saved map with the old parent when the drag is then cancelled", () => {
    openMap(SAMPLE);
    const target = centerOf("b");
    hover("a", target);
    const savedMidDrag = editor.getMap();

    fire(canvas(), "pointercancel", target);

    expect(getNode(savedMidDrag, "a").parentId).toBe("r1");
    expect(getNode(editor.getMap(), "a").parentId).toBe("r1");
  });

  it("reports no change and no history entry while hovering", () => {
    openMap(SAMPLE);

    hover("a", centerOf("b"));

    expect(host.onMapChanged).not.toHaveBeenCalled();
    expect(host.onHistoryChanged).not.toHaveBeenCalled();
  });
});

describe("undo and redo of a change of parent", () => {
  it("restores the old parent and the old place among the siblings with one undo", () => {
    openMap(SAMPLE);
    dragOnto("a", "c");

    pressKey("z");

    expect(parentOf("a")).toBe("r1");
    expect(getNode(editor.getMap(), "r1").childIds).toEqual(["a", "b", "c"]);
    expect(getNode(editor.getMap(), "c").childIds).toEqual([]);
  });

  it("restores the old manual position with the same single undo", () => {
    openMap(SAMPLE);
    const start = pressOn("a");
    dragTo(start, FAR_AWAY);
    release(FAR_AWAY);
    const pinnedBefore = pinned("a");
    const placedBefore = placement("a");
    dragOnto("a", "c");

    pressKey("z");

    expect(pinned("a")).toEqual(pinnedBefore);
    expect(placement("a")).toEqual(placedBefore);
  });

  it("restores a root and the root order with one undo", () => {
    openMap(PINNED_ROOTS);
    dragOnto("r1", "r2");

    pressKey("z");

    expect(editor.getMap().rootIds).toEqual(["r1", "r2"]);
    expect(parentOf("r1")).toBeNull();
    expect(pinned("r1")).toEqual({ x: 0, y: 0 });
  });

  it("restores the side of the moved branch with one undo", () => {
    openMap(SAMPLE);
    dragOnto("a1", "r1");

    pressKey("z");

    expect(getNode(editor.getMap(), "a1").state).toBeUndefined();
    expect(parentOf("a1")).toBe("a");
  });

  it("needs a second undo to go back past the change of parent", () => {
    openMap(SAMPLE);
    dragOnto("c", "a");
    dragOnto("a", "b");

    pressKey("z");

    expect(parentOf("a")).toBe("r1");
    expect(parentOf("c")).toBe("a");
  });

  it("applies the same change of parent again on redo", () => {
    openMap(SAMPLE);
    dragOnto("a", "c");
    pressKey("z");

    pressKey("z", { shiftKey: true });

    expect(parentOf("a")).toBe("c");
    expect(getNode(editor.getMap(), "r1").childIds).toEqual(["b", "c"]);
    expect(pinned("a")).toBeUndefined();
  });
});

describe("reloading a map that was re-indented outside the editor", () => {
  const POSITIONED_ROOT = buildMindMap([
    { id: "r1", text: "Root", parentId: null },
    { id: "r2", text: "Second", parentId: null, state: { x: 400, y: 300 } },
  ]);

  it("clears the absolute position of a root that is now a child", () => {
    openMap(POSITIONED_ROOT);

    reloadMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "r2", text: "Second", parentId: "r1", state: { x: 400, y: 300 } },
      ]),
    );

    expect(pinned("r2")).toBeUndefined();
    expect(placement("r2").x).toBeGreaterThan(placement("r1").x);
  });

  it("clears the offset of a positioned child that now has another parent", () => {
    openMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "a", text: "A", parentId: "r1", state: { x: 90, y: 50, color: "red" } },
        { id: "b", text: "B", parentId: "r1" },
      ]),
    );

    reloadMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "a", text: "A", parentId: "b", state: { x: 90, y: 50, color: "red" } },
        { id: "b", text: "B", parentId: "r1" },
      ]),
    );

    expect(getNode(editor.getMap(), "a").state).toEqual({ color: "red" });
  });

  it("keeps the position of a root that is still a root", () => {
    openMap(POSITIONED_ROOT);

    reloadMap(POSITIONED_ROOT);

    expect(pinned("r2")).toEqual({ x: 400, y: 300 });
  });

  it("keeps the position of a node that was not in the previously shown map", () => {
    openMap(POSITIONED_ROOT);

    reloadMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "n", text: "New", parentId: "r1", state: { x: 12, y: 13 } },
      ]),
    );

    expect(pinned("n")).toEqual({ x: 12, y: 13 });
  });

  it("keeps positions when a different file is opened in the view", () => {
    openMap(POSITIONED_ROOT);

    openMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "r2", text: "Second", parentId: "r1", state: { x: 400, y: 300 } },
      ]),
    );

    expect(pinned("r2")).toEqual({ x: 400, y: 300 });
  });
});

describe("dragging a root while other roots have no position of their own", () => {
  it("leaves the other roots in place while the root is dragged", () => {
    openMap(SAMPLE);
    const secondRootBefore = placement("r2");

    hover("r1", FAR_AWAY);

    expect(placement("r2")).toEqual(secondRootBefore);
  });

  it("leaves the other roots in place after the root is dropped on empty space", () => {
    openMap(SAMPLE);
    const secondRootBefore = placement("r2");
    hover("r1", FAR_AWAY);

    release(FAR_AWAY);

    expect(placement("r2")).toEqual(secondRootBefore);
    expect(pinned("r2")).toEqual(secondRootBefore);
  });

  it("keeps a root that is lower in the stack in place when a root above it is dragged", () => {
    openMap(SAMPLE);
    const firstRootBefore = placement("r1");
    const childBefore = placement("c");

    hover("r2", { x: 600, y: -400 });

    expect(placement("r1")).toEqual(firstRootBefore);
    expect(placement("c")).toEqual(childBefore);
  });

  it("restores every root to auto-layout with one undo", () => {
    openMap(SAMPLE);
    const firstRootBefore = placement("r1");
    const secondRootBefore = placement("r2");
    hover("r1", FAR_AWAY);
    release(FAR_AWAY);

    pressKey("z");

    expect(pinned("r1")).toBeUndefined();
    expect(pinned("r2")).toBeUndefined();
    expect(placement("r1")).toEqual(firstRootBefore);
    expect(placement("r2")).toEqual(secondRootBefore);
  });

  it("does not pin anything for a root drag below the threshold", () => {
    openMap(SAMPLE);
    const start = pressOn("r1");

    fire(canvas(), "pointermove", { x: start.x + 5, y: start.y });
    release({ x: start.x + 5, y: start.y });

    expect(pinned("r2")).toBeUndefined();
    expect(host.onMapChanged).not.toHaveBeenCalled();
  });

  it("lets a root be dropped onto a node of another root without a position", () => {
    openMap(SAMPLE);

    dragOnto("r2", "c");

    expect(editor.getMap().rootIds).toEqual(["r1"]);
    expect(parentOf("r2")).toBe("c");
  });

  it("keeps a root that already has a position where it was", () => {
    openMap(
      buildMindMap([
        { id: "r1", text: "Root", parentId: null },
        { id: "r2", text: "Second", parentId: null, state: { x: 500, y: 500 } },
        { id: "r3", text: "Third", parentId: null },
      ]),
    );
    const thirdRootBefore = placement("r3");

    hover("r1", FAR_AWAY);
    release(FAR_AWAY);

    expect(pinned("r2")).toEqual({ x: 500, y: 500 });
    expect(placement("r3")).toEqual(thirdRootBefore);
  });
});
