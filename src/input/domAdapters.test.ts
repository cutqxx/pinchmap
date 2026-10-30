// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachNativeGestureGuard } from "./domNativeGestureGuard";
import { attachKeySource } from "./domKeySource";
import { attachPointerSource } from "./domPointerSource";
import { attachSpaceKeySource } from "./domSpaceKeySource";
import { attachWheelSource } from "./domWheelSource";
import type { Intent, PointerSample, WheelSample } from "./gestureRecognizer";
import type { KeyMode } from "./keymap";

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

  it.each(["add-child", "add-sibling"])("reports a %s target with the node id from a plus button", (kind) => {
    const node = document.createElement("div");
    node.setAttribute("data-pinchmap-hit", "node");
    node.setAttribute("data-node-id", "n1");
    const button = document.createElement("div");
    button.setAttribute("data-pinchmap-hit", kind);
    button.setAttribute("data-node-id", "n1");
    node.appendChild(button);
    element.appendChild(node);
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(button, pointer("pointerdown", { pointerType: "touch" }));

    expect(samples[0]?.target).toEqual({ kind, nodeId: "n1" });
  });

  it("falls back to the canvas target for an unknown hit kind", () => {
    const stray = document.createElement("div");
    stray.setAttribute("data-pinchmap-hit", "mystery");
    stray.setAttribute("data-node-id", "n1");
    element.appendChild(stray);
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));

    dispatch(stray, pointer("pointerdown", { pointerType: "touch" }));

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

describe("attachPointerSource on a plus button", () => {
  type ElementsFromPoint = Document["elementsFromPoint"] | undefined;
  let originalElementsFromPoint: ElementsFromPoint;
  let plusButton: HTMLElement;
  let ownNode: HTMLElement;
  let otherNode: HTMLElement;

  function hitElement(kind: string, nodeId?: string): HTMLElement {
    const hit = document.createElement("div");
    hit.setAttribute("data-pinchmap-hit", kind);
    if (nodeId !== undefined) hit.setAttribute("data-node-id", nodeId);
    return hit;
  }

  function stubStack(stack: readonly Element[] | undefined): void {
    const stub = stack === undefined ? undefined : () => [...stack];
    Object.defineProperty(document, "elementsFromPoint", { value: stub, configurable: true, writable: true });
  }

  function pressPlus(): PointerSample {
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));
    element.setPointerCapture = vi.fn();
    dispatch(plusButton, new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));
    return samples[0] as PointerSample;
  }

  beforeEach(() => {
    originalElementsFromPoint = document.elementsFromPoint;
    ownNode = hitElement("node", "a");
    plusButton = hitElement("add-sibling", "a");
    otherNode = hitElement("node", "b");
    ownNode.appendChild(plusButton);
    element.append(ownNode, otherNode);
  });

  afterEach(() => {
    Object.defineProperty(document, "elementsFromPoint", {
      value: originalElementsFromPoint,
      configurable: true,
      writable: true,
    });
  });

  it("targets the plus button when only its own node and the canvas are under the pointer", () => {
    stubStack([plusButton, ownNode, element, parent]);

    expect(pressPlus().target).toEqual({ kind: "add-sibling", nodeId: "a" });
  });

  it("targets the plus button when only the canvas is under the pointer besides it", () => {
    stubStack([plusButton, element]);

    expect(pressPlus().target).toEqual({ kind: "add-sibling", nodeId: "a" });
  });

  it("targets another node when it is under the pointer, even beneath the plus button", () => {
    stubStack([plusButton, ownNode, otherNode, element]);

    expect(pressPlus().target).toEqual({ kind: "node", nodeId: "b" });
  });

  it("targets the first other node in the stack when several are under the pointer", () => {
    const thirdNode = hitElement("node", "c");
    element.appendChild(thirdNode);
    stubStack([plusButton, thirdNode, otherNode]);

    expect(pressPlus().target).toEqual({ kind: "node", nodeId: "c" });
  });

  it("targets the plus button when the document cannot tell what is under the pointer", () => {
    stubStack(undefined);

    expect(pressPlus().target).toEqual({ kind: "add-sibling", nodeId: "a" });
  });

  it("does not look beneath a node that was hit directly", () => {
    const lookup = vi.fn(() => [otherNode]);
    Object.defineProperty(document, "elementsFromPoint", { value: lookup, configurable: true, writable: true });
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));
    element.setPointerCapture = vi.fn();

    dispatch(ownNode, new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));

    expect(samples[0]?.target).toEqual({ kind: "node", nodeId: "a" });
  });

  it("targets the add-child button the same way", () => {
    const addChildButton = hitElement("add-child", "a");
    ownNode.appendChild(addChildButton);
    stubStack([addChildButton, ownNode, otherNode]);
    const samples: PointerSample[] = [];
    attachPointerSource(element, (s) => samples.push(s));
    element.setPointerCapture = vi.fn();

    dispatch(addChildButton, new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));

    expect(samples[0]?.target).toEqual({ kind: "node", nodeId: "b" });
  });
});

