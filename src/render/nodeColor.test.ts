// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap, NodeEntry } from "../model";
import { MapRenderer } from "./mapRenderer";

const UI = { editing: null, selectedIds: new Set<string>() };
const ATTRIBUTE = "data-pinchmap-color";

let container: HTMLElement;
let renderer: MapRenderer;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  renderer = new MapRenderer(container, { labels: { addChild: "+c", addSibling: "+s", collapse: "Свернуть", expand: "Развернуть" } });
});

afterEach(() => {
  container.remove();
});

function entries(colors: Record<string, unknown> = {}): NodeEntry[] {
  const base: NodeEntry[] = [
    { id: "r", text: "Root", parentId: null },
    { id: "a", text: "A", parentId: "r" },
    { id: "a1", text: "A1", parentId: "a" },
    { id: "b", text: "B", parentId: "r" },
  ];
  return base.map((entry) => (entry.id in colors ? { ...entry, state: { color: colors[entry.id] as string } } : entry));
}

function render(map: MindMap): void {
  renderer.syncContent(map, UI);
}

function colorOfNode(id: string): string | null {
  return container.querySelector(`.pinchmap-node[data-node-id="${id}"]`)?.getAttribute(ATTRIBUTE) ?? null;
}

/** Edges carry no id; they are appended in map order, one per non-root node. */
function colorOfEdge(map: MindMap, id: string): string | null {
  const childIds = [...map.nodes.values()].filter((entry) => entry.parentId !== null).map((entry) => entry.id);
  return container.querySelectorAll(".pinchmap-edge")[childIds.indexOf(id)]?.getAttribute(ATTRIBUTE) ?? null;
}

describe("node colour rendering", () => {
  it("marks a coloured node and the edge leading to it with its colour", () => {
    const map = buildMindMap(entries({ a: "red" }));

    render(map);

    expect(colorOfNode("a")).toBe("red");
    expect(colorOfEdge(map, "a")).toBe("red");
  });

  it("marks descendants without their own colour with the inherited colour", () => {
    const map = buildMindMap(entries({ a: "green" }));

    render(map);

    expect(colorOfNode("a1")).toBe("green");
    expect(colorOfEdge(map, "a1")).toBe("green");
  });

  it("does not mark uncoloured nodes or siblings of a coloured node", () => {
    const map = buildMindMap(entries({ a: "green" }));

    render(map);

    expect(colorOfNode("r")).toBeNull();
    expect(colorOfNode("b")).toBeNull();
    expect(colorOfEdge(map, "b")).toBeNull();
  });

  it("keeps a descendant's own colour over the inherited one", () => {
    const map = buildMindMap(entries({ a: "green", a1: "purple" }));

    render(map);

    expect(colorOfNode("a1")).toBe("purple");
    expect(colorOfEdge(map, "a1")).toBe("purple");
  });

  it("removes the mark from the node and its edge when the colour is cleared", () => {
    render(buildMindMap(entries({ a: "red" })));
    const cleared = buildMindMap(entries());

    render(cleared);

    expect(colorOfNode("a")).toBeNull();
    expect(colorOfNode("a1")).toBeNull();
    expect(colorOfEdge(cleared, "a")).toBeNull();
    expect(colorOfEdge(cleared, "a1")).toBeNull();
  });

  it("updates the mark when the colour changes", () => {
    render(buildMindMap(entries({ a: "red" })));

    render(buildMindMap(entries({ a: "cyan" })));

    expect(colorOfNode("a")).toBe("cyan");
    expect(colorOfNode("a1")).toBe("cyan");
  });

  it("falls back to the inherited colour when an own colour is cleared", () => {
    render(buildMindMap(entries({ a: "red", a1: "green" })));

    render(buildMindMap(entries({ a: "red" })));

    expect(colorOfNode("a1")).toBe("red");
  });

  it("does not mark a node whose stored colour is unknown", () => {
    render(buildMindMap(entries({ a: "magenta" })));

    expect(colorOfNode("a")).toBeNull();
  });

  it("colours a root without an edge", () => {
    render(buildMindMap([{ id: "r", text: "Root", parentId: null, state: { color: "yellow" } }]));

    expect(colorOfNode("r")).toBe("yellow");
    expect(container.querySelectorAll(".pinchmap-edge")).toHaveLength(0);
  });

  it("gives a node moved under another parent that parent's colour on the node and its edge", () => {
    render(buildMindMap(entries({ a: "red", b: "cyan" })));
    const moved = buildMindMap(entries({ a: "red", b: "cyan" }).map((entry) => (entry.id === "a1" ? { ...entry, parentId: "b" } : entry)));

    render(moved);

    expect(colorOfNode("a1")).toBe("cyan");
    expect(colorOfEdge(moved, "a1")).toBe("cyan");
  });

  it("keeps the colour mark on a collapsed node and on its hidden descendants", () => {
    const map = buildMindMap(entries({ a: "orange" }).map((entry) => (entry.id === "a" ? { ...entry, state: { color: "orange", collapsed: true } } : entry)));

    render(map);

    expect(colorOfNode("a")).toBe("orange");
    expect(colorOfNode("a1")).toBe("orange");
  });
});
