// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap, NodeEntry } from "../model";
import { computeLayout } from "../layout";
import { MapRenderer } from "./mapRenderer";

const UI = { editing: null, selectedIds: new Set<string>() };
const SIZE = { width: 80, height: 30 };

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

const ENTRIES: NodeEntry[] = [
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "a2", text: "A2", parentId: "a" },
  { id: "a2x", text: "A2x", parentId: "a2" },
  { id: "b", text: "B", parentId: "r", state: { side: "left" } },
  { id: "leaf", text: "Leaf", parentId: "r" },
];

function withCollapsed(...ids: string[]): MindMap {
  return buildMindMap(ENTRIES.map((entry) => (ids.includes(entry.id) ? { ...entry, state: { ...entry.state, collapsed: true } } : entry)));
}

function render(map: MindMap): void {
  renderer.syncContent(map, UI);
  const sizes = new Map([...map.nodes.keys()].map((id) => [id, SIZE] as const));
  renderer.place(map, computeLayout(map, sizes));
}

function node(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`no node ${id}`);
  return element;
}

function toggleOf(id: string): HTMLElement | null {
  return node(id).querySelector<HTMLElement>(":scope > .pinchmap-collapse-toggle");
}

/** Edges carry no id; they are appended in map order, one per non-root node. */
function edge(map: MindMap, id: string): Element | undefined {
  const childIds = [...map.nodes.values()].filter((entry) => entry.parentId !== null).map((entry) => entry.id);
  return container.querySelectorAll(".pinchmap-edge")[childIds.indexOf(id)];
}

describe("collapse indicator", () => {
  it("is present on a node with children", () => {
    render(withCollapsed());

    expect(toggleOf("a")).not.toBeNull();
  });

  it("is absent on a node without children", () => {
    render(withCollapsed());

    expect(toggleOf("leaf")).toBeNull();
  });

  it("is a hit target carrying the node id", () => {
    render(withCollapsed());

    expect(toggleOf("a")?.getAttribute("data-pinchmap-hit")).toBe("collapse-toggle");
    expect(toggleOf("a")?.getAttribute("data-node-id")).toBe("a");
  });

  it("shows a minus and is expanded when the branch is open", () => {
    render(withCollapsed());

    expect(toggleOf("a")?.textContent).toBe("−");
    expect(toggleOf("a")?.getAttribute("aria-expanded")).toBe("true");
    expect(toggleOf("a")?.getAttribute("aria-label")).toBe("Свернуть");
  });

  it("shows the count of all hidden descendants when collapsed", () => {
    render(withCollapsed("a"));

    expect(toggleOf("a")?.textContent).toBe("3");
    expect(toggleOf("a")?.getAttribute("aria-expanded")).toBe("false");
    expect(toggleOf("a")?.getAttribute("aria-label")).toBe("Развернуть");
  });

  it("returns to the minus after the branch is expanded again", () => {
    render(withCollapsed("a"));
    render(withCollapsed());

    expect(toggleOf("a")?.textContent).toBe("−");
  });

  it("is not duplicated by repeated syncs", () => {
    render(withCollapsed());
    render(withCollapsed());

    expect(node("a").querySelectorAll(".pinchmap-collapse-toggle")).toHaveLength(1);
  });

  it("is removed when the node loses its last child", () => {
    render(withCollapsed());
    render(buildMindMap(ENTRIES.filter((entry) => entry.parentId !== "a" && entry.parentId !== "a2")));

    expect(toggleOf("a")).toBeNull();
  });

  it("has a stylesheet hit area of at least 44 by 44 px", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("styles.css", "utf8");
    const rule = /\.pinchmap-collapse-toggle\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";

    expect(rule).toMatch(/width:\s*44px/);
    expect(rule).toMatch(/height:\s*44px/);
  });
});

describe("hidden branches", () => {
  it("marks every descendant of a collapsed node and its edge as hidden", () => {
    const map = withCollapsed("a");
    render(map);

    for (const id of ["a1", "a2", "a2x"]) {
      expect(node(id).classList.contains("is-hidden")).toBe(true);
      expect(edge(map, id)?.classList.contains("is-hidden")).toBe(true);
    }
  });

  it("keeps the collapsed node, its edge and other branches visible", () => {
    const map = withCollapsed("a");
    render(map);

    for (const id of ["r", "a", "b", "leaf"]) expect(node(id).classList.contains("is-hidden")).toBe(false);
    expect(edge(map, "a")?.classList.contains("is-hidden")).toBe(false);
  });

  it("clears the hidden marks on expand", () => {
    render(withCollapsed("a"));
    render(withCollapsed());

    expect(container.querySelectorAll(".is-hidden")).toHaveLength(0);
  });

  it("hides everything below a collapsed root", () => {
    render(withCollapsed("r"));

    expect([...container.querySelectorAll(".pinchmap-node.is-hidden")].map((el) => el.getAttribute("data-node-id")).sort()).toEqual([
      "a", "a1", "a2", "a2x", "b", "leaf",
    ]);
  });

  it("keeps an inner collapsed node hidden under an outer collapsed one after the inner one expands", () => {
    render(withCollapsed("a", "a2"));
    render(withCollapsed("a"));

    expect(node("a2x").classList.contains("is-hidden")).toBe(true);
  });
});

describe("side marks", () => {
  it("marks a node left of its parent as is-left and a right one not", () => {
    render(withCollapsed());

    expect(node("b").classList.contains("is-left")).toBe(true);
    expect(node("a").classList.contains("is-left")).toBe(false);
  });
});
