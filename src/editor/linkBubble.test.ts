// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap } from "../model";
import { DEFAULT_LINK_BUBBLE_LABELS, LinkBubble } from "./linkBubble";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "w", text: "[[Note]]", parentId: "r" },
  { id: "p", text: "plain", parentId: "r" },
]);

let container: HTMLElement;
let canvasElement: HTMLElement;
let nodeElements: Map<string, HTMLElement>;
let map: MindMap;
let selectNode: Mock<(nodeId: string) => void>;
let bubble: LinkBubble;

beforeEach(() => {
  container = document.createElement("div");
  canvasElement = container.appendChild(document.createElement("div"));
  document.body.appendChild(container);
  nodeElements = new Map([
    ["w", canvasElement.appendChild(document.createElement("div"))],
    ["p", canvasElement.appendChild(document.createElement("div"))],
  ]);
  map = MAP;
  selectNode = vi.fn();
  bubble = new LinkBubble({
    container,
    canvasElement,
    labels: DEFAULT_LINK_BUBBLE_LABELS,
    getMap: () => map,
    getNodeElement: (id) => nodeElements.get(id),
    selectNode,
    openLink: vi.fn(),
    drawIcon: vi.fn(),
  });
});

afterEach(() => {
  bubble.destroy();
  container.remove();
});

describe("LinkBubble.toggleFor", () => {
  it("opens a bubble for a node that has a link", () => {
    bubble.toggleFor("w");

    expect(bubble.isOpen).toBe(true);
    expect(container.querySelector(".pinchmap-link-bubble")).not.toBeNull();
  });

  it("stays closed when the node has no rendered element", () => {
    nodeElements.delete("w");

    bubble.toggleFor("w");

    expect(bubble.isOpen).toBe(false);
    expect(container.querySelector(".pinchmap-link-bubble")).toBeNull();
  });

  it("stays closed when the node's text has no link", () => {
    bubble.toggleFor("p");

    expect(bubble.isOpen).toBe(false);
    expect(container.querySelector(".pinchmap-link-bubble")).toBeNull();
  });

  it("stays closed when the node was deleted from the map", () => {
    map = buildMindMap([{ id: "r", text: "Root", parentId: null }]);

    bubble.toggleFor("w");

    expect(bubble.isOpen).toBe(false);
    expect(container.querySelector(".pinchmap-link-bubble")).toBeNull();
  });
});
