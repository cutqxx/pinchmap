import type { Rect } from "../viewport";

export const DONE_BAR_HEIGHT_PX = 44;

export interface DoneBar {
  show(visibleArea: Rect): void;
  hide(): void;
  destroy(): void;
}

export function isCoarsePointer(view: Window | null): boolean {
  return view?.matchMedia?.("(pointer: coarse)").matches ?? false;
}

export function createDoneBar(
  doc: Document,
  label: string,
  onDone: () => void,
): DoneBar {
  const bar = doc.createElement("div");
  bar.className = "pinchmap-done-bar";
  bar.style.height = `${DONE_BAR_HEIGHT_PX}px`;
  bar.hidden = true;
  const button = bar.appendChild(doc.createElement("button"));
  button.className = "pinchmap-done-button";
  button.textContent = label;
  keepTextareaFocused(button);
  button.addEventListener("click", onDone);
  doc.body.appendChild(bar);
  return {
    show: (area) => placeAtBottomOf(bar, area),
    hide: () => void (bar.hidden = true),
    destroy: () => bar.remove(),
  };
}

function keepTextareaFocused(button: HTMLElement): void {
  const preventFocusSteal = (event: Event): void => event.preventDefault();
  button.addEventListener("pointerdown", preventFocusSteal);
  button.addEventListener("mousedown", preventFocusSteal);
}

function placeAtBottomOf(bar: HTMLElement, area: Rect): void {
  bar.hidden = false;
  bar.style.left = `${area.left}px`;
  bar.style.width = `${area.right - area.left}px`;
  bar.style.top = `${area.bottom - DONE_BAR_HEIGHT_PX}px`;
}
