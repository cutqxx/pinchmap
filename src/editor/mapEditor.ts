import { addChild, addSibling, deleteBranch, setNodeText } from "../commands";
import {
  GestureRecognizer,
  attachNativeGestureGuard,
  attachKeySource,
  attachPointerSource,
  attachSpaceKeySource,
  attachWheelSource,
} from "../input";
import type { HitTarget, Intent } from "../input";
import { chooseSideForNewBranch, computeLayout, positionBelowRootTree } from "../layout";
import type { LayoutResult, Size } from "../layout";
import { EMPTY_MIND_MAP, generateNodeId, getNode, readRootPosition, withSidesResolved } from "../model";
import type { MindMap, NodeId, RootPosition, Side } from "../model";
import { MapRenderer } from "../render";
import type { AddButtonLabels, RenderUi } from "../render";
import { CameraController, isCameraIntent } from "./cameraController";
import { KeyboardAssist } from "./keyboardAssist";
import { selectionAfterDelete } from "./selection";
import { beginTextEdit } from "./textEditSession";
import type { TextEditEnd, TextEditSession } from "./textEditSession";
import type { VisibleAreaSource } from "./visibleArea";

export interface MapHost {
  onMapChanged(): void;
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
}

interface EditingState {
  readonly nodeId: NodeId;
  readonly session: TextEditSession;
  draftText: string;
  readonly newNode: NewNodeOrigin | null;
}

interface NewNodeOrigin {
  readonly mapBeforeCreation: MindMap;
  readonly selectionBeforeCreation: NodeId | null;
}

export class MapEditor {
  private readonly renderer: MapRenderer;
  private readonly recognizer = new GestureRecognizer();
  private readonly host: MapHost;
  private readonly requestFrame: (callback: () => void) => void;
  private readonly camera: CameraController;
  private readonly detachInput: readonly (() => void)[];
  private readonly resizeObserver: ResizeObserver;
  private readonly keyboardAssist: KeyboardAssist;
  private displayMap: MindMap = EMPTY_MIND_MAP;
  private layout: LayoutResult | null = null;
  private sizes: ReadonlyMap<NodeId, Size> = new Map();
  private editing: EditingState | null = null;
  private selectedId: NodeId | null = null;
  private isFramePending = false;
  private isDestroyed = false;

  constructor({
    container,
    host,
    requestFrame,
    labels,
    visibleArea,
    doneLabel,
  }: MapEditorOptions) {
    const view = container.ownerDocument.defaultView;
    this.host = host;
    this.requestFrame = requestFrame ?? ((callback) => void view?.requestAnimationFrame(callback));
    this.renderer = new MapRenderer(container, { labels });
    this.camera = new CameraController(this.renderer, this.requestFrame);
    this.detachInput = this.attachInput(this.renderer.canvasElement);
    this.resizeObserver = new ResizeObserver(() => this.scheduleFrame());
    this.resizeObserver.observe(container);
    this.keyboardAssist = new KeyboardAssist({
      visibleArea: visibleArea ?? null,
      doc: container.ownerDocument,
      doneLabel: doneLabel ?? "Done",
      camera: this.camera,
      canvasElement: this.renderer.canvasElement,
      onDone: () => this.editing?.session.commit({ kind: "keyboard" }),
      onVisibleAreaChanged: () => this.onVisibleAreaChanged(),
    });
  }

  getMap(): MindMap {
    return this.editing?.newNode?.mapBeforeCreation ?? this.displayMap;
  }

  loadMap(map: MindMap): void {
    this.editing?.session.cancel();
    this.editing = null;
    this.displayMap = map;
    this.selectedId = null;
    this.layout = null;
    this.sizes = new Map();
    this.scheduleFrame();
  }

  isEditingText(): boolean {
    return this.editing !== null;
  }

  commitPendingEdit(): void {
    this.editing?.session.commit();
  }

  destroy(): void {
    this.commitPendingEdit();
    this.isDestroyed = true;
    this.camera.destroy();
    this.resizeObserver.disconnect();
    this.keyboardAssist.destroy();
    this.detachInput.forEach((detach) => detach());
    this.renderer.destroy();
  }

  private attachInput(canvas: HTMLElement): readonly (() => void)[] {
    const dispatch = (intents: readonly Intent[]): void =>
      intents.forEach((intent) => this.handleIntent(intent));
    return [
      attachPointerSource(canvas, (sample) => dispatch(this.recognizer.handle(sample))),
      attachWheelSource(canvas, (sample) => dispatch(this.recognizer.handleWheel(sample))),
      attachSpaceKeySource(canvas, (isHeld) => this.recognizer.setSpaceHeld(isHeld)),
      attachKeySource(canvas, () => (this.editing === null ? "navigate" : "editing"), (intent) =>
        this.handleIntent(intent),
      ),
      attachNativeGestureGuard(canvas),
    ];
  }

  private handleIntent(intent: Intent): void {
    if (isCameraIntent(intent)) {
      this.camera.handle(intent);
      return;
    }
    this.commitPendingEdit();
    switch (intent.type) {
      case "tap":
        return this.handleTap(intent.target);
      case "doubleTap":
        return this.handleDoubleTap(intent.target);
      case "addChild":
        return this.addChildToSelection();
      case "addSibling":
        return this.addSiblingToSelection();
      case "deleteSelection":
        return this.deleteSelection();
      case "editSelection":
        return this.editSelection();
      case "clearSelection":
        return this.select(null);
    }
  }

