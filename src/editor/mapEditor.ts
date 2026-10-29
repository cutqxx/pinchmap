import { setNodeText } from "../commands";
import {
  GestureRecognizer,
  attachNativeGestureGuard,
  attachPointerSource,
  attachSpaceKeySource,
  attachWheelSource,
} from "../input";
import type { HitTarget, Intent } from "../input";
import { computeLayout } from "../layout";
import type { LayoutResult } from "../layout";
import { EMPTY_MIND_MAP, getNode, withSidesResolved } from "../model";
import type { MindMap, NodeId } from "../model";
import { MapRenderer } from "../render";
import type { RenderUi } from "../render";
import { CameraController, isCameraIntent } from "./cameraController";
import { beginTextEdit } from "./textEditSession";
import type { TextEditSession } from "./textEditSession";

export interface MapHost {
  onMapChanged(): void;
  onTextEditEnded(): void;
  notify(message: string): void;
}

export interface MapEditorOptions {
  readonly container: HTMLElement;
  readonly host: MapHost;
  readonly requestFrame?: (callback: () => void) => void;
}

interface EditingState {
  readonly nodeId: NodeId;
  readonly session: TextEditSession;
  draftText: string;
}

export class MapEditor {
  private readonly renderer: MapRenderer;
  private readonly recognizer = new GestureRecognizer();
  private readonly host: MapHost;
  private readonly requestFrame: (callback: () => void) => void;
  private readonly camera: CameraController;
  private readonly detachInput: readonly (() => void)[];
  private readonly resizeObserver: ResizeObserver;
  private map: MindMap = EMPTY_MIND_MAP;
  private layout: LayoutResult | null = null;
  private editing: EditingState | null = null;
  private isFramePending = false;
  private isDestroyed = false;

  constructor({ container, host, requestFrame }: MapEditorOptions) {
    const view = container.ownerDocument.defaultView;
    this.host = host;
    this.requestFrame = requestFrame ?? ((callback) => void view?.requestAnimationFrame(callback));
    this.renderer = new MapRenderer(container);
    this.camera = new CameraController(this.renderer, this.requestFrame);
    this.detachInput = this.attachInput(this.renderer.canvasElement);
    this.resizeObserver = new ResizeObserver(() => this.scheduleFrame());
    this.resizeObserver.observe(container);
  }

  getMap(): MindMap {
    return this.map;
  }

  loadMap(map: MindMap): void {
    this.editing?.session.cancel();
    this.editing = null;
    this.map = map;
    this.layout = null;
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
      attachNativeGestureGuard(canvas),
    ];
  }

  private handleIntent(intent: Intent): void {
    if (isCameraIntent(intent)) {
      this.camera.handle(intent);
      return;
    }
    this.commitPendingEdit();
    if (intent.type === "doubleTap") {
      this.startEditingIfNode(intent.target);
    }
  }

  private startEditingIfNode(target: HitTarget): void {
    if (target.kind !== "node") return;
    const nodeElement = this.renderer.getNodeElement(target.nodeId);
    if (nodeElement === undefined) return;
    const text = getNode(this.map, target.nodeId).text;
    const editing: EditingState = {
      nodeId: target.nodeId,
      draftText: text,
      session: beginTextEdit({
        nodeElement,
        initialText: text,
        onDraftChanged: (draft) => this.updateDraft(draft),
        onCommitted: (finalText) => this.finishEditing(target.nodeId, finalText),
      }),
    };
    this.editing = editing;
    this.scheduleFrame();
  }

  private updateDraft(draftText: string): void {
    if (this.editing === null) return;
    this.editing.draftText = draftText;
    this.scheduleFrame();
  }

  private finishEditing(nodeId: NodeId, finalText: string): void {
    this.editing = null;
    const settledMap = this.mapWithSettledSides();
    const updatedMap = setNodeText(settledMap, { nodeId, text: finalText });
    if (updatedMap !== settledMap) {
      this.map = updatedMap;
      this.host.onMapChanged();
    }
    this.scheduleFrame();
    this.host.onTextEditEnded();
  }

  private mapWithSettledSides(): MindMap {
    return this.layout === null ? this.map : withSidesResolved(this.map, this.layout.sides);
  }

  private scheduleFrame(): void {
    if (this.isFramePending || this.isDestroyed) return;
    this.isFramePending = true;
    this.requestFrame(() => {
      this.isFramePending = false;
      if (!this.isDestroyed) this.renderFrame();
    });
  }

  private renderFrame(): void {
    this.renderer.syncContent(this.map, this.currentRenderUi());
    const sizes = this.renderer.measure();
    this.layout = computeLayout(this.map, sizes);
    this.renderer.place(this.map, this.layout);
  }

  private currentRenderUi(): RenderUi {
    const editing = this.editing;
    return { editing: editing && { nodeId: editing.nodeId, draftText: editing.draftText } };
  }
}
