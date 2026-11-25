// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap, NodeLink } from "../model";
import { MapEditor } from "./mapEditor";
import type { MenuItem } from "./menu";
import { giveEveryElementSize } from "./testSupport/nodeSize";

interface FakeHost {
  onMapChanged: Mock<() => void>;
  onHistoryChanged: Mock<(canUndo: boolean, canRedo: boolean) => void>;
  onTextEditEnded: Mock<() => void>;
  showMenu: Mock<(items: readonly MenuItem[], at: { x: number; y: number }) => void>;
  notify: Mock<(message: string) => void>;
  openLink: Mock<(link: NodeLink) => void>;
}

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "w", text: "see [[Note#Part|alias]]", parentId: "r" },
  { id: "x", text: "[site](https://www.example.com/page?q=1)", parentId: "r" },
  { id: "p", text: "plain", parentId: "r" },
]);

let container: HTMLElement;
let editor: MapEditor;
let host: FakeHost;
let drawIcon: Mock<(target: HTMLElement, iconName: string) => void>;
let pendingFrames: (() => void)[];
let clock = 0;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe(): void {} disconnect(): void {} });
  giveEveryElementSize({ width: 80, height: 30 });
  container = document.createElement("div");
  document.body.appendChild(container);
  host = {
    onMapChanged: vi.fn(),
    onHistoryChanged: vi.fn(),
    onTextEditEnded: vi.fn(),
    showMenu: vi.fn(),
    notify: vi.fn(),
    openLink: vi.fn(),
  };
  drawIcon = vi.fn();
  pendingFrames = [];
  editor = new MapEditor({
    container,
    host,
    drawIcon,
    linkBubbleLabels: { openLink: "Open link" },
    requestFrame: (callback) => pendingFrames.push(callback),
  });
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

function openMap(map: MindMap = MAP): void {
  editor.loadMap(map);
  flushFrames();
}

function nodeElement(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`node ${id} not rendered`);
  return element;
}

function iconOf(id: string): HTMLElement {
  const icon = nodeElement(id).querySelector<HTMLElement>(".pinchmap-link-icon");
  if (icon === null) throw new Error(`no link icon on ${id}`);
  return icon;
}

function firePointer(target: Element, type: string, init: { pointerType: string; timeStamp: number; clientX?: number }): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: init.pointerType,
    button: 0,
    isPrimary: true,
    clientX: init.clientX ?? 0,
    clientY: 0,
  });
  Object.defineProperty(event, "timeStamp", { value: init.timeStamp });
  target.dispatchEvent(event);
}

function tapOn(target: Element, pointerType: "touch" | "mouse" = "touch"): void {
  clock += 1000;
  firePointer(target, "pointerdown", { pointerType, timeStamp: clock });
  firePointer(target, "pointerup", { pointerType, timeStamp: clock + 50 });
  flushFrames();
}

function bubble(): HTMLElement | null {
  return container.querySelector<HTMLElement>(".pinchmap-link-bubble");
}

function bubbleButton(): HTMLElement {
  const button = bubble()?.querySelector<HTMLElement>("button");
  if (button === undefined || button === null) throw new Error("no bubble button");
  return button;
}

function selectedIds(): string[] {
  return [...container.querySelectorAll(".pinchmap-node.is-selected")].map((el) => el.getAttribute("data-node-id") ?? "");
}

describe("link icon on nodes", () => {
  it("is shown on every node that has a link, selected or not, and on no other", () => {
    openMap();

    expect(nodeElement("w").querySelector(".pinchmap-link-icon")).not.toBeNull();
    expect(nodeElement("x").querySelector(".pinchmap-link-icon")).not.toBeNull();
    expect(nodeElement("p").querySelector(".pinchmap-link-icon")).toBeNull();
  });

  it("appears when an edit adds a link to the node's text", () => {
    openMap();

    editor.loadMap(buildMindMap([{ id: "r", text: "now [[Note]]", parentId: null }]));
    flushFrames();

    expect(nodeElement("r").querySelector(".pinchmap-link-icon")).not.toBeNull();
  });
});

describe("opening the link bubble", () => {
  it("opens the bubble and selects the node on a tap on the icon", () => {
    openMap();

    tapOn(iconOf("w"));

    expect(bubble()).not.toBeNull();
    expect(selectedIds()).toEqual(["w"]);
  });

  it("opens the bubble on a mouse click on the icon", () => {
    openMap();

    tapOn(iconOf("w"), "mouse");

    expect(bubble()).not.toBeNull();
  });

  it("shows the note name without the heading as the second line for a wiki link", () => {
    openMap();

    tapOn(iconOf("w"));

    expect(bubbleButton().textContent).toContain("Open link");
    expect(bubble()?.querySelector(".pinchmap-link-bubble-target")?.textContent).toBe("Note");
  });

  it("shows only the host as the second line for an external link", () => {
    openMap();

    tapOn(iconOf("x"));

    expect(bubble()?.querySelector(".pinchmap-link-bubble-target")?.textContent).toBe("www.example.com");
  });

  it("asks for the file-text icon for a wiki link", () => {
    openMap();
    tapOn(iconOf("w"));
    expect(drawIcon).toHaveBeenCalledWith(expect.any(HTMLElement), "file-text");
  });

  it("asks for the external-link icon for an external link", () => {
    openMap();
    tapOn(iconOf("x"));
    expect(drawIcon).toHaveBeenCalledWith(expect.any(HTMLElement), "external-link");
  });

  it("closes the bubble on a second tap on the same icon and keeps the node selected", () => {
    openMap();
    tapOn(iconOf("w"));

    tapOn(iconOf("w"));

    expect(bubble()).toBeNull();
    expect(selectedIds()).toEqual(["w"]);
  });

  it("moves the bubble to another node when its icon is tapped", () => {
    openMap();
    tapOn(iconOf("w"));

    tapOn(iconOf("x"));

    expect(container.querySelectorAll(".pinchmap-link-bubble")).toHaveLength(1);
    expect(bubble()?.querySelector(".pinchmap-link-bubble-target")?.textContent).toBe("www.example.com");
    expect(selectedIds()).toEqual(["x"]);
  });

  it("does not start text editing on a quick double tap on the icon", () => {
    openMap();

    tapOn(iconOf("w"));
    clock -= 900;
    tapOn(iconOf("w"));

    expect(container.querySelector("textarea")).toBeNull();
  });
});

