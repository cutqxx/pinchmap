import { DEFAULT_GESTURE_CONFIG, GestureRecognizer } from "../input";
import { clearPositionsOfReparentedNodes } from "../commands";
import type { MindMap, NodeId } from "../model";
import { MapRenderer } from "../render";
import type { AddButtonLabels, NodeContentRenderer, RenderUi } from "../render";
import { UNAVAILABLE_BRANCH_CLIPBOARD } from "./branchTransfer";
import type { BranchClipboard } from "./branchTransfer";
import { CameraController } from "./cameraController";
import { attachEditorInput } from "./editorInput";
import { createEditorParts } from "./editorParts";
import type { EditorParts } from "./editorParts";
import { IntentDispatcher } from "./intentDispatcher";
import { KeyboardAssist } from "./keyboardAssist";
import { DEFAULT_LINK_BUBBLE_LABELS } from "./linkBubble";
import type { LinkBubbleLabels } from "./linkBubble";
import { MapFrame } from "./mapFrame";
import type { MapHost } from "./mapHost";
import { DEFAULT_NODE_MENU_LABELS } from "./nodeMenu";
import type { NodeMenuLabels } from "./nodeMenu";
import { ViewShortcuts } from "./viewShortcuts";
import type { VisibleAreaSource } from "./visibleArea";

export type { BranchClipboard, MapHost };

export interface MapEditorOptions {
  readonly container: HTMLElement;
  readonly host: MapHost;
  readonly requestFrame?: (callback: () => void) => void;
  readonly labels?: AddButtonLabels;
  readonly visibleArea?: VisibleAreaSource;
  readonly doneLabel?: string;
  readonly addNodeLabel?: string;
  readonly resetMapLayoutLabel?: string;
  readonly nodeMenuLabels?: NodeMenuLabels;
  readonly linkBubbleLabels?: LinkBubbleLabels;
  readonly drawIcon?: (target: HTMLElement, iconName: string) => void;
  readonly longPressSeconds?: number;
  readonly clipboard?: BranchClipboard;
  readonly renderNodeContent?: NodeContentRenderer;
}

const MILLISECONDS_PER_SECOND = 1000;

export class MapEditor {
  private readonly renderer: MapRenderer;
  private readonly recognizer: GestureRecognizer;
  private readonly camera: CameraController;
  private readonly viewShortcuts: ViewShortcuts;
  private readonly frame: MapFrame;
  private readonly parts: EditorParts;
  private readonly intents: IntentDispatcher;
  private readonly detachInput: readonly (() => void)[];
  private readonly resizeObserver: ResizeObserver;
  private readonly keyboardAssist: KeyboardAssist;
  private isDestroyed = false;
  private mapSession = 0;

  constructor(options: MapEditorOptions) {
    const { container, labels, longPressSeconds } = options;
    const view = container.ownerDocument.defaultView;
    const requestFrame = options.requestFrame ?? ((callback) => void view?.requestAnimationFrame(callback));
    this.recognizer = new GestureRecognizer(DEFAULT_GESTURE_CONFIG, (intent) => this.intents.handle(intent));
    if (longPressSeconds !== undefined) this.setLongPressSeconds(longPressSeconds);
    this.renderer = new MapRenderer(container, {
      labels,
      contentRenderer: options.renderNodeContent,
      onContentResized: () => this.frame.schedule(),
    });
    this.camera = new CameraController(this.renderer, requestFrame);
    this.viewShortcuts = new ViewShortcuts({
      camera: this.camera,
      canvasElement: this.renderer.canvasElement,
      getLayout: () => this.frame.layout,
      getSizes: () => this.frame.sizes,
    });
    this.frame = this.createFrame(requestFrame);
    this.parts = this.createParts(options);
    this.intents = this.createIntentDispatcher();
    this.detachInput = attachEditorInput(this.renderer.canvasElement, {
      recognizer: this.recognizer,
      isEditingText: () => this.parts.textEditing.isEditing(),
      handleIntent: (intent) => this.intents.handle(intent),
    });
    this.resizeObserver = new ResizeObserver(() => this.frame.schedule());
    this.resizeObserver.observe(container);
    this.keyboardAssist = new KeyboardAssist({
      visibleArea: options.visibleArea ?? null,
      doc: container.ownerDocument,
      doneLabel: options.doneLabel ?? "Done",
      camera: this.camera,
      canvasElement: this.renderer.canvasElement,
      onDone: () => this.parts.textEditing.commit({ kind: "keyboard" }),
      onVisibleAreaChanged: () => this.onVisibleAreaChanged(),
    });
  }

  getMap(): MindMap {
    return this.parts.nodeDrag.committedMap() ?? this.parts.textEditing.persistedMap();
  }

  loadMap(map: MindMap): void {
    this.mapSession++;
    this.showLoadedMap(map);
  }

  reloadMap(map: MindMap): void {
    this.showLoadedMap(clearPositionsOfReparentedNodes(this.parts.nodeEdits.getDisplayMap(), map));
  }

  beginEditingNode(nodeId: NodeId): void {
    this.parts.nodeDrag.cancel();
    if (!this.parts.nodeEdits.getDisplayMap().nodes.has(nodeId)) return;
    this.parts.selection.set(nodeId);
    this.frame.render();
    this.parts.textEditing.beginEditing(nodeId, null);
  }

