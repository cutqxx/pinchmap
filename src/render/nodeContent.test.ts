// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap } from "../model";
import { MapRenderer } from "./mapRenderer";
import type { NodeContentRenderer, RenderedNodeContent } from "./nodeContent";

interface FakeRender {
  readonly target: HTMLElement;
  readonly markdown: string;
  readonly unload: ReturnType<typeof vi.fn>;
  settle(): Promise<void>;
}

/** A content renderer whose renders stay pending until the test settles them. */
function createFakeContentRenderer() {
  const renders: FakeRender[] = [];
  const renderer: NodeContentRenderer = {
    render(target, markdown): RenderedNodeContent {
      let resolve!: () => void;
      const settled = new Promise<void>((done) => (resolve = done));
      const unload = vi.fn();
      renders.push({ target, markdown, unload, settle: async () => { resolve(); await settled; await Promise.resolve(); } });
      return { settled, unload };
    },
  };
  return { renderer, renders };
}

const ui = (overrides: Partial<{ editing: { nodeId: string; draftText: string } | null; selectedIds: Set<string>; dropTargetId: string }> = {}) => ({
  editing: null,
  selectedIds: new Set<string>(),
  ...overrides,
});

let container: HTMLElement;
let fake: ReturnType<typeof createFakeContentRenderer>;
let onContentResized: Mock<() => void>;
let renderer: MapRenderer;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  fake = createFakeContentRenderer();
  onContentResized = vi.fn();
  renderer = new MapRenderer(container, { contentRenderer: fake.renderer, onContentResized });
});

afterEach(() => container.remove());

function mapWith(text: string, extra: { color?: string; collapsed?: boolean } = {}): MindMap {
  return buildMindMap([
    { id: "r", text: "Root", parentId: null },
    { id: "a", text, parentId: "r", ...extra },
    { id: "b", text: "Child", parentId: "a" },
  ]);
}

function nodeElement(id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`.pinchmap-node[data-node-id="${id}"]`);
  if (element === null) throw new Error(`node ${id} not rendered`);
  return element;
}

