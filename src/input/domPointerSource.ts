import type { HitTarget, PointerSample } from "./gestureRecognizer";
import { hitTargetOf, isNativeTextInputTarget } from "./domTargets";

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
    target: findHitTarget(event),
    isPrimary: event.isPrimary,
    ...(isAdditive(event) ? { isAdditive: true } : {}),
  };
}

function isAdditive(event: PointerEvent): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

function findHitTarget(event: PointerEvent): HitTarget {
  const target = hitTargetOf(event.target);
  if (target.kind !== "add-child" && target.kind !== "add-sibling") return target;
  return nodeUnderPointerOtherThan(event, target.nodeId) ?? target;
}

function nodeUnderPointerOtherThan(event: PointerEvent, ownerNodeId: string): HitTarget | null {
  const stack = (event.target as Node).ownerDocument?.elementsFromPoint?.(event.clientX, event.clientY) ?? [];
  for (const element of stack) {
    const target = hitTargetOf(element);
    if (target.kind === "node" && target.nodeId !== ownerNodeId) return target;
  }
  return null;
}
