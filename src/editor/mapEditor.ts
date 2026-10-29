import { setNodeText } from "../commands";
import { GestureRecognizer, attachPointerSource } from "../input";
import type { HitTarget, Intent } from "../input";
import { computeLayout } from "../layout";
import { EMPTY_MIND_MAP, getNode } from "../model";
import type { MindMap, NodeId } from "../model";
import { MapRenderer } from "../render";
import type { RenderUi } from "../render";
import { beginTextEdit } from "./textEditSession";
import type { TextEditSession } from "./textEditSession";

export interface MapHost {
  onMapChanged(): void;
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
  private readonly detachPointerSource: () => void;
  private readonly resizeObserver: ResizeObserver;
  private map: MindMap = EMPTY_MIND_MAP;
  private editing: EditingState | null = null;
  private isFramePending = false;
  private isDestroyed = false;

  constructor({ container, host, requestFrame }: MapEditorOptions) {
    const view = container.ownerDocument.defaultView;
    this.host = host;
    this.requestFrame = requestFrame ?? ((callback) => void view?.requestAnimationFrame(callback));
    this.renderer = new MapRenderer(container);
    this.detachPointerSource = attachPointerSource(this.renderer.canvasElement, (sample) =>
      this.recognizer.handle(sample).forEach((intent) => this.handleIntent(intent)),
    );
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
    this.scheduleFrame();
  }

  commitPendingEdit(): void {
    this.editing?.session.commit();
  }

  destroy(): void {
    this.commitPendingEdit();
    this.isDestroyed = true;
    this.resizeObserver.disconnect();
    this.detachPointerSource();
    this.renderer.destroy();
  }

  private handleIntent(intent: Intent): void {
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
    const updatedMap = setNodeText(this.map, { nodeId, text: finalText });
    if (updatedMap !== this.map) {
      this.map = updatedMap;
      this.host.onMapChanged();
    }
    this.scheduleFrame();
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
    this.renderer.place(this.map, computeLayout(this.map, sizes));
  }

  private currentRenderUi(): RenderUi {
    const editing = this.editing;
    return { editing: editing && { nodeId: editing.nodeId, draftText: editing.draftText } };
  }
}
