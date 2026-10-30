import type { Modifier, Scope } from "obsidian";

export interface ViewZoomActions {
  fitToScreen(): void;
  zoomStep(direction: "in" | "out"): void;
}

interface ZoomHotkey {
  readonly modifiers: Modifier[];
  readonly key: string;
  readonly run: (actions: ViewZoomActions) => void;
}

const FIT: ZoomHotkey["run"] = (actions) => actions.fitToScreen();
const ZOOM_IN: ZoomHotkey["run"] = (actions) => actions.zoomStep("in");
const ZOOM_OUT: ZoomHotkey["run"] = (actions) => actions.zoomStep("out");

const ZOOM_HOTKEYS: readonly ZoomHotkey[] = [
  { modifiers: ["Mod"], key: "0", run: FIT },
  { modifiers: ["Mod"], key: "=", run: ZOOM_IN },
  { modifiers: ["Mod"], key: "+", run: ZOOM_IN },
  { modifiers: ["Mod", "Shift"], key: "+", run: ZOOM_IN },
  { modifiers: ["Mod"], key: "-", run: ZOOM_OUT },
];

export function registerViewZoomHotkeys(scope: Scope, actions: ViewZoomActions): void {
  for (const { modifiers, key, run } of ZOOM_HOTKEYS) {
    scope.register(modifiers, key, () => {
      run(actions);
      return false;
    });
  }
}
