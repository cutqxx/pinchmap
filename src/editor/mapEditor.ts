import {
  GestureRecognizer,
  attachContextMenuSource,
  attachNativeGestureGuard,
  attachKeySource,
  attachPointerSource,
  attachSpaceKeySource,
  attachWheelSource,
} from "../input";
import { DEFAULT_GESTURE_CONFIG } from "../input";
import type { HitTarget, Intent, ScreenPoint } from "../input";
import { computeLayout } from "../layout";
import type { LayoutResult, Size } from "../layout";
import type { MindMap, NodeId } from "../model";
import { MapRenderer } from "../render";
import type { AddButtonLabels, RenderUi } from "../render";
import { CameraController, isCameraIntent } from "./cameraController";
import { EmptySpaceMenu } from "./emptySpaceMenu";
import type { MenuItem } from "./emptySpaceMenu";
import { DEFAULT_NODE_MENU_LABELS, NodeMenu } from "./nodeMenu";
import type { NodeMenuLabels } from "./nodeMenu";
import { KeyboardAssist } from "./keyboardAssist";
import { NodeEdits } from "./nodeEdits";
import { Selection } from "./selection";
import { TextEditing } from "./textEditing";
import type { VisibleAreaSource } from "./visibleArea";

export type { MenuItem };

export interface MapHost {
  onMapChanged(): void;
  showMenu(items: readonly MenuItem[], at: ScreenPoint): void;
  onTextEditEnded(): void;
  notify(message: string): void;
}

export interface MapEditorOptions {
  readonly container: HTMLElement;
  readonly host: MapHost;
  readonly requestFrame?: (callback: () => void) => void;
  readonly labels?: AddButtonLabels;
  readonly visibleArea?: VisibleAreaSource;
  readonly doneLabel?: string;
  readonly addNodeLabel?: string;
  readonly nodeMenuLabels?: NodeMenuLabels;
  readonly longPressSeconds?: number;
}

const MILLISECONDS_PER_SECOND = 1000;

export class MapEditor {
  private readonly renderer: MapRenderer;
  private readonly recognizer: GestureRecognizer;
  private readonly selection: Selection;
  private readonly nodeEdits: NodeEdits;
  private readonly textEditing: TextEditing;
  private readonly emptySpaceMenu: EmptySpaceMenu;
  private readonly nodeMenu: NodeMenu;
  private readonly host: MapHost;
  private readonly requestFrame: (callback: () => void) => void;
  private readonly camera: CameraController;
  private readonly detachInput: readonly (() => void)[];
  private readonly resizeObserver: ResizeObserver;
  private readonly keyboardAssist: KeyboardAssist;
  private layout: LayoutResult | null = null;
  private sizes: ReadonlyMap<NodeId, Size> = new Map();
  private isFramePending = false;
  private isDestroyed = false;

  constructor({
    container,
    host,
    requestFrame,
    labels,
    visibleArea,
    doneLabel,
    addNodeLabel,
    nodeMenuLabels,
    longPressSeconds,
  }: MapEditorOptions) {
    const view = container.ownerDocument.defaultView;
    this.host = host;
    this.recognizer = new GestureRecognizer(DEFAULT_GESTURE_CONFIG, (intent) => this.handleIntent(intent));
    if (longPressSeconds !== undefined) this.setLongPressSeconds(longPressSeconds);
    this.requestFrame = requestFrame ?? ((callback) => void view?.requestAnimationFrame(callback));
    this.renderer = new MapRenderer(container, { labels });
    this.camera = new CameraController(this.renderer, this.requestFrame);
    this.selection = new Selection({
      focusCanvas: () => this.renderer.focusCanvas(),
      scheduleFrame: () => this.scheduleFrame(),
    });
    this.nodeEdits = this.createNodeEdits();
    this.textEditing = this.createTextEditing();
    this.emptySpaceMenu = this.createEmptySpaceMenu(addNodeLabel ?? "Add node");
    this.nodeMenu = this.createNodeMenu(nodeMenuLabels ?? DEFAULT_NODE_MENU_LABELS);
    this.detachInput = this.attachInput(this.renderer.canvasElement);
    this.resizeObserver = new ResizeObserver(() => this.scheduleFrame());
    this.resizeObserver.observe(container);
    this.keyboardAssist = new KeyboardAssist({
      visibleArea: visibleArea ?? null,
      doc: container.ownerDocument,
      doneLabel: doneLabel ?? "Done",
      camera: this.camera,
      canvasElement: this.renderer.canvasElement,
      onDone: () => this.textEditing.commit({ kind: "keyboard" }),
      onVisibleAreaChanged: () => this.onVisibleAreaChanged(),
    });
  }