describe("node Markdown rendering", () => {
  it("renders each node's source text once", () => {
    renderer.syncContent(mapWith("**bold**"), ui());
    expect(fake.renders.map((render) => render.markdown).sort()).toEqual(["**bold**", "Child", "Root"]);
  });

  it("does not render nodes whose text is blank", () => {
    renderer.syncContent(mapWith("   "), ui());
    expect(fake.renders.map((render) => render.markdown).sort()).toEqual(["Child", "Root"]);
    expect(nodeElement("a").querySelector(".pinchmap-node-markdown")).toBeNull();
  });

  it("does not re-render when only selection changes", () => {
    const map = mapWith("x");
    renderer.syncContent(map, ui());
    renderer.syncContent(map, ui({ selectedIds: new Set(["a"]) }));
    expect(fake.renders).toHaveLength(3);
  });

  it("does not re-render when only the color changes", () => {
    renderer.syncContent(mapWith("x"), ui());
    renderer.syncContent(mapWith("x", { color: "red" }), ui());
    expect(fake.renders).toHaveLength(3);
  });

  it("does not re-render when a node is collapsed", () => {
    renderer.syncContent(mapWith("x"), ui());
    renderer.syncContent(mapWith("x", { collapsed: true }), ui());
    expect(fake.renders).toHaveLength(3);
  });

  it("does not re-render a node when another node's text changes", () => {
    renderer.syncContent(mapWith("x"), ui());
    const before = fake.renders.length;
    renderer.syncContent(buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "a", text: "x", parentId: "r" },
      { id: "b", text: "Changed", parentId: "a" },
    ]), ui());
    expect(fake.renders.slice(before).map((render) => render.markdown)).toEqual(["Changed"]);
  });

  it("does not re-render while the draft changes during editing", () => {
    const map = mapWith("x");
    renderer.syncContent(map, ui());
    renderer.syncContent(map, ui({ editing: { nodeId: "a", draftText: "x y" } }));
    renderer.syncContent(map, ui({ editing: { nodeId: "a", draftText: "x yz" } }));
    expect(fake.renders).toHaveLength(3);
  });

  it("keeps the rendered layer when editing ends without a text change", () => {
    const map = mapWith("x");
    renderer.syncContent(map, ui({ editing: { nodeId: "a", draftText: "x" } }));
    renderer.syncContent(map, ui());
    expect(fake.renders).toHaveLength(3);
    expect(nodeElement("a").querySelectorAll(".pinchmap-node-markdown")).toHaveLength(1);
  });

  it("marks the node as editing so the raw text is shown instead of the rendered layer", async () => {
    const map = mapWith("**x**");
    renderer.syncContent(map, ui());
    await Promise.all(fake.renders.map((render) => render.settle()));
    renderer.syncContent(map, ui({ editing: { nodeId: "a", draftText: "**x**" } }));
    const element = nodeElement("a");
    expect(element.classList.contains("is-editing")).toBe(true);
    expect(element.querySelector(".pinchmap-node-text")?.textContent).toBe("**x**");
  });

  it("re-renders when the saved text changes", () => {
    renderer.syncContent(mapWith("x"), ui());
    renderer.syncContent(mapWith("y"), ui());
    expect(fake.renders.filter((render) => render.markdown === "y")).toHaveLength(1);
  });

  it("unloads the previous render when the text changes and keeps a single layer", () => {
    renderer.syncContent(mapWith("x"), ui());
    const previous = fake.renders.find((render) => render.markdown === "x");
    renderer.syncContent(mapWith("y"), ui());
    expect(previous?.unload).toHaveBeenCalledTimes(1);
    expect(nodeElement("a").querySelectorAll(".pinchmap-node-markdown")).toHaveLength(1);
  });

  it("unloads the render of a node that is removed", () => {
    renderer.syncContent(mapWith("x"), ui());
    const render = fake.renders.find((entry) => entry.markdown === "x");
    renderer.syncContent(buildMindMap([{ id: "r", text: "Root", parentId: null }]), ui());
    expect(render?.unload).toHaveBeenCalledTimes(1);
  });

  it("unloads every render when the renderer is destroyed", () => {
    renderer.syncContent(mapWith("x"), ui());
    renderer.destroy();
    expect(fake.renders.every((render) => render.unload.mock.calls.length === 1)).toBe(true);
  });

  it("keeps the raw text visible and signals nothing until the render settles", () => {
    renderer.syncContent(mapWith("x"), ui());
    const element = nodeElement("a");
    expect(element.classList.contains("has-rendered-markdown")).toBe(false);
    expect(element.querySelector(".pinchmap-node-markdown")?.classList.contains("is-ready")).toBe(false);
    expect(onContentResized).not.toHaveBeenCalled();
  });

  it("swaps to the rendered layer once and reports the resize once after it settles", async () => {
    renderer.syncContent(mapWith("x"), ui());
    await fake.renders.find((render) => render.markdown === "x")?.settle();
    const element = nodeElement("a");
    expect(element.classList.contains("has-rendered-markdown")).toBe(true);
    expect(element.querySelector(".pinchmap-node-markdown")?.classList.contains("is-ready")).toBe(true);
    expect(onContentResized).toHaveBeenCalledTimes(1);
  });

  it("makes the settled node measured again", async () => {
    const measureSpy = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(10);
    renderer.syncContent(mapWith("x"), ui());
    renderer.measure();
    measureSpy.mockReturnValue(99);
    await fake.renders.find((render) => render.markdown === "x")?.settle();
    expect(renderer.measure().get("a")?.width).toBe(99);
    measureSpy.mockRestore();
  });

  it("ignores a stale settle after the text changed", async () => {
    renderer.syncContent(mapWith("x"), ui());
    const stale = fake.renders.find((render) => render.markdown === "x");
    renderer.syncContent(mapWith("y"), ui());
    await stale?.settle();
    expect(nodeElement("a").classList.contains("has-rendered-markdown")).toBe(false);
    expect(onContentResized).not.toHaveBeenCalled();
  });

  it("ignores a settle that arrives after the node was removed", async () => {
    renderer.syncContent(mapWith("x"), ui());
    const pending = fake.renders.find((render) => render.markdown === "x");
    renderer.syncContent(buildMindMap([{ id: "r", text: "Root", parentId: null }]), ui());
    await pending?.settle();
    expect(onContentResized).not.toHaveBeenCalled();
  });

  it("re-measures the node when editing toggles without a text change", async () => {
    const widthSpy = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      const showsRenderedLayer = this.classList.contains("has-rendered-markdown") && !this.classList.contains("is-editing");
      return showsRenderedLayer ? 99 : 10;
    });
    const map = mapWith("**x**");
    renderer.syncContent(map, ui());
    await Promise.all(fake.renders.map((render) => render.settle()));
    expect(renderer.measure().get("a")?.width).toBe(99);

    renderer.syncContent(map, ui({ editing: { nodeId: "a", draftText: "**x**" } }));
    expect(renderer.measure().get("a")?.width).toBe(10);

    renderer.syncContent(map, ui());
    expect(renderer.measure().get("a")?.width).toBe(99);
    widthSpy.mockRestore();
  });

  it("does not re-render when a node is dragged over a drop target and moves", () => {
    const map = mapWith("x");
    renderer.syncContent(map, ui());
    const before = fake.renders.length;
    renderer.syncContent(map, ui({ dropTargetId: "r" }));
    renderer.place(map, { positions: new Map([["a", { x: 40, y: 50 }]]), sides: new Map() } as unknown as Parameters<MapRenderer["place"]>[1]);
    renderer.syncContent(map, ui({ dropTargetId: "r" }));
    expect(fake.renders).toHaveLength(before);
    expect(nodeElement("a").style.left).toBe("40px");
  });

  it("renders nothing and works as before when no content renderer is given", () => {
    const plain = new MapRenderer(container);
    plain.syncContent(mapWith("x"), ui());
    expect(container.querySelector(".pinchmap-node-markdown")).toBeNull();
    plain.destroy();
  });
});
