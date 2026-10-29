import type { HitTarget } from "./gestureRecognizer";

const HIT_SELECTOR = "[data-pinchmap-hit]";
const NATIVE_TEXT_INPUT_SELECTOR = "textarea, input";

export function closestElement(eventTarget: EventTarget | null, selector: string): Element | null {
  const isElement = eventTarget !== null && "closest" in eventTarget;
  return isElement ? (eventTarget as Element).closest(selector) : null;
}

export function isNativeTextInputTarget(eventTarget: EventTarget | null): boolean {
  return closestElement(eventTarget, NATIVE_TEXT_INPUT_SELECTOR) !== null;
}

export function hitTargetOf(eventTarget: EventTarget | null): HitTarget {
  const hitElement = closestElement(eventTarget, HIT_SELECTOR);
  const nodeId = hitElement?.getAttribute("data-node-id");
  const kind = hitElement?.getAttribute("data-pinchmap-hit");
  if (nodeId && (kind === "node" || kind === "add-child" || kind === "add-sibling")) {
    return { kind, nodeId };
  }
  return { kind: "canvas" };
}
