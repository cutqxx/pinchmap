// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
}));

vi.mock("obsidian", () => {
  class Component {
    children = new Set<Component>();
    addChild(child: Component): Component {
      this.children.add(child);
      return child;
    }
    removeChild(child: Component): void {
      this.children.delete(child);
    }
  }
  return { Component, MarkdownRenderer: { render: mocks.render } };
});

import { Component } from "obsidian";
import type { App } from "obsidian";
import { createNodeContentRenderer } from "./nodeMarkdown";

const APP = {} as App;
let parent: Component & { children: Set<Component> };
let target: HTMLElement;

beforeEach(() => {
  mocks.render.mockReset();
  mocks.render.mockResolvedValue(undefined);
  parent = new Component() as Component & { children: Set<Component> };
  target = document.createElement("div");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("node Markdown renderer for Obsidian", () => {
  it("renders into the target with the note path as the link source", async () => {
    const renderer = createNodeContentRenderer(APP, parent, () => "maps/a.md");
    await renderer.render(target, "**x**").settled;
    const [app, markdown, element, sourcePath] = mocks.render.mock.calls[0] ?? [];
    expect([app, element, sourcePath]).toEqual([APP, target, "maps/a.md"]);
    expect(markdown).toBe("**x**");
  });

  it("makes line breaks hard before handing the text to Obsidian", async () => {
    const renderer = createNodeContentRenderer(APP, parent, () => "");
    await renderer.render(target, "a\nb").settled;
    expect(mocks.render.mock.calls[0]?.[1]).toBe("a  \nb");
  });

  it("shows the raw text and marks the target when rendering fails", async () => {
    mocks.render.mockRejectedValue(new Error("boom"));
    const renderer = createNodeContentRenderer(APP, parent, () => "");
    await renderer.render(target, "**raw**").settled;
    expect(target.textContent).toBe("**raw**");
    expect(target.classList.contains("is-render-failed")).toBe(true);
  });

  it("never rejects the settled promise when rendering fails", async () => {
    mocks.render.mockRejectedValue(new Error("boom"));
    const renderer = createNodeContentRenderer(APP, parent, () => "");
    await expect(renderer.render(target, "x").settled).resolves.toBeUndefined();
  });

  it("does not mark a successful render as failed", async () => {
    const renderer = createNodeContentRenderer(APP, parent, () => "");
    await renderer.render(target, "x").settled;
    expect(target.classList.contains("is-render-failed")).toBe(false);
  });

  it("gives every render its own child component of the parent", () => {
    const renderer = createNodeContentRenderer(APP, parent, () => "");
    renderer.render(target, "a");
    renderer.render(target, "b");
    expect(parent.children.size).toBe(2);
    expect(mocks.render.mock.calls[0]?.[4]).not.toBe(mocks.render.mock.calls[1]?.[4]);
  });

  it("removes only that render's child component on unload", () => {
    const renderer = createNodeContentRenderer(APP, parent, () => "");
    const first = renderer.render(target, "a");
    renderer.render(target, "b");
    first.unload();
    expect(parent.children.size).toBe(1);
    expect(parent.children.has(mocks.render.mock.calls[0]?.[4])).toBe(false);
  });

  it("reads the source path when the render starts, not when the renderer is created", () => {
    let path = "old.md";
    const renderer = createNodeContentRenderer(APP, parent, () => path);
    path = "new.md";
    renderer.render(target, "x");
    expect(mocks.render.mock.calls[0]?.[3]).toBe("new.md");
  });
});
