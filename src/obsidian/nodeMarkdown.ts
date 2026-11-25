import { Component, MarkdownRenderer, setIcon } from "obsidian";
import type { App } from "obsidian";
import type { NodeContentRenderer } from "../render";
import { withHardLineBreaks } from "./hardLineBreaks";

const RENDER_FAILED_CLASS = "is-render-failed";
const BROKEN_IMAGE_CLASS = "is-broken";
const BROKEN_IMAGE_PLACEHOLDER_CLASS = "pinchmap-broken-image";
const BROKEN_IMAGE_ICON = "image-off";

function describeImage(image: HTMLImageElement): string {
  const embedSource = image.closest(".internal-embed")?.getAttribute("src");
  return embedSource ?? image.getAttribute("src") ?? "";
}

function markImageBroken(image: HTMLImageElement): void {
  if (image.classList.contains(BROKEN_IMAGE_CLASS)) return;
  image.classList.add(BROKEN_IMAGE_CLASS);
  const placeholder = image.ownerDocument.createElement("span");
  placeholder.className = BROKEN_IMAGE_PLACEHOLDER_CLASS;
  placeholder.title = describeImage(image);
  setIcon(placeholder, BROKEN_IMAGE_ICON);
  image.after(placeholder);
}

function isAlreadyBroken(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth === 0 && image.getAttribute("src") !== null;
}

function watchBrokenImages(target: HTMLElement): void {
  target.addEventListener(
    "error",
    (event) => {
      if (event.target instanceof HTMLImageElement) markImageBroken(event.target);
    },
    true,
  );
}

function prepareImages(target: HTMLElement): void {
  for (const image of Array.from(target.querySelectorAll("img"))) {
    image.decoding = "async";
    if (isAlreadyBroken(image)) markImageBroken(image);
  }
}

async function renderOrShowRaw(
  app: App,
  target: HTMLElement,
  markdown: string,
  sourcePath: string,
  component: Component,
): Promise<void> {
  watchBrokenImages(target);
  try {
    await MarkdownRenderer.render(app, withHardLineBreaks(markdown), target, sourcePath, component);
    prepareImages(target);
  } catch (error) {
    console.error("Pinchmap: rendering node Markdown failed", error);
    target.textContent = markdown;
    target.classList.add(RENDER_FAILED_CLASS);
  }
}

/** Renders node text through Obsidian's Markdown renderer; each render gets its own child component of `parent`. */
export function createNodeContentRenderer(
  app: App,
  parent: Component,
  getSourcePath: () => string,
): NodeContentRenderer {
  return {
    render(target, markdown) {
      const component = new Component();
      parent.addChild(component);
      return {
        settled: renderOrShowRaw(app, target, markdown, getSourcePath(), component),
        unload: () => parent.removeChild(component),
      };
    },
  };
}
