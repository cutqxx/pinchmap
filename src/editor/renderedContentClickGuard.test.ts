// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachEditorInput } from "./editorInput";

let canvas: HTMLElement;
let detach: readonly (() => void)[];

beforeEach(() => {
  canvas = document.createElement("div");
  canvas.innerHTML = `
    <div class="pinchmap-node">
      <div class="pinchmap-node-markdown">
        <a href="x" id="link">l</a><span class="tag" id="tag">#t</span><img id="img"><span class="internal-embed" id="embed"></span><b id="plain">b</b>
      </div>
      <textarea id="input"></textarea>
    </div>
    <a href="y" id="outside">o</a>`;
  document.body.appendChild(canvas);
  detach = attachEditorInput(canvas, {
    recognizer: { setSpaceHeld: vi.fn(), pointerDown: vi.fn(), pointerMove: vi.fn(), pointerUp: vi.fn(), pointerCancel: vi.fn() },
    handleIntent: vi.fn(),
    isEditingText: () => false,
  } as unknown as Parameters<typeof attachEditorInput>[1]);
});

afterEach(() => {
  detach.forEach((callback) => callback());
  canvas.remove();
});

function clickOn(id: string, type = "click"): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  canvas.querySelector(`#${id}`)?.dispatchEvent(event);
  return event;
}

describe("click guard for rendered node content", () => {
  it.each(["link", "tag", "img", "embed"])("prevents the default action of a click on #%s inside a node", (id) => {
    expect(clickOn(id).defaultPrevented).toBe(true);
  });

  it("prevents middle-click (auxclick) on a link inside a node", () => {
    expect(clickOn("link", "auxclick").defaultPrevented).toBe(true);
  });

  it("stops the click from reaching Obsidian's own handlers above the canvas", () => {
    const outer = vi.fn();
    document.body.addEventListener("click", outer);
    clickOn("link");
    document.body.removeEventListener("click", outer);
    expect(outer).not.toHaveBeenCalled();
  });

  it("leaves a click on plain rendered text alone", () => {
    expect(clickOn("plain").defaultPrevented).toBe(false);
  });

  it("leaves a click in the text input alone", () => {
    expect(clickOn("input").defaultPrevented).toBe(false);
  });

  it("leaves a link outside any node alone", () => {
    expect(clickOn("outside").defaultPrevented).toBe(false);
  });

  it("stops guarding after the input is detached", () => {
    detach.forEach((callback) => callback());
    expect(clickOn("link").defaultPrevented).toBe(false);
  });
});
