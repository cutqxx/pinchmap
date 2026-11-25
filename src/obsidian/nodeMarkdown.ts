import { Component, MarkdownRenderer } from "obsidian";
import type { App } from "obsidian";
import type { NodeContentRenderer } from "../render";
import { withHardLineBreaks } from "./hardLineBreaks";

const RENDER_FAILED_CLASS = "is-render-failed";

async function renderOrShowRaw(
  app: App,
  target: HTMLElement,
  markdown: string,
  sourcePath: string,
  component: Component,
): Promise<void> {
  try {
    await MarkdownRenderer.render(app, withHardLineBreaks(markdown), target, sourcePath, component);
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
