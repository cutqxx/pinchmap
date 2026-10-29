// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { attachContextMenuSource } from "./domContextMenuSource";
import type { ContextMenuSample } from "./gestureRecognizer";

let parent: HTMLElement;
let element: HTMLElement;
let node: HTMLElement;
let textarea: HTMLTextAreaElement;

beforeEach(() => {
  parent = document.createElement("div");
  element = document.createElement("div");
  node = document.createElement("div");
  node.setAttribute("data-pinchmap-hit", "node");
  node.setAttribute("data-node-id", "n1");
  textarea = document.createElement("textarea");
  node.appendChild(textarea);
  element.appendChild(node);
  parent.appendChild(element);
  document.body.appendChild(parent);
  element.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
});

afterEach(() => {
  parent.remove();
});

function contextMenu(target: EventTarget, init: MouseEventInit & { pointerType?: string } = {}): Event {
  const { pointerType, ...mouseInit } = init;
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...mouseInit });
  if (pointerType !== undefined) Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
  return event;
}

describe("attachContextMenuSource", () => {
  it("reports a right click on the canvas with element-relative point and a canvas target", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));

    contextMenu(element, { clientX: 110, clientY: 70 });

    expect(samples).toEqual([{ x: 100, y: 50, target: { kind: "canvas" } }]);
  });

  it("prevents the browser's own context menu", () => {
    attachContextMenuSource(element, () => undefined);

    const event = contextMenu(element, { clientX: 110, clientY: 70 });

    expect(event.defaultPrevented).toBe(true);
  });

  it("reports the node target when the right click lands on a node", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));

    contextMenu(node, { clientX: 50, clientY: 60 });

    expect(samples).toEqual([{ x: 40, y: 40, target: { kind: "node", nodeId: "n1" } }]);
  });

  it("reports nothing for a contextmenu originating from touch but still suppresses the native menu", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));

    const event = contextMenu(element, { clientX: 110, clientY: 70, pointerType: "touch" });

    expect(samples).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports a contextmenu from a mouse pointer type", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));

    contextMenu(element, { clientX: 110, clientY: 70, pointerType: "mouse" });

    expect(samples).toHaveLength(1);
  });

  it("ignores a right click inside a text area and leaves the native menu alone", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));

    const event = contextMenu(textarea, { clientX: 50, clientY: 60 });

    expect(samples).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("stops reporting after detach", () => {
    const samples: ContextMenuSample[] = [];
    const detach = attachContextMenuSource(element, (s) => samples.push(s));

    detach();
    const event = contextMenu(element, { clientX: 110, clientY: 70 });

    expect(samples).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });
});

function pointerEvent(target: EventTarget, type: string, pointerType: string, pointerId = 1): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType }));
}

describe("attachContextMenuSource while a touch pointer is active", () => {
  it("ignores a mouse-like contextmenu but still suppresses the native menu", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));
    pointerEvent(element, "pointerdown", "touch");

    const event = contextMenu(element, { clientX: 110, clientY: 70 });

    expect(samples).toEqual([]);
    expect(event.defaultPrevented).toBe(true);
  });

  it("reports a mouse contextmenu again after the touch pointer is released", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));
    pointerEvent(element, "pointerdown", "touch");
    pointerEvent(element, "pointerup", "touch");

    contextMenu(element, { clientX: 110, clientY: 70 });

    expect(samples).toHaveLength(1);
  });

  it("reports a mouse contextmenu again after the touch pointer is cancelled", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));
    pointerEvent(element, "pointerdown", "touch");
    pointerEvent(element, "pointercancel", "touch");

    contextMenu(element, { clientX: 110, clientY: 70 });

    expect(samples).toHaveLength(1);
  });

  it("keeps ignoring while another touch pointer is still down", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));
    pointerEvent(element, "pointerdown", "touch", 1);
    pointerEvent(element, "pointerdown", "touch", 2);
    pointerEvent(element, "pointerup", "touch", 1);

    contextMenu(element, { clientX: 110, clientY: 70 });

    expect(samples).toEqual([]);
  });

  it("is not blocked by a mouse pointer being down", () => {
    const samples: ContextMenuSample[] = [];
    attachContextMenuSource(element, (s) => samples.push(s));
    pointerEvent(element, "pointerdown", "mouse");

    contextMenu(element, { clientX: 110, clientY: 70 });

    expect(samples).toHaveLength(1);
  });

  it("stops tracking touch pointers after detach", () => {
    const samples: ContextMenuSample[] = [];
    const detach = attachContextMenuSource(element, (s) => samples.push(s));
    detach();
    pointerEvent(element, "pointerdown", "touch");
    const reattached = attachContextMenuSource(element, (s) => samples.push(s));

    contextMenu(element, { clientX: 110, clientY: 70 });
    reattached();

    expect(samples).toHaveLength(1);
  });

  it("removes every listener on detach", () => {
    const added: string[] = [];
    const removed: string[] = [];
    const add = element.addEventListener.bind(element);
    const remove = element.removeEventListener.bind(element);
    element.addEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject]) => {
      added.push(type);
      add(type, ...rest);
    }) as typeof element.addEventListener;
    element.removeEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject]) => {
      removed.push(type);
      remove(type, ...rest);
    }) as typeof element.removeEventListener;

    attachContextMenuSource(element, () => undefined)();

    expect(removed.sort()).toEqual(added.sort());
    expect(added).toHaveLength(4);
  });
});