  /**
   * Undo while an empty new node is open only discards that node. Typed-in new
   * nodes and edits of existing nodes are committed first, then undone.
   */
  undo(): void {
    this.parts.nodeDrag.cancel();
    const isDiscardingEmptyNewNode = this.parts.textEditing.isEmptyNewNode();
    this.commitPendingEdit();
    if (!isDiscardingEmptyNewNode) this.parts.nodeEdits.undo();
  }

  /**
   * Redo with an empty new node open discards the node (no history step),
   * then redoes.
   */
  redo(): void {
    this.parts.nodeDrag.cancel();
    this.commitPendingEdit();
    this.parts.nodeEdits.redo();
  }

  fitToScreen(): void {
    if (!this.isEditingText()) this.viewShortcuts.fitToScreen();
  }

  zoomStep(direction: "in" | "out"): void {
    if (!this.isEditingText()) this.viewShortcuts.zoomStep(direction);
  }

  duplicateSelectedBranch(): void {
    if (this.isEditingText()) return;
    this.parts.nodeDrag.cancel();
    this.parts.branchTransfer.duplicate(this.parts.selection.sole);
  }

  hasSelection(): boolean {
    return this.parts.selection.sole !== null;
  }

  resetSelectedNodeLayout(): void {
    const selectedId = this.parts.selection.sole;
    this.parts.nodeDrag.cancel();
    if (selectedId !== null) this.parts.nodeEdits.resetNodeLayoutOf(selectedId);
  }

  resetMapLayout(): void {
    this.parts.nodeDrag.cancel();
    this.parts.nodeEdits.resetMapLayout();
  }

  setLongPressSeconds(seconds: number): void {
    this.recognizer.setLongPressMs(seconds * MILLISECONDS_PER_SECOND);
  }

  isEditingText(): boolean {
    return this.parts.textEditing.isEditing();
  }

  commitPendingEdit(): void {
    this.parts.textEditing.commit();
  }

  destroy(): void {
    this.commitPendingEdit();
    this.isDestroyed = true;
    this.recognizer.dispose();
    this.camera.destroy();
    this.resizeObserver.disconnect();
    this.keyboardAssist.destroy();
    this.parts.linkBubble.destroy();
    this.detachInput.forEach((detach) => detach());
    this.renderer.destroy();
  }

  private showLoadedMap(map: MindMap): void {
    const { textEditing, nodeDrag, marqueeSelection, nodeEdits, selection } = this.parts;
    textEditing.cancel();
    nodeDrag.cancel();
    marqueeSelection.cancel();
    nodeEdits.replaceDisplayMap(map);
    nodeEdits.clearHistory();
    selection.set(null);
    this.frame.reset();
    this.frame.schedule();
  }

  private createFrame(requestFrame: (callback: () => void) => void): MapFrame {
    return new MapFrame({
      renderer: this.renderer,
      requestFrame,
      getDisplayMap: () => this.parts.nodeEdits.getDisplayMap(),
      currentUi: () => this.currentRenderUi(),
      onRendered: (layout, sizes) =>
        this.keyboardAssist.sync(this.parts.textEditing.currentDraft()?.nodeId ?? null, layout, sizes),
      isDestroyed: () => this.isDestroyed,
    });
  }

  private createParts(options: MapEditorOptions): EditorParts {
    return createEditorParts({
      container: options.container,
      drawIcon: options.drawIcon ?? (() => undefined),
      host: options.host,
      renderer: this.renderer,
      camera: this.camera,
      clipboard: options.clipboard ?? UNAVAILABLE_BRANCH_CLIPBOARD,
      labels: {
        addNode: options.addNodeLabel ?? "Add node",
        resetMapLayout: options.resetMapLayoutLabel ?? "Reset map to auto-layout",
        nodeMenu: options.nodeMenuLabels ?? DEFAULT_NODE_MENU_LABELS,
        linkBubble: options.linkBubbleLabels ?? DEFAULT_LINK_BUBBLE_LABELS,
      },
      getLayout: () => this.frame.layout,
      getSizes: () => this.frame.sizes,
      renderFrame: () => this.frame.render(),
      scheduleFrame: () => this.frame.schedule(),
      resetMapLayout: () => this.resetMapLayout(),
      isActive: () => !this.isDestroyed,
      mapSession: () => this.mapSession,
    });
  }

  private createIntentDispatcher(): IntentDispatcher {
    return new IntentDispatcher({
      parts: this.parts,
      camera: this.camera,
      viewShortcuts: this.viewShortcuts,
      actions: this,
      getLayout: () => this.frame.layout,
      isDestroyed: () => this.isDestroyed,
    });
  }

  private onVisibleAreaChanged(): void {
    if (this.parts.textEditing.isEditing()) this.frame.schedule();
  }

  private currentRenderUi(): RenderUi {
    return {
      editing: this.parts.textEditing.currentDraft(),
      selectedIds: new Set(this.parts.selection.ids),
      dropTargetId: this.parts.nodeDrag.dropTargetId(),
    };
  }
}
