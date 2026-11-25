// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap } from "../model";
import { syncLinkIcon } from "./linkIcon";
import { MapRenderer } from "./mapRenderer";

function iconsIn(element: Element): Element[] {
  return [...element.querySelectorAll(".pinchmap-link-icon")];
}

describe("syncLinkIcon", () => {
  it("adds a hit-testable icon bound to the node", () => {
    const node = document.createElement("div");
    syncLinkIcon(node, "n1", true, "Link");
    const icon = iconsIn(node)[0];
    expect(icon?.getAttribute("data-pinchmap-hit")).toBe("link-icon");
    expect(icon?.getAttribute("data-node-id")).toBe("n1");
    expect(icon?.getAttribute("aria-label")).toBe("Link");
    expect(icon?.querySelector("svg")).not.toBeNull();
  });

  it("does not add a second icon on repeated sync", () => {
    const node = document.createElement("div");
    syncLinkIcon(node, "n1", true, "Link");
    syncLinkIcon(node, "n1", true, "Link");
    expect(iconsIn(node)).toHaveLength(1);
  });

  it("removes the icon when the node has no links any more", () => {
    const node = document.createElement("div");
    syncLinkIcon(node, "n1", true, "Link");
    syncLinkIcon(node, "n1", false, "Link");
    expect(iconsIn(node)).toHaveLength(0);
  });

  it("adds nothing for a node without links", () => {
    const node = document.createElement("div");
    syncLinkIcon(node, "n1", false, "Link");
    expect(iconsIn(node)).toHaveLength(0);
  });
});

describe("MapRenderer link icons", () => {
  const ui = { editing: null, selectedIds: new Set<string>() };

  function mapWith(text: string): MindMap {
    return buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "a", text, parentId: "r" },
    ]);
  }

  function render(renderer: MapRenderer, container: HTMLElement, map: MindMap): (id: string) => Element[] {
    renderer.syncContent(map, ui);
    return (id) => iconsIn(container.querySelector(`.pinchmap-node[data-node-id="${id}"]`) as Element);
  }

  it("shows the icon on nodes with a link but not on others", () => {
    const container = document.createElement("div");
    const iconsOf = render(new MapRenderer(container), container, mapWith("see [[Note]]"));
    expect(iconsOf("a")).toHaveLength(1);
    expect(iconsOf("r")).toHaveLength(0);
  });

  it("shows no icon for a link inside code or an image embed", () => {
    const container = document.createElement("div");
    const iconsOf = render(new MapRenderer(container), container, mapWith("`[[Note]]` ![[img.png]]"));
    expect(iconsOf("a")).toHaveLength(0);
  });

  it("adds the icon when the text gains a link and removes it when the link goes", () => {
    const container = document.createElement("div");
    const renderer = new MapRenderer(container);
    expect(render(renderer, container, mapWith("plain"))("a")).toHaveLength(0);
    expect(render(renderer, container, mapWith("now [[Note]]"))("a")).toHaveLength(1);
    expect(render(renderer, container, mapWith("plain again"))("a")).toHaveLength(0);
  });

  it("uses the configured label for the icon", () => {
    const container = document.createElement("div");
    const renderer = new MapRenderer(container, { labels: { addChild: "", addSibling: "", link: "Ссылка" } });
    const iconsOf = render(renderer, container, mapWith("https://example.com"));
    expect(iconsOf("a")[0]?.getAttribute("aria-label")).toBe("Ссылка");
  });
});