describe("attachKeySource", () => {
  function keydown(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  function attach(mode: KeyMode = "navigate"): { intents: Intent[]; detach: () => void } {
    const intents: Intent[] = [];
    const detach = attachKeySource(element, () => mode, (intent) => intents.push(intent));
    return { intents, detach };
  }

  it("reports the intent of a mapped key and prevents its default action", () => {
    const { intents } = attach();

    const event = keydown(element, "Tab");

    expect(intents).toEqual([{ type: "addChild" }]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves unmapped keys alone", () => {
    const { intents } = attach();

    const event = keydown(element, "a");

    expect(intents).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a mapped key with a modifier alone", () => {
    const { intents } = attach();

    const event = keydown(element, "Tab", { ctrlKey: true });

    expect(intents).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not react to mapped keys while the editor is in editing mode", () => {
    const { intents } = attach("editing");

    const event = keydown(element, "Backspace");

    expect(intents).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(["Delete", "Backspace", "Enter", "Tab"])("treats %s in a textarea as editing even in navigate mode", (key) => {
    const { intents } = attach("navigate");

    const event = keydown(textarea, key);

    expect(intents).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("passes the physical key code so a Russian layout still undoes", () => {
    const { intents } = attach();

    const event = keydown(element, "я", { ctrlKey: true, code: "KeyZ" });

    expect(intents).toEqual([{ type: "undo" }]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("passes the physical key code so a Russian layout still redoes", () => {
    const { intents } = attach();

    keydown(element, "н", { ctrlKey: true, code: "KeyY" });

    expect(intents).toEqual([{ type: "redo" }]);
  });

  it("reports Ctrl+Shift+Z as redo", () => {
    const { intents } = attach();

    keydown(element, "Z", { ctrlKey: true, shiftKey: true, code: "KeyZ" });

    expect(intents).toEqual([{ type: "redo" }]);
  });

  it("falls back to the key when the event has no code", () => {
    const { intents } = attach();

    keydown(element, "z", { metaKey: true });

    expect(intents).toEqual([{ type: "undo" }]);
  });

  it("leaves Ctrl+Z inside a textarea alone", () => {
    const { intents } = attach();

    const event = keydown(textarea, "z", { ctrlKey: true, code: "KeyZ" });

    expect(intents).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("reads the mode at the time of each key press", () => {
    let mode: KeyMode = "editing";
    const intents: Intent[] = [];
    attachKeySource(element, () => mode, (intent) => intents.push(intent));

    keydown(element, "Delete");
    mode = "navigate";
    keydown(element, "Delete");

    expect(intents).toEqual([{ type: "deleteSelection" }]);
  });

  it("stops handling keys after detach", () => {
    const { intents, detach } = attach();
    detach();

    const event = keydown(element, "Enter");

    expect(intents).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });
});
