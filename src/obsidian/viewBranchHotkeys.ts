import type { Scope } from "obsidian";

export interface ViewBranchActions {
  duplicateSelectedBranch(): void;
}

/** Keeps Mod+D with the map while its view is focused, even where the canvas itself holds no focus. */
export function registerViewBranchHotkeys(scope: Scope, actions: ViewBranchActions): void {
  scope.register(["Mod"], "d", () => {
    actions.duplicateSelectedBranch();
    return false;
  });
}