  private handleTap(target: HitTarget): void {
    switch (target.kind) {
      case "node":
        return this.select(target.nodeId);
      case "canvas":
        return this.select(null);
      case "add-child":
        return this.addChildTo(target.nodeId);
      case "add-sibling":
        return this.addSiblingTo(target.nodeId);
    }
  }

  private handleDoubleTap(target: HitTarget): void {
    this.handleTap(target);
    if (target.kind === "node") this.beginEditing(target.nodeId, null);
  }

  private editSelection(): void {
    if (this.selectedId !== null) this.beginEditing(this.selectedId, null);
  }

  private select(nodeId: NodeId | null): void {
    this.selectedId = nodeId;
    this.renderer.focusCanvas();
    this.scheduleFrame();
  }

  private addChildToSelection(): void {
    if (this.selectedId !== null) this.addChildTo(this.selectedId);
  }

  private addSiblingToSelection(): void {
    if (this.selectedId !== null) this.addSiblingTo(this.selectedId);
  }

  private addChildTo(parentId: NodeId): void {
    const side = this.layout === null ? "right" : chooseSideForNewBranch(this.layout, parentId);
    this.createNode((map, id) => addChild(map, { parentId, id, text: "", side }));
  }

  private addSiblingTo(anchorId: NodeId): void {
    const side: Side = this.layout?.sides.get(anchorId) ?? "right";
    const rootPosition = this.positionForNewRootBelow(anchorId);
    this.createNode((map, id) => addSibling(map, { anchorId, id, text: "", side, rootPosition }));
  }

  private positionForNewRootBelow(anchorId: NodeId): RootPosition | undefined {
    const rootSize = this.sizes.get(anchorId);
    const anchor = getNode(this.displayMap, anchorId);
    const isPinnedRoot = anchor.parentId === null && readRootPosition(anchor.state) !== undefined;
    if (!isPinnedRoot || this.layout === null || rootSize === undefined) return undefined;
    return positionBelowRootTree(this.layout, anchorId, rootSize) ?? undefined;
  }

  private createNode(command: (map: MindMap, id: NodeId) => MindMap): void {
    const mapBeforeCreation = this.mapWithSettledSides();
    const nodeId = generateNodeId(new Set(mapBeforeCreation.nodes.keys()));
    const origin = { mapBeforeCreation, selectionBeforeCreation: this.selectedId };
    this.displayMap = command(mapBeforeCreation, nodeId);
    this.selectedId = nodeId;
    this.renderFrame();
    this.beginEditing(nodeId, origin);
  }

  private deleteSelection(): void {
    const nodeId = this.selectedId;
    if (nodeId === null) return;
    this.selectedId = selectionAfterDelete(this.displayMap, nodeId);
    this.displayMap = deleteBranch(this.mapWithSettledSides(), { nodeId });
    this.host.onMapChanged();
    this.scheduleFrame();
  }

  private beginEditing(nodeId: NodeId, newNode: NewNodeOrigin | null): void {
    const nodeElement = this.renderer.getNodeElement(nodeId);
    if (nodeElement === undefined) return;
    const text = getNode(this.displayMap, nodeId).text;
    this.editing = {
      nodeId,
      draftText: text,
      newNode,
      session: beginTextEdit({
        nodeElement,
        initialText: text,
        onDraftChanged: (draft) => this.updateDraft(draft),
        onCommitted: (finalText, end) => this.finishEditing(nodeId, finalText, end),
      }),
    };
    this.scheduleFrame();
  }

  private updateDraft(draftText: string): void {
    if (this.editing === null) return;
    this.editing.draftText = draftText;
    this.scheduleFrame();
  }

  private finishEditing(nodeId: NodeId, finalText: string, end: TextEditEnd): void {
    const newNode = this.editing?.newNode ?? null;
    this.editing = null;
    if (newNode !== null && finalText === "") {
      this.discardNewNode(newNode);
    } else {
      this.commitText(nodeId, finalText);
    }
    if (this.shouldRefocusCanvas(end)) this.renderer.focusCanvas();
    this.scheduleFrame();
    this.host.onTextEditEnded();
  }

  private shouldRefocusCanvas(end: TextEditEnd): boolean {
    if (end.kind === "keyboard") return true;
    if (end.kind === "programmatic") return false;
    const target = end.focusTarget;
    return target instanceof Node && this.renderer.canvasElement.contains(target);
  }

  private discardNewNode({ mapBeforeCreation, selectionBeforeCreation }: NewNodeOrigin): void {
    this.displayMap = mapBeforeCreation;
    this.selectedId = selectionBeforeCreation;
  }

  private commitText(nodeId: NodeId, finalText: string): void {
    const settledMap = this.mapWithSettledSides();
    const updatedMap = setNodeText(settledMap, { nodeId, text: finalText });
    if (updatedMap === settledMap) return;
    this.displayMap = updatedMap;
    this.host.onMapChanged();
  }

  private mapWithSettledSides(): MindMap {
    return this.layout === null ? this.displayMap : withSidesResolved(this.displayMap, this.layout.sides);
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
    if (this.editing !== null) this.scheduleFrame();
  }

  private renderFrame(): void {
    this.renderer.syncContent(this.displayMap, this.currentRenderUi());
    this.sizes = this.renderer.measure();
    this.layout = computeLayout(this.displayMap, this.sizes);
    this.renderer.place(this.displayMap, this.layout);
    this.keyboardAssist.sync(this.editing?.nodeId ?? null, this.layout, this.sizes);
  }

  private currentRenderUi(): RenderUi {
    const editing = this.editing;
    return {
      editing: editing && { nodeId: editing.nodeId, draftText: editing.draftText },
      selectedId: this.selectedId,
    };
  }
}