  getMap(): MindMap {
    return this.textEditing.persistedMap();
  }

  loadMap(map: MindMap): void {
    this.textEditing.cancel();
    this.nodeEdits.replaceDisplayMap(map);
    this.selection.set(null);
    this.layout = null;
    this.sizes = new Map();
    this.scheduleFrame();
  }

  beginEditingNode(nodeId: NodeId): void {
    if (!this.nodeEdits.getDisplayMap().nodes.has(nodeId)) return;
    this.selection.set(nodeId);
    this.renderFrame();
    this.textEditing.beginEditing(nodeId, null);
  }

  setLongPressSeconds(seconds: number): void {
    this.recognizer.setLongPressMs(seconds * MILLISECONDS_PER_SECOND);
  }

  isEditingText(): boolean {
    return this.textEditing.isEditing();
  }

  commitPendingEdit(): void {
    this.textEditing.commit();
  }

  destroy(): void {
    this.commitPendingEdit();
    this.isDestroyed = true;
    this.recognizer.dispose();
    this.camera.destroy();
    this.resizeObserver.disconnect();
    this.keyboardAssist.destroy();
    this.detachInput.forEach((detach) => detach());
    this.renderer.destroy();
  }

  private createNodeEdits(): NodeEdits {
    return new NodeEdits({
      selection: this.selection,
      getLayout: () => this.layout,
      getSizes: () => this.sizes,
      onMapChanged: () => this.host.onMapChanged(),
      renderFrame: () => this.renderFrame(),
      scheduleFrame: () => this.scheduleFrame(),
      beginEditingNewNode: (nodeId, origin) => this.textEditing.beginEditing(nodeId, origin),
    });
  }

  private createTextEditing(): TextEditing {
    return new TextEditing({
      selection: this.selection,
      canvasElement: this.renderer.canvasElement,
      getNodeElement: (nodeId) => this.renderer.getNodeElement(nodeId),
      getDisplayMap: () => this.nodeEdits.getDisplayMap(),
      replaceDisplayMap: (map) => this.nodeEdits.replaceDisplayMap(map),
      applyEdit: (edit) => this.nodeEdits.applyEdit(edit),
      focusCanvas: () => this.renderer.focusCanvas(),
      scheduleFrame: () => this.scheduleFrame(),
      onTextEditEnded: () => this.host.onTextEditEnded(),
    });
  }

  private createEmptySpaceMenu(addNodeLabel: string): EmptySpaceMenu {
    return new EmptySpaceMenu({
      canvasElement: this.renderer.canvasElement,
      addNodeLabel,
      getCamera: () => this.camera.getCamera(),
      showMenu: (items, at) => this.host.showMenu(items, at),
      commitPendingEdit: () => this.commitPendingEdit(),
      createNode: (creation) => this.nodeEdits.createNode(creation),
    });
  }

  private createNodeMenu(labels: NodeMenuLabels): NodeMenu {
    return new NodeMenu({
      canvasElement: this.renderer.canvasElement,
      labels,
      actions: {
        addChildTo: (nodeId) => this.nodeEdits.addChildTo(nodeId),
        addSiblingTo: (nodeId) => this.nodeEdits.addSiblingTo(nodeId),
        deleteNode: (nodeId) => this.deleteNodeAndFocusCanvas(nodeId),
      },
      getMap: () => this.nodeEdits.getDisplayMap(),
      showMenu: (items, at) => this.host.showMenu(items, at),
      commitPendingEdit: () => this.commitPendingEdit(),
      selectNode: (nodeId) => this.selection.select(nodeId),
    });
  }

