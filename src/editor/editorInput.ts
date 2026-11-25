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
  ];
}
