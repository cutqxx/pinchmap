// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachNativeGestureGuard } from "./domNativeGestureGuard";
import { attachPointerSource } from "./domPointerSource";
import { attachSpaceKeySource } from "./domSpaceKeySource";
import { attachWheelSource } from "./domWheelSource";
import type { PointerSample, WheelSample } from "./gestureRecognizer";

let parent: HTMLElement;
let element: HTMLElement;
let textarea: HTMLTextAreaElement;

beforeEach(() => {
  parent = document.createElement("div");
  element = document.createElement("div");
  textarea = document.createElement("textarea");
  element.appendChild(textarea);
  parent.appendChild(element);
  document.body.appendChild(parent);
  element.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
});

afterEach(() => {
  parent.remove();
});

function dispatch(target: EventTarget, event: Event): Event {
  target.dispatchEvent(event);
  return event;
}

function wheelEvent(init: WheelEventInit): WheelEvent {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
  // happy-dom's WheelEvent drops the MouseEvent coordinates and modifier keys from its init dictionary.
  const inherited = {
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
  };
  for (const [name, value] of Object.entries(inherited)) Object.defineProperty(event, name, { value });
  return event;
}

describe("attachWheelSource", () => {
  it("prevents the default browser scroll or page zoom", () => {
    attachWheelSource(element, () => undefined);

    const event = dispatch(element, wheelEvent({ deltaY: 10 }));

    expect(event.defaultPrevented).toBe(true);
  });

  it("registers a non-passive listener so preventDefault is honored", () => {
    const addSpy = vi.spyOn(element, "addEventListener");

    attachWheelSource(element, () => undefined);

    expect(addSpy).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
  });

  it("reports coordinates relative to the element and the modifier keys", () => {
    const samples: WheelSample[] = [];
    attachWheelSource(element, (s) => samples.push(s));

    dispatch(element, wheelEvent({ clientX: 110, clientY: 70, deltaX: 3, deltaY: 4, ctrlKey: true, shiftKey: true }));

    expect(samples).toEqual([
      { x: 100, y: 50, deltaX: 3, deltaY: 4, ctrlKey: true, metaKey: false, shiftKey: true },
    ]);
  });

  it("converts line-based deltas to pixels", () => {
    const samples: WheelSample[] = [];
    attachWheelSource(element, (s) => samples.push(s));

    dispatch(element, wheelEvent({ deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE }));

    expect(samples[0]?.deltaY).toBe(48);
  });

  it("converts page-based deltas to the element height", () => {
    Object.defineProperty(element, "clientHeight", { value: 500 });
    const samples: WheelSample[] = [];
    attachWheelSource(element, (s) => samples.push(s));

    dispatch(element, wheelEvent({ deltaY: 1, deltaMode: WheelEvent.DOM_DELTA_PAGE }));

    expect(samples[0]?.deltaY).toBe(500);
  });

  it("leaves pixel deltas as they are", () => {
    const samples: WheelSample[] = [];
    attachWheelSource(element, (s) => samples.push(s));

    dispatch(element, wheelEvent({ deltaX: 7, deltaY: 9 }));

    expect(samples[0]).toMatchObject({ deltaX: 7, deltaY: 9 });
  });

  it("ignores wheel events over a text input and leaves them to the browser", () => {
    const onSample = vi.fn();
    attachWheelSource(element, onSample);

    const event = dispatch(textarea, wheelEvent({ deltaY: 10 }));

    expect(event.defaultPrevented).toBe(false);
    expect(onSample).not.toHaveBeenCalled();
  });

  it("stops handling wheel events after detach", () => {
    const onSample = vi.fn();
    const detach = attachWheelSource(element, onSample);
    detach();

    const event = dispatch(element, wheelEvent({ deltaY: 10 }));

    expect(onSample).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("attachSpaceKeySource", () => {
  function key(type: "keydown" | "keyup", code: string): KeyboardEvent {
    return new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  }

  it("reports Space as held on keydown and prevents page scrolling", () => {
    const changes: boolean[] = [];
    attachSpaceKeySource(element, (isHeld) => changes.push(isHeld));

    const event = dispatch(element, key("keydown", "Space"));

    expect(changes).toEqual([true]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports Space as released on keyup", () => {
    const changes: boolean[] = [];
    attachSpaceKeySource(element, (isHeld) => changes.push(isHeld));

    dispatch(element, key("keydown", "Space"));
    dispatch(element, key("keyup", "Space"));

    expect(changes).toEqual([true, false]);
  });

  it("releases Space when the element loses focus", () => {
    const changes: boolean[] = [];
    attachSpaceKeySource(element, (isHeld) => changes.push(isHeld));
    dispatch(element, key("keydown", "Space"));

    dispatch(element, new Event("blur"));

    expect(changes).toEqual([true, false]);
  });

  it("ignores other keys", () => {
    const onChange = vi.fn();
    attachSpaceKeySource(element, onChange);

    const event = dispatch(element, key("keydown", "KeyA"));
    dispatch(element, key("keyup", "KeyA"));

    expect(onChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("lets Space be typed into a text input", () => {
    const onChange = vi.fn();
    attachSpaceKeySource(element, onChange);

    const event = dispatch(textarea, key("keydown", "Space"));

    expect(onChange).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops reacting after detach", () => {
    const onChange = vi.fn();
    const detach = attachSpaceKeySource(element, onChange);
    detach();

    dispatch(element, key("keydown", "Space"));
    dispatch(element, new Event("blur"));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("attachNativeGestureGuard", () => {
  function touch(type: "touchstart" | "touchmove"): Event {
    return new Event(type, { bubbles: true, cancelable: true });
  }

  function parentSees(type: string): () => boolean {
    const spy = vi.fn();
    parent.addEventListener(type, spy);
    return () => spy.mock.calls.length > 0;
  }

  it("registers touch listeners as non-passive so preventDefault is honored", () => {
    const addSpy = vi.spyOn(element, "addEventListener");

    attachNativeGestureGuard(element);

    expect(addSpy).toHaveBeenCalledWith("touchstart", expect.any(Function), { passive: false });
    expect(addSpy).toHaveBeenCalledWith("touchmove", expect.any(Function), { passive: false });
  });

  it("cancels the default of touchmove so the browser does not scroll or navigate", () => {
    attachNativeGestureGuard(element);

    expect(dispatch(element, touch("touchmove")).defaultPrevented).toBe(true);
  });

  it("keeps touchmove from reaching ancestors such as the Obsidian swipe handlers", () => {
    attachNativeGestureGuard(element);
    const reached = parentSees("touchmove");

    dispatch(element, touch("touchmove"));

    expect(reached()).toBe(false);
  });

  it("keeps touchstart from reaching ancestors but does not cancel it", () => {
    attachNativeGestureGuard(element);
    const reached = parentSees("touchstart");

    const event = dispatch(element, touch("touchstart"));

    expect(reached()).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves touches on a text input to the browser", () => {
    attachNativeGestureGuard(element);
    const reached = parentSees("touchmove");

    const event = dispatch(textarea, touch("touchmove"));

    expect(event.defaultPrevented).toBe(false);
    expect(reached()).toBe(true);
  });

  it.each(["gesturestart", "gesturechange", "gestureend"])("cancels the Safari %s event", (name) => {
    attachNativeGestureGuard(element);

    expect(dispatch(element, new Event(name, { cancelable: true })).defaultPrevented).toBe(true);
  });

  it("stops guarding after detach", () => {
    const detach = attachNativeGestureGuard(element);
    detach();
    const reached = parentSees("touchmove");

    const event = dispatch(element, touch("touchmove"));

    expect(event.defaultPrevented).toBe(false);
    expect(reached()).toBe(true);
  });
});

describe("attachPointerSource", () => {
  beforeEach(() => {
    element.setPointerCapture = vi.fn();
  });

  function pointer(type: string, init: PointerEventInit & { pointerType?: string }): PointerEvent {
    return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });
  }

  it("reports a down sample with element-relative coordinates", () => {
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(element, pointer("pointerdown", { clientX: 60, clientY: 90, pointerType: "touch" }));

    expect(samples[0]).toMatchObject({ phase: "down", pointerId: 1, kind: "touch", x: 50, y: 70, button: 0 });
  });

  it.each([
    ["pointermove", "move"],
    ["pointerup", "up"],
    ["pointercancel", "cancel"],
    ["lostpointercapture", "cancel"],
  ])("maps %s to the %s phase", (eventName, phase) => {
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(element, pointer(eventName, { pointerType: "touch" }));

    expect(samples[0]?.phase).toBe(phase);
  });

  it("treats a pen as touch", () => {
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(element, pointer("pointerdown", { pointerType: "pen" }));

    expect(samples[0]?.kind).toBe("touch");
  });

  it("treats a mouse as mouse", () => {
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(element, pointer("pointerdown", { pointerType: "mouse" }));

    expect(samples[0]?.kind).toBe("mouse");
  });

  it("captures the pointer on pointerdown", () => {
    attachPointerSource(element, () => undefined);

    dispatch(element, pointer("pointerdown", { pointerId: 7, pointerType: "touch" }));

    expect(element.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it("cancels the default of a middle-button press so the browser does not start autoscroll", () => {
    attachPointerSource(element, () => undefined);

    const event = dispatch(element, pointer("pointerdown", { button: 1, pointerType: "mouse" }));

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not cancel the default of a left-button press", () => {
    attachPointerSource(element, () => undefined);

    const event = dispatch(element, pointer("pointerdown", { button: 0, pointerType: "mouse" }));

    expect(event.defaultPrevented).toBe(false);
  });

  it("focuses the canvas on a mouse press so Space and keys reach it", () => {
    attachPointerSource(element, () => undefined);
    element.tabIndex = 0;

    dispatch(element, pointer("pointerdown", { pointerType: "mouse" }));

    expect(document.activeElement).toBe(element);
  });

  it("reports a node target when the event comes from inside a node element", () => {
    const node = document.createElement("div");
    node.setAttribute("data-pinchmap-hit", "node");
    node.setAttribute("data-node-id", "n1");
    const inner = document.createElement("span");
    node.appendChild(inner);
    element.appendChild(node);
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(inner, pointer("pointerdown", { pointerType: "touch" }));

    expect(samples[0]?.target).toEqual({ kind: "node", nodeId: "n1" });
  });

  it("reports the canvas as target for events on the element itself", () => {
    element.setAttribute("data-pinchmap-hit", "canvas");
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(element, pointer("pointerdown", { pointerType: "touch" }));

    expect(samples[0]?.target).toEqual({ kind: "canvas" });
  });

  it("ignores pointer events on a text input", () => {
    const onSample = vi.fn();
    attachPointerSource(element, onSample);

    dispatch(textarea, pointer("pointerdown", { pointerType: "touch" }));

    expect(onSample).not.toHaveBeenCalled();
    expect(element.setPointerCapture).not.toHaveBeenCalled();
  });

  it("stops reporting after detach", () => {
    const onSample = vi.fn();
    const detach = attachPointerSource(element, onSample);
    detach();

    dispatch(element, pointer("pointerdown", { pointerType: "touch" }));

    expect(onSample).not.toHaveBeenCalled();
  });
});
