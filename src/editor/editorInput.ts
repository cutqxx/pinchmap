import {
  attachContextMenuSource,
  attachKeySource,
  attachNativeGestureGuard,
  attachPointerSource,
  attachSpaceKeySource,
  attachWheelSource,
} from "../input";
import type { GestureRecognizer, Intent } from "../input";

export interface EditorInputDeps {
  readonly recognizer: GestureRecognizer;
  isEditingText(): boolean;
  handleIntent(intent: Intent): void;
}

const RENDERED_CONTENT_SELECTOR = "a, .tag, img, .internal-embed";
const CLICK_EVENTS = ["click", "auxclick"] as const;

function isRenderedContentInsideNode(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (typeof element?.closest !== "function") return false;
  const content = element.closest(RENDERED_CONTENT_SELECTOR);
  return content !== null && content.closest(".pinchmap-node") !== null;
}

/** Stops links, tags and embeds inside nodes from reacting to clicks: a tap only selects the node. */
function attachRenderedContentClickGuard(canvas: HTMLElement): () => void {
  const guard = (event: Event): void => {
    if (!isRenderedContentInsideNode(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  CLICK_EVENTS.forEach((type) => canvas.addEventListener(type, guard, true));
  return () => CLICK_EVENTS.forEach((type) => canvas.removeEventListener(type, guard, true));
}

/** Connects the canvas DOM events to the gesture recognizer; returns the detach callbacks. */
export function attachEditorInput(canvas: HTMLElement, deps: EditorInputDeps): readonly (() => void)[] {
  const { recognizer, handleIntent } = deps;
  const dispatch = (intents: readonly Intent[]): void => intents.forEach((intent) => handleIntent(intent));
  return [
    attachPointerSource(canvas, (sample) => dispatch(recognizer.handle(sample))),
    attachContextMenuSource(canvas, (sample) => dispatch(recognizer.handleContextMenu(sample))),
    attachWheelSource(canvas, (sample) => dispatch(recognizer.handleWheel(sample))),
    attachSpaceKeySource(canvas, (isHeld) => recognizer.setSpaceHeld(isHeld)),
    attachKeySource(canvas, () => (deps.isEditingText() ? "editing" : "navigate"), handleIntent),
    attachNativeGestureGuard(canvas),
    attachRenderedContentClickGuard(canvas),
  ];
}
