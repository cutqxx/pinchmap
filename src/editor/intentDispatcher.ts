import type { HitTarget, Intent, ScreenPoint } from "../input";
import type { LayoutResult } from "../layout";
import type { NodeId } from "../model";
import { isCameraIntent } from "./cameraController";
import type { CameraController, CameraIntent } from "./cameraController";
import type { EditorParts } from "./editorParts";
import { navigate } from "./navigation";
import type { NavigationDirection } from "./navigation";
import { isNodeDragIntent } from "./nodeDrag";
import type { ViewShortcuts } from "./viewShortcuts";

/** Editor-level actions an intent can trigger; they carry their own guards (e.g. no zoom while typing). */
export interface EditorActions {
  commitPendingEdit(): void;
  fitToScreen(): void;
  zoomStep(direction: "in" | "out"): void;
  undo(): void;
  redo(): void;
}

export interface IntentDispatcherDeps {
  readonly parts: EditorParts;
  readonly camera: CameraController;
  readonly viewShortcuts: ViewShortcuts;
  readonly actions: EditorActions;
  getLayout(): LayoutResult | null;
  isDestroyed(): boolean;
}

/** Maps input intents to editor collaborators. */
export class IntentDispatcher {
  constructor(private readonly deps: IntentDispatcherDeps) {}

  handle(intent: Intent): void {
    if (this.deps.isDestroyed()) return;
    if (isCameraIntent(intent)) {
      this.deps.camera.handle(intent);
      return;
    }
    // Any other intent arriving mid-drag (a key, a right click) must not build on the preview map.
    if (!isNodeDragIntent(intent)) this.deps.parts.nodeDrag.cancel();
    this.deps.actions.commitPendingEdit();
    this.dispatch(intent);
  }

  private dispatch(intent: Exclude<Intent, CameraIntent>): void {
    const { nodeDrag, marqueeSelection, nodeEdits, selection, branchTransfer } = this.deps.parts;
    const { actions } = this.deps;
    switch (intent.type) {
      case "tap":
        return this.handleTap(intent.target, intent.isAdditive === true);
      case "doubleTap":
        return this.handleDoubleTap(intent.target, intent.point);
      case "longPress":
      case "contextMenu":
        return this.openContextMenu(intent.target, intent.point);
      case "nodeDragStart":
        return nodeDrag.start(intent.nodeId);
      case "nodeDrag":
        return nodeDrag.move(intent.dx, intent.dy, intent.point);
      case "nodeDragEnd":
        return nodeDrag.end();
      case "nodeDragCancel":
        return nodeDrag.cancel();
      case "marqueeStart":
        return marqueeSelection.start(intent.origin);
      case "marqueeMove":
        return marqueeSelection.move(intent.point);
      case "marqueeEnd":
        return marqueeSelection.end();
      case "marqueeCancel":
        return marqueeSelection.cancel();
      case "toggleCollapse":
        return nodeEdits.toggleCollapseOfSelection();
      case "addChild":
        return nodeEdits.addChildToSelection();
      case "addSibling":
        return nodeEdits.addSiblingToSelection();
      case "deleteSelection":
        return nodeEdits.deleteSelection();
      case "editSelection":
        return this.editSelection();
      case "clearSelection":
        return selection.select(null);
      case "navigate":
        return this.navigateSelection(intent.direction);
      case "fitToScreen":
        return actions.fitToScreen();
      case "zoomStep":
        return actions.zoomStep(intent.direction);
      case "copyBranch":
        return this.ifSingleSelection(() => branchTransfer.copy(selection.current));
      case "pasteBranch":
        return this.ifSingleSelection(() => branchTransfer.paste(selection.current));
      case "duplicateBranch":
        return this.ifSingleSelection(() => branchTransfer.duplicate(selection.current));
      case "undo":
        return actions.undo();
      case "redo":
        return actions.redo();
    }
  }

  private openContextMenu(target: HitTarget, point: ScreenPoint): void {
    switch (target.kind) {
      case "canvas":
        return this.deps.parts.emptySpaceMenu.requestMenu(target, point);
      case "node":
        return this.deps.parts.nodeMenu.requestMenu(target, point);
      case "add-child":
      case "add-sibling":
      case "collapse-toggle":
        return;
    }
  }

  private ifSingleSelection(action: () => void): void {
    if (!this.deps.parts.selection.isMultiple) action();
  }

  private handleTap(target: HitTarget, isAdditive = false): void {
    const { selection, nodeEdits } = this.deps.parts;
    switch (target.kind) {
      case "node":
        return isAdditive ? selection.toggle(target.nodeId) : selection.select(target.nodeId);
      case "canvas":
        return selection.select(null);
      case "add-child":
        return nodeEdits.addChildTo(target.nodeId);
      case "add-sibling":
        return nodeEdits.addSiblingTo(target.nodeId);
      case "collapse-toggle":
        return this.toggleCollapseFromIndicator(target.nodeId);
    }
  }

  private toggleCollapseFromIndicator(nodeId: NodeId): void {
    this.deps.parts.selection.select(nodeId);
    this.deps.parts.nodeEdits.toggleCollapseOf(nodeId);
  }

  private handleDoubleTap(target: HitTarget, point: ScreenPoint): void {
    this.handleTap(target);
    if (target.kind === "node") this.deps.parts.textEditing.beginEditing(target.nodeId, null);
    if (target.kind === "canvas") this.deps.parts.emptySpaceMenu.addRootAt(point);
  }

  private navigateSelection(direction: NavigationDirection): void {
    const layout = this.deps.getLayout();
    if (layout === null) return;
    const { selection, nodeEdits } = this.deps.parts;
    const targetId = navigate(nodeEdits.getDisplayMap(), layout, selection.current, direction);
    if (targetId === null) return;
    selection.select(targetId);
    this.deps.viewShortcuts.revealNode(targetId);
  }

  private editSelection(): void {
    const selectedId = this.deps.parts.selection.sole;
    if (selectedId !== null) this.deps.parts.textEditing.beginEditing(selectedId, null);
  }
}
