const NATIVE_TEXT_INPUT_SELECTOR = "textarea, input";

export function closestElement(eventTarget: EventTarget | null, selector: string): Element | null {
  const isElement = eventTarget !== null && "closest" in eventTarget;
  return isElement ? (eventTarget as Element).closest(selector) : null;
}

export function isNativeTextInputTarget(eventTarget: EventTarget | null): boolean {
  return closestElement(eventTarget, NATIVE_TEXT_INPUT_SELECTOR) !== null;
}
