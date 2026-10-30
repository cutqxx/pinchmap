import type { WheelSample } from "./gestureRecognizer";
import { isNativeTextInputTarget } from "./domTargets";

const PIXELS_PER_LINE = 16;

export function attachWheelSource(
  element: HTMLElement,
  onSample: (sample: WheelSample) => void,
): () => void {
  const listener = (event: WheelEvent): void => {
    if (isNativeTextInputTarget(event.target)) return;
    event.preventDefault();
    onSample(toSample(element, event));
  };
  element.addEventListener("wheel", listener, { passive: false });
  return () => element.removeEventListener("wheel", listener);
}

function toSample(element: HTMLElement, event: WheelEvent): WheelSample {
  const bounds = element.getBoundingClientRect();
  const pixelsPerUnit = pixelsPerDeltaUnit(event.deltaMode, element.clientHeight);
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
    deltaX: event.deltaX * pixelsPerUnit,
    deltaY: event.deltaY * pixelsPerUnit,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  };
}

function pixelsPerDeltaUnit(deltaMode: number, pageHeight: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return PIXELS_PER_LINE;
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return pageHeight;
  return 1;
}
