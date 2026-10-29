import type { HitTarget, PointerSample } from "./gestureRecognizer";
import { closestElement, isNativeTextInputTarget } from "./domTargets";

const HIT_SELECTOR = "[data-pinchmap-hit]";
const MIDDLE_BUTTON = 1;

const POINTER_EVENTS = [
  ["pointerdown", "down"],
  ["pointermove", "move"],
  ["pointerup", "up"],
  ["pointercancel", "cancel"],
  ["lostpointercapture", "cancel"],
] as const;

export function attachPointerSource(
  element: HTMLElement,
  onSample: (sample: PointerSample) => void,
): () => void {
  const subscriptions = POINTER_EVENTS.map(([eventName, phase]) => {
    const listener = (event: PointerEvent): void => {
      if (isNativeTextInputTarget(event.target)) return;
      if (phase === "down") prepareForPointerDown(element, event);
      onSample(toSample(element, event, phase));
    };
    element.addEventListener(eventName, listener);
    return () => element.removeEventListener(eventName, listener);
  });
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

function prepareForPointerDown(element: HTMLElement, event: PointerEvent): void {
  if (event.button === MIDDLE_BUTTON) event.preventDefault();
  element.setPointerCapture(event.pointerId);
  if (event.pointerType === "mouse") element.focus({ preventScroll: true });
}

function toSample(
  element: HTMLElement,
  event: PointerEvent,
  phase: PointerSample["phase"],
): PointerSample {
  const bounds = element.getBoundingClientRect();
  return {
    phase,
    pointerId: event.pointerId,
    kind: event.pointerType === "mouse" ? "mouse" : "touch",
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    time: event.timeStamp,
    button: event.button,
    target: findHitTarget(event.target),
  };
}

function findHitTarget(eventTarget: EventTarget | null): HitTarget {
  const hitElement = closestElement(eventTarget, HIT_SELECTOR);
  const nodeId = hitElement?.getAttribute("data-node-id");
  if (hitElement?.getAttribute("data-pinchmap-hit") === "node" && nodeId) {
    return { kind: "node", nodeId };
  }
  return { kind: "canvas" };
}
