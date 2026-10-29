import type { HitTarget, PointerSample } from "./gestureRecognizer";

const HIT_SELECTOR = "[data-pinchmap-hit]";
const NATIVE_TEXT_INPUT_SELECTOR = "textarea, input";

const POINTER_EVENTS = [
  ["pointerdown", "down"],
  ["pointermove", "move"],
  ["pointerup", "up"],
  ["pointercancel", "cancel"],
] as const;

export function attachPointerSource(
  element: HTMLElement,
  onSample: (sample: PointerSample) => void,
): () => void {
  const subscriptions = POINTER_EVENTS.map(([eventName, phase]) => {
    const listener = (event: PointerEvent): void => {
      if (closestElement(event.target, NATIVE_TEXT_INPUT_SELECTOR) !== null) return;
      onSample(toSample(event, phase));
    };
    element.addEventListener(eventName, listener);
    return () => element.removeEventListener(eventName, listener);
  });
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

function toSample(event: PointerEvent, phase: PointerSample["phase"]): PointerSample {
  return {
    phase,
    pointerId: event.pointerId,
    kind: event.pointerType === "mouse" ? "mouse" : "touch",
    x: event.clientX,
    y: event.clientY,
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

function closestElement(eventTarget: EventTarget | null, selector: string): Element | null {
  const isElement = eventTarget !== null && "closest" in eventTarget;
  return isElement ? (eventTarget as Element).closest(selector) : null;
}
