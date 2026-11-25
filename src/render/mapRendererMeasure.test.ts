// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap } from "../model";
import { MapRenderer } from "./mapRenderer";
import type { RenderUi } from "./mapRenderer";

const IDLE: RenderUi = { editing: null, selectedIds: new Set<string>() };

function mapWith(text: string): MindMap {
  return buildMindMap([
    { id: "r", text: "Root", parentId: null },
    { id: "c", text, parentId: "r" },
  ]);
}

describe("MapRenderer measuring", () => {
  let container: HTMLElement;
  let renderer: MapRenderer;
  let measuredWidth: ReturnType<typeof vi.fn<(element: HTMLElement) => number>>;

  beforeEach(() => {
    measuredWidth = vi.fn((element: HTMLElement) => (element.textContent ?? "").length * 10);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return measuredWidth(this);
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(20);
    container = document.createElement("div");
    document.body.appendChild(container);
    renderer = new MapRenderer(container);
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    vi.restoreAllMocks();
  });

  function nodeText(id: string): string | null | undefined {
    return renderer.getNodeElement(id)?.firstElementChild?.textContent;
  }

  it("measures every new node once", () => {
    renderer.syncContent(mapWith("Child"), IDLE);
    const sizes = renderer.measure();
    expect(sizes.get("c")).toEqual({ width: 50, height: 20 });
    expect(measuredWidth).toHaveBeenCalledTimes(2);
  });

  it("does not re-measure a node whose text is unchanged", () => {
    renderer.syncContent(mapWith("Child"), IDLE);
    renderer.measure();
    measuredWidth.mockClear();
    renderer.syncContent(mapWith("Child"), IDLE);
    renderer.measure();
    expect(measuredWidth).not.toHaveBeenCalled();
  });

  it("re-measures only the node whose text changed", () => {
    renderer.syncContent(mapWith("Child"), IDLE);
    renderer.measure();
    measuredWidth.mockClear();
    renderer.syncContent(mapWith("Longer child"), IDLE);
    const sizes = renderer.measure();
    expect(nodeText("c")).toBe("Longer child");
    expect(sizes.get("c")).toEqual({ width: 120, height: 20 });
    expect(measuredWidth).toHaveBeenCalledTimes(1);
  });

  it("re-measures a node when editing starts and its draft is shown", () => {
    renderer.syncContent(mapWith("Child"), IDLE);
    renderer.measure();
    measuredWidth.mockClear();
    renderer.syncContent(mapWith("Child"), { editing: { nodeId: "c", draftText: "Child\n" }, selectedIds: new Set() });
    renderer.measure();
    expect(nodeText("c")).toBe("Child\n\n");
    expect(measuredWidth).toHaveBeenCalledTimes(1);
  });

  it("forgets the size of a removed node", () => {
    renderer.syncContent(mapWith("Child"), IDLE);
    renderer.measure();
    renderer.syncContent(buildMindMap([{ id: "r", text: "Root", parentId: null }]), IDLE);
    const sizes = renderer.measure();
    expect(sizes.has("c")).toBe(false);
    expect(renderer.getNodeElement("c")).toBeUndefined();
    expect(container.querySelectorAll(".pinchmap-edge")).toHaveLength(0);
  });

  it("shows and measures a node again when it returns with the same id and text", () => {
    renderer.syncContent(mapWith("Child"), IDLE);
    renderer.measure();
    renderer.syncContent(buildMindMap([{ id: "r", text: "Root", parentId: null }]), IDLE);
    renderer.measure();
    measuredWidth.mockClear();
    renderer.syncContent(mapWith("Child"), IDLE);
    const sizes = renderer.measure();
    expect(nodeText("c")).toBe("Child");
    expect(sizes.get("c")).toEqual({ width: 50, height: 20 });
    expect(measuredWidth).toHaveBeenCalledTimes(1);
  });

  it("keeps a node dirty until it gets a non-zero size", () => {
    measuredWidth.mockReturnValue(0);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(0);
    renderer.syncContent(mapWith("Child"), IDLE);
    expect(renderer.measure().size).toBe(0);
    measuredWidth.mockReturnValue(30);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(20);
    renderer.syncContent(mapWith("Child"), IDLE);
    expect(renderer.measure().get("c")).toEqual({ width: 30, height: 20 });
  });

  it("forgets all sizes on destroy", () => {
    renderer.syncContent(mapWith("Child"), IDLE);
    const sizes = renderer.measure();
    renderer.destroy();
    expect(sizes.size).toBe(0);
  });
});