describe("the bubble button", () => {
  it("opens the link through the host and closes the bubble", () => {
    openMap();
    tapOn(iconOf("w"));

    bubbleButton().click();

    expect(host.openLink).toHaveBeenCalledWith({ kind: "wiki", target: "Note#Part", label: "alias" });
    expect(bubble()).toBeNull();
  });

  it("passes an external link to the host", () => {
    openMap();
    tapOn(iconOf("x"));

    bubbleButton().click();

    expect(host.openLink).toHaveBeenCalledWith({
      kind: "external",
      target: "https://www.example.com/page?q=1",
      label: "site",
    });
  });
});

describe("closing the link bubble", () => {
  function openBubble(): void {
    openMap();
    tapOn(iconOf("w"));
    expect(bubble()).not.toBeNull();
  }

  it("closes on a tap on another node", () => {
    openBubble();
    tapOn(nodeElement("p"));
    expect(bubble()).toBeNull();
  });

  it("closes on a tap on empty canvas", () => {
    openBubble();
    tapOn(canvas());
    expect(bubble()).toBeNull();
  });

  it("closes on a double tap on a node", () => {
    openBubble();
    tapOn(nodeElement("p"));
    clock -= 900;
    tapOn(nodeElement("p"));
    expect(bubble()).toBeNull();
  });

  it("closes on a mouse wheel zoom", () => {
    openBubble();
    canvas().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true }));
    flushFrames();
    expect(bubble()).toBeNull();
  });

  it("closes on a mouse wheel pan", () => {
    openBubble();
    canvas().dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 50 }));
    flushFrames();
    expect(bubble()).toBeNull();
  });

  it("closes when a node is dragged", () => {
    openBubble();
    const node = nodeElement("p");
    firePointer(node, "pointerdown", { pointerType: "mouse", timeStamp: 5000, clientX: 0 });
    firePointer(node, "pointermove", { pointerType: "mouse", timeStamp: 5050, clientX: 60 });
    firePointer(node, "pointerup", { pointerType: "mouse", timeStamp: 5100, clientX: 60 });
    flushFrames();
    expect(bubble()).toBeNull();
  });

  it("closes on a context menu request (long press)", () => {
    openBubble();
    nodeElement("p").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    expect(bubble()).toBeNull();
  });

  it("closes on Escape", () => {
    openBubble();
    canvas().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(bubble()).toBeNull();
  });

  it("closes on a keyboard navigation key", () => {
    openBubble();
    canvas().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(bubble()).toBeNull();
  });

  it("closes on a pointerdown outside the canvas and the bubble", () => {
    openBubble();
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(bubble()).toBeNull();
    outside.remove();
  });

  it("stays open on a pointerdown inside the bubble", () => {
    openBubble();

    bubbleButton().dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(bubble()).not.toBeNull();
  });

  it("is removed from the page when the editor is destroyed", () => {
    openBubble();

    editor.destroy();

    expect(bubble()).toBeNull();
  });

  it("removes its document pointerdown listener when it closes", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    openBubble();
    const added = addSpy.mock.calls.find(([type]) => type === "pointerdown");
    expect(added).toBeDefined();

    tapOn(canvas());

    const removed = removeSpy.mock.calls.find(([type]) => type === "pointerdown");
    expect(removed?.[1]).toBe(added?.[1]);
    expect(removed?.[2]).toBe(added?.[2]);
  });
});

describe("context menu on a link icon", () => {
  it("does not open any menu", () => {
    openMap();

    iconOf("w").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));

    expect(host.showMenu).not.toHaveBeenCalled();
  });
});

describe("link icon stylesheet", () => {
  async function stylesheet(): Promise<string> {
    const { readFileSync } = await import("node:fs");
    return readFileSync("styles.css", "utf8");
  }

  it("stacks the icon above the add buttons with a z-index", async () => {
    const rule = /\.pinchmap-link-icon\s*\{([^}]*)\}/.exec(await stylesheet())?.[1] ?? "";

    expect(rule).toMatch(/z-index:\s*[1-9]/);
  });

  it("moves the icon to the right corner only for left-side nodes that are not the root", async () => {
    const css = await stylesheet();

    expect(css).toMatch(/\.pinchmap-node\.is-left:not\(\.is-root\)\s*>\s*\.pinchmap-link-icon\s*\{[^}]*left:\s*100%/);
  });
});
