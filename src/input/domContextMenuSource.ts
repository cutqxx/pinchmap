import type { ContextMenuSample } from "./gestureRecognizer";
import { hitTargetOf, isNativeTextInputTarget } from "./domTargets";

export function attachContextMenuSource(
  element: HTMLElement,
  onSample: (sample: ContextMenuSample) => void,
): () => void {
  const touchPointerIds = new Set<number>();
  const trackTouch = (event: PointerEvent): void => {
    if (event.pointerType === "touch") touchPointerIds.add(event.pointerId);
  };
  const untrackTouch = (event: PointerEvent): void => void touchPointerIds.delete(event.pointerId);
  const listener = (event: MouseEvent): void => {
    if (isNativeTextInputTarget(event.target)) return;
    event.preventDefault();
    if (isFromTouch(event) || touchPointerIds.size > 0) return;
    const bounds = element.getBoundingClientRect();
    onSample({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      target: hitTargetOf(event.target),
    });
  };
  element.addEventListener("contextmenu", listener);
  element.addEventListener("pointerdown", trackTouch);
  element.addEventListener("pointerup", untrackTouch);
  element.addEventListener("pointercancel", untrackTouch);
  return () => {
    element.removeEventListener("contextmenu", listener);
    element.removeEventListener("pointerdown", trackTouch);
    element.removeEventListener("pointerup", untrackTouch);
    element.removeEventListener("pointercancel", untrackTouch);
  };
}

function isFromTouch(event: MouseEvent): boolean {
  return (event as Partial<PointerEvent>).pointerType === "touch";
}
