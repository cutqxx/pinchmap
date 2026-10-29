import { isNativeTextInputTarget } from "./domTargets";

const SPACE_CODE = "Space";

export function attachSpaceKeySource(
  element: HTMLElement,
  onSpaceHeldChanged: (isHeld: boolean) => void,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== SPACE_CODE || isNativeTextInputTarget(event.target)) return;
    event.preventDefault();
    onSpaceHeldChanged(true);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.code === SPACE_CODE) onSpaceHeldChanged(false);
  };
  const onBlur = (): void => onSpaceHeldChanged(false);
  element.addEventListener("keydown", onKeyDown);
  element.addEventListener("keyup", onKeyUp);
  element.addEventListener("blur", onBlur);
  return () => {
    element.removeEventListener("keydown", onKeyDown);
    element.removeEventListener("keyup", onKeyUp);
    element.removeEventListener("blur", onBlur);
  };
}
