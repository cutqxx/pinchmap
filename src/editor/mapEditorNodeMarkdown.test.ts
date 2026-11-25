// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMindMap } from "../model";
import type { NodeContentRenderer } from "../render";
import { MapEditor } from "./mapEditor";
import { giveEveryElementSize } from "./testSupport/nodeSize";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "**A**", parentId: "r" },
  { id: "b", text: "[[B]]", parentId: "r" },
  { id: "c", text: "`C`", parentId: "r" },
]);

let container: HTMLElement;
let editor: MapEditor;
let pendingFrames: (() => void)[];
let settleAll: () => Promise<void>;
let restoreSize: () => void;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  restoreSize = giveEveryElementSize({ width: 100, height: 30 });
  container = document.createElement("div");
  document.body.appendChild(container);
  pendingFrames = [];
  const resolvers: (() => void)[] = [];
  const renderNodeContent: NodeContentRenderer = {
    render: () => ({ settled: new Promise<void>((resolve) => resolvers.push(resolve)), unload() {} }),
  };
  settleAll = async () => {
    resolvers.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  editor = new MapEditor({
    container,
    host: { onMapChanged: vi.fn(), onTextEditEnded: vi.fn(), showMenu: vi.fn(), notify: vi.fn() },
    requestFrame: (callback) => pendingFrames.push(callback),
    renderNodeContent,
  });
});

afterEach(() => {
  editor.destroy();
  container.remove();
  restoreSize();
  vi.unstubAllGlobals();
});

function flushFrames(): void {
  while (pendingFrames.length > 0) pendingFrames.shift()?.();
}

describe("MapEditor node Markdown", () => {
  it("schedules exactly one frame when many nodes settle together", async () => {
    editor.loadMap(MAP);
    flushFrames();
    await settleAll();
    expect(pendingFrames).toHaveLength(1);
  });

  it("schedules no frame while rendering is still pending", () => {
    editor.loadMap(MAP);
    flushFrames();
    expect(pendingFrames).toHaveLength(0);
  });

  it("shows the rendered layer on every node after the settled frame runs", async () => {
    editor.loadMap(MAP);
    flushFrames();
    await settleAll();
    flushFrames();
    expect(container.querySelectorAll(".pinchmap-node.has-rendered-markdown")).toHaveLength(4);
  });

  it("schedules no frame when a render settles after the editor is destroyed", async () => {
    editor.loadMap(MAP);
    flushFrames();
    editor.destroy();
    await settleAll();
    expect(pendingFrames).toHaveLength(0);
  });
});
