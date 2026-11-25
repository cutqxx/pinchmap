// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  setIcon: vi.fn((el: HTMLElement, icon: string) => el.setAttribute("data-icon", icon)),
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
  return { Component, MarkdownRenderer: { render: mocks.render }, setIcon: mocks.setIcon };
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

  describe("broken images", () => {
    function renderImage(attributes: Record<string, string>, wrapEmbed?: string): HTMLImageElement {
      const image = document.createElement("img");
      for (const [name, value] of Object.entries(attributes)) image.setAttribute(name, value);
      if (wrapEmbed === undefined) {
        target.append(image);
      } else {
        const embed = document.createElement("span");
        embed.className = "internal-embed";
        embed.setAttribute("src", wrapEmbed);
        embed.append(image);
        target.append(embed);
      }
      return image;
    }

    function placeholders(): HTMLElement[] {
      return Array.from(target.querySelectorAll<HTMLElement>(".pinchmap-broken-image"));
    }

    async function settle(): Promise<void> {
      await createNodeContentRenderer(APP, parent, () => "").render(target, "x").settled;
    }

    it("marks an image that fails to load and shows a placeholder with the image-off icon", async () => {
      mocks.render.mockImplementation(async () => {
        renderImage({ src: "https://example.com/a.png" });
      });
      await settle();
      const image = target.querySelector("img");
      image?.dispatchEvent(new Event("error"));
      expect(image?.classList.contains("is-broken")).toBe(true);
      expect(placeholders().map((p) => p.getAttribute("data-icon"))).toEqual(["image-off"]);
    });

    it("puts the placeholder right after the broken image", async () => {
      mocks.render.mockImplementation(async () => {
        renderImage({ src: "a.png" });
      });
      await settle();
      const image = target.querySelector("img");
      image?.dispatchEvent(new Event("error"));
      expect(image?.nextElementSibling).toBe(placeholders()[0]);
    });

    it("titles the placeholder with the image src for a plain Markdown image", async () => {
      mocks.render.mockImplementation(async () => {
        renderImage({ src: "https://example.com/a.png" });
      });
      await settle();
      target.querySelector("img")?.dispatchEvent(new Event("error"));
      expect(placeholders()[0]?.title).toBe("https://example.com/a.png");
    });

    it("titles the placeholder with the embed src for a wiki-link image", async () => {
      mocks.render.mockImplementation(async () => {
        renderImage({ src: "app://local/resolved/img.png" }, "img.png");
      });
      await settle();
      target.querySelector("img")?.dispatchEvent(new Event("error"));
      expect(placeholders()[0]?.title).toBe("img.png");
    });

    it("handles an image that is added after the render has settled", async () => {
      await settle();
      const late = renderImage({ src: "late.png" });
      late.dispatchEvent(new Event("error"));
      expect(late.classList.contains("is-broken")).toBe(true);
      expect(placeholders()).toHaveLength(1);
    });

    it("does not add a second placeholder when the error fires twice", async () => {
      mocks.render.mockImplementation(async () => {
        renderImage({ src: "a.png" });
      });
      await settle();
      const image = target.querySelector("img");
      image?.dispatchEvent(new Event("error"));
      image?.dispatchEvent(new Event("error"));
      expect(placeholders()).toHaveLength(1);
    });

    it("marks an image that had already failed before the render settled", async () => {
      mocks.render.mockImplementation(async () => {
        const image = renderImage({ src: "gone.png" });
        Object.defineProperty(image, "complete", { value: true });
        Object.defineProperty(image, "naturalWidth", { value: 0 });
      });
      await settle();
      expect(target.querySelector("img")?.classList.contains("is-broken")).toBe(true);
      expect(placeholders()).toHaveLength(1);
    });

    it("leaves a successfully loaded image unmarked", async () => {
      mocks.render.mockImplementation(async () => {
        const image = renderImage({ src: "ok.png" });
        Object.defineProperty(image, "complete", { value: true });
        Object.defineProperty(image, "naturalWidth", { value: 40 });
      });
      await settle();
      expect(target.querySelector("img")?.classList.contains("is-broken")).toBe(false);
      expect(placeholders()).toHaveLength(0);
    });

    it("does not treat an image without a src as already broken", async () => {
      mocks.render.mockImplementation(async () => {
        const image = renderImage({});
        Object.defineProperty(image, "complete", { value: true });
        Object.defineProperty(image, "naturalWidth", { value: 0 });
      });
      await settle();
      expect(placeholders()).toHaveLength(0);
    });

    it("sets async decoding on rendered images", async () => {
      mocks.render.mockImplementation(async () => {
        renderImage({ src: "a.png" });
      });
      await settle();
      expect(target.querySelector("img")?.decoding).toBe("async");
    });

    it("ignores error events from elements that are not images", async () => {
      await settle();
      const other = document.createElement("div");
      target.append(other);
      other.dispatchEvent(new Event("error"));
      expect(placeholders()).toHaveLength(0);
    });
  });
});