  private deleteNodeAndFocusCanvas(nodeId: NodeId): void {
    this.nodeEdits.deleteNode(nodeId);
    this.renderer.focusCanvas();
  }

  private attachInput(canvas: HTMLElement): readonly (() => void)[] {
    const dispatch = (intents: readonly Intent[]): void =>
      intents.forEach((intent) => this.handleIntent(intent));
    return [
      attachPointerSource(canvas, (sample) => dispatch(this.recognizer.handle(sample))),
      attachContextMenuSource(canvas, (sample) => dispatch(this.recognizer.handleContextMenu(sample))),
      attachWheelSource(canvas, (sample) => dispatch(this.recognizer.handleWheel(sample))),
      attachSpaceKeySource(canvas, (isHeld) => this.recognizer.setSpaceHeld(isHeld)),
      attachKeySource(canvas, () => (this.textEditing.isEditing() ? "editing" : "navigate"), (intent) =>
        this.handleIntent(intent),
      ),
      attachNativeGestureGuard(canvas),
    ];
  }

  private handleIntent(intent: Intent): void {
    if (this.isDestroyed) return;
    if (isCameraIntent(intent)) {
      this.camera.handle(intent);
      return;
    }
    this.commitPendingEdit();
    switch (intent.type) {
      case "tap":
        return this.handleTap(intent.target);
      case "doubleTap":
        return this.handleDoubleTap(intent.target, intent.point);
      case "longPress":
      case "contextMenu":
        return this.openContextMenu(intent.target, intent.point);
      case "addChild":
        return this.nodeEdits.addChildToSelection();
      case "addSibling":
        return this.nodeEdits.addSiblingToSelection();
      case "deleteSelection":
        return this.nodeEdits.deleteSelection();
      case "editSelection":
        return this.editSelection();
      case "clearSelection":
        return this.selection.select(null);
    }
  }

  private openContextMenu(target: HitTarget, point: ScreenPoint): void {
    switch (target.kind) {
      case "canvas":
        return this.emptySpaceMenu.requestMenu(target, point);
      case "node":
        return this.nodeMenu.requestMenu(target, point);
      case "add-child":
      case "add-sibling":
        return;
    }
  }

  private handleTap(target: HitTarget): void {
    switch (target.kind) {
      case "node":
        return this.selection.select(target.nodeId);
      case "canvas":
        return this.selection.select(null);
      case "add-child":
        return this.nodeEdits.addChildTo(target.nodeId);
      case "add-sibling":
        return this.nodeEdits.addSiblingTo(target.nodeId);
    }
  }

  private handleDoubleTap(target: HitTarget, point: ScreenPoint): void {
    this.handleTap(target);
    if (target.kind === "node") this.textEditing.beginEditing(target.nodeId, null);
    if (target.kind === "canvas") this.emptySpaceMenu.addRootAt(point);
  }

  private editSelection(): void {
    const selectedId = this.selection.current;
    if (selectedId !== null) this.textEditing.beginEditing(selectedId, null);
  }

  private scheduleFrame(): void {
    if (this.isFramePending || this.isDestroyed) return;
    this.isFramePending = true;
    this.requestFrame(() => {
      this.isFramePending = false;
      if (!this.isDestroyed) this.renderFrame();
    });
  }

  private onVisibleAreaChanged(): void {
    if (this.textEditing.isEditing()) this.scheduleFrame();
  }

  private renderFrame(): void {
    const displayMap = this.nodeEdits.getDisplayMap();
    this.renderer.syncContent(displayMap, this.currentRenderUi());
    this.sizes = this.renderer.measure();
    this.layout = computeLayout(displayMap, this.sizes);
    this.renderer.place(displayMap, this.layout);
    this.keyboardAssist.sync(this.textEditing.currentDraft()?.nodeId ?? null, this.layout, this.sizes);
  }

  private currentRenderUi(): RenderUi {
    return { editing: this.textEditing.currentDraft(), selectedId: this.selection.current };
  }
}
