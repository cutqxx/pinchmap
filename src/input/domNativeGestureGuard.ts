import { isNativeTextInputTarget } from "./domTargets";

const NON_PASSIVE: AddEventListenerOptions = { passive: false };
const WEBKIT_GESTURE_EVENTS = ["gesturestart", "gesturechange", "gestureend"];

export function attachNativeGestureGuard(element: HTMLElement): () => void {
  const onTouchStart = (event: TouchEvent): void => {
    if (!isNativeTextInputTarget(event.target)) event.stopPropagation();
  };
  const onTouchMove = (event: TouchEvent): void => {
    if (isNativeTextInputTarget(event.target)) return;
    event.stopPropagation();
    event.preventDefault();
  };
  const onWebkitGesture = (event: Event): void => event.preventDefault();
  element.addEventListener("touchstart", onTouchStart, NON_PASSIVE);
  element.addEventListener("touchmove", onTouchMove, NON_PASSIVE);
  WEBKIT_GESTURE_EVENTS.forEach((name) => element.addEventListener(name, onWebkitGesture));
  return () => {
    element.removeEventListener("touchstart", onTouchStart, NON_PASSIVE);
    element.removeEventListener("touchmove", onTouchMove, NON_PASSIVE);
    WEBKIT_GESTURE_EVENTS.forEach((name) => element.removeEventListener(name, onWebkitGesture));
  };
}
