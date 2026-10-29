import { describe, expect, it, vi } from "vitest";
import { createVisibleAreaSource } from "./visibleArea";

function fakeVisualViewport(rect: { offsetLeft: number; offsetTop: number; width: number; height: number }) {
  return Object.assign(new EventTarget(), rect);
}

function fakeWindow(extras: object): Window {
  return Object.assign(new EventTarget(), extras) as unknown as Window;
}

describe("createVisibleAreaSource with a visual viewport", () => {
  it("reads the rect from the visual viewport offset and size", () => {
    const visual = fakeVisualViewport({ offsetLeft: 5, offsetTop: 20, width: 400, height: 300 });
    const source = createVisibleAreaSource(
      fakeWindow({ visualViewport: visual, innerWidth: 999, innerHeight: 999 }),
    );

    expect(source.read()).toEqual({ left: 5, top: 20, right: 405, bottom: 320 });
  });

  it("reads the current values each time, as the keyboard changes the height", () => {
    const visual = fakeVisualViewport({ offsetLeft: 0, offsetTop: 0, width: 400, height: 800 });
    const source = createVisibleAreaSource(fakeWindow({ visualViewport: visual }));

    visual.height = 500;

    expect(source.read().bottom).toBe(500);
  });

  it.each(["resize", "scroll"])("notifies on visual viewport %s", (eventName) => {
    const visual = fakeVisualViewport({ offsetLeft: 0, offsetTop: 0, width: 1, height: 1 });
    const source = createVisibleAreaSource(fakeWindow({ visualViewport: visual }));
    const onChange = vi.fn();
    source.subscribe(onChange);

    visual.dispatchEvent(new Event(eventName));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const visual = fakeVisualViewport({ offsetLeft: 0, offsetTop: 0, width: 1, height: 1 });
    const source = createVisibleAreaSource(fakeWindow({ visualViewport: visual }));
    const onChange = vi.fn();
    const unsubscribe = source.subscribe(onChange);

    unsubscribe();
    visual.dispatchEvent(new Event("resize"));
    visual.dispatchEvent(new Event("scroll"));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("createVisibleAreaSource without a visual viewport", () => {
  it("falls back to the window inner size from the origin", () => {
    const source = createVisibleAreaSource(
      fakeWindow({ visualViewport: null, innerWidth: 1024, innerHeight: 768 }),
    );

    expect(source.read()).toEqual({ left: 0, top: 0, right: 1024, bottom: 768 });
  });

  it("notifies on window resize", () => {
    const win = fakeWindow({ visualViewport: null, innerWidth: 1, innerHeight: 1 });
    const source = createVisibleAreaSource(win);
    const onChange = vi.fn();
    source.subscribe(onChange);

    win.dispatchEvent(new Event("resize"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not react to window scroll", () => {
    const win = fakeWindow({ visualViewport: null, innerWidth: 1, innerHeight: 1 });
    const onChange = vi.fn();
    createVisibleAreaSource(win).subscribe(onChange);

    win.dispatchEvent(new Event("scroll"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const win = fakeWindow({ visualViewport: null, innerWidth: 1, innerHeight: 1 });
    const onChange = vi.fn();
    const unsubscribe = createVisibleAreaSource(win).subscribe(onChange);

    unsubscribe();
    win.dispatchEvent(new Event("resize"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ["undefined", { visualViewport: undefined, innerWidth: 320, innerHeight: 480 }],
    ["missing", { innerWidth: 320, innerHeight: 480 }],
  ])("falls back to the window inner size when visualViewport is %s", (_name, extras) => {
    const source = createVisibleAreaSource(fakeWindow(extras));

    expect(source.read()).toEqual({ left: 0, top: 0, right: 320, bottom: 480 });
  });

  it.each([
    ["undefined", { visualViewport: undefined }],
    ["missing", {}],
  ])("subscribes and unsubscribes on window resize when visualViewport is %s", (_name, extras) => {
    const win = fakeWindow(extras);
    const onChange = vi.fn();
    const unsubscribe = createVisibleAreaSource(win).subscribe(onChange);

    win.dispatchEvent(new Event("resize"));
    unsubscribe();
    win.dispatchEvent(new Event("resize"));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
