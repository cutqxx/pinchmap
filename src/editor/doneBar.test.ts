// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DONE_BAR_HEIGHT_PX, createDoneBar, isCoarsePointer } from "./doneBar";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function setup(label = "Done") {
  const onDone = vi.fn();
  const bar = createDoneBar(document, label, onDone);
  const element = document.querySelector<HTMLElement>(".pinchmap-done-bar");
  const button = document.querySelector<HTMLButtonElement>(".pinchmap-done-button");
  if (element === null || button === null) throw new Error("done bar not rendered");
  return { bar, element, button, onDone };
}

describe("createDoneBar", () => {
  it("is hidden until shown", () => {
    const { element } = setup();

    expect(element.hidden).toBe(true);
  });

  it("is positioned so its bottom edge sits on the bottom of the visible area", () => {
    const { bar, element } = setup();

    bar.show({ left: 10, top: 0, right: 410, bottom: 500 });

    expect(element.hidden).toBe(false);
    expect(element.style.top).toBe(`${500 - DONE_BAR_HEIGHT_PX}px`);
    expect(element.style.left).toBe("10px");
    expect(element.style.width).toBe("400px");
    expect(DONE_BAR_HEIGHT_PX).toBe(44);
  });

  it("moves when the visible area changes", () => {
    const { bar, element } = setup();
    bar.show({ left: 0, top: 0, right: 400, bottom: 500 });

    bar.show({ left: 0, top: 0, right: 400, bottom: 300 });

    expect(element.style.top).toBe("256px");
  });

  it("hides again", () => {
    const { bar, element } = setup();
    bar.show({ left: 0, top: 0, right: 400, bottom: 500 });

    bar.hide();

    expect(element.hidden).toBe(true);
  });

  it("applies the given label to the button", () => {
    const { button } = setup("Готово");

    expect(button.textContent).toBe("Готово");
  });

  it.each(["pointerdown", "mousedown"])("prevents the default of %s so the textarea keeps focus", (type) => {
    const { button } = setup();
    const event = new Event(type, { bubbles: true, cancelable: true });

    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("calls onDone when the button is clicked", () => {
    const { button, onDone } = setup();

    button.click();

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("is removed from the document on destroy", () => {
    const { bar, element } = setup();

    bar.destroy();

    expect(element.isConnected).toBe(false);
    expect(document.querySelector(".pinchmap-done-bar")).toBeNull();
  });
});

describe("isCoarsePointer", () => {
  function windowWithMatchMedia(matches: boolean) {
    const matchMedia = vi.fn((query: string) => ({ matches, media: query }));
    return { win: { matchMedia } as unknown as Window, matchMedia };
  }

  it("is true when the primary pointer is coarse", () => {
    const { win, matchMedia } = windowWithMatchMedia(true);

    expect(isCoarsePointer(win)).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith("(pointer: coarse)");
  });

  it("is false when the primary pointer is fine", () => {
    expect(isCoarsePointer(windowWithMatchMedia(false).win)).toBe(false);
  });

  it("is false without a window", () => {
    expect(isCoarsePointer(null)).toBe(false);
  });

  it("is false when matchMedia is unavailable", () => {
    expect(isCoarsePointer({} as unknown as Window)).toBe(false);
  });
});
