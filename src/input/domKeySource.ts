import type { Intent } from "./gestureRecognizer";
import { isNativeTextInputTarget } from "./domTargets";
import { keyToIntent } from "./keymap";
import type { KeyMode } from "./keymap";

export function attachKeySource(
  element: HTMLElement,
  getMode: () => KeyMode,
  onIntent: (intent: Intent) => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const mode = isNativeTextInputTarget(event.target) ? "editing" : getMode();
    const intent = keyToIntent(
      {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      },
      mode,
    );
    if (intent === null) return;
    event.preventDefault();
    onIntent(intent);
  };
  element.addEventListener("keydown", onKeyDown);
  return () => element.removeEventListener("keydown", onKeyDown);
}
