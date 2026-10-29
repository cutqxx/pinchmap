import type { LayoutResult, Size } from "../layout";
import type { NodeId } from "../model";
import type { OverflowAlign, Rect } from "../viewport";
import type { CameraController } from "./cameraController";
import { DONE_BAR_HEIGHT_PX, createDoneBar, isCoarsePointer } from "./doneBar";
import type { DoneBar } from "./doneBar";
import { computeRevealPan } from "./revealEditedNode";
import type { VisibleAreaSource } from "./visibleArea";

export interface KeyboardAssistOptions {
  readonly visibleArea: VisibleAreaSource | null;
  readonly doc: Document;
  readonly doneLabel: string;
  readonly camera: CameraController;
  readonly canvasElement: HTMLElement;
  readonly onDone: () => void;
  readonly onVisibleAreaChanged: () => void;
}

interface RevealKey {
  readonly nodeId: NodeId;
  readonly width: number;
  readonly height: number;
  readonly area: Rect;
}

export class KeyboardAssist {
  private readonly visibleArea: VisibleAreaSource | null;
  private readonly camera: CameraController;
  private readonly canvasElement: HTMLElement;
  private readonly doneBar: DoneBar | null;
  private readonly unsubscribe: () => void;
  private lastRevealKey: RevealKey | null = null;

  constructor(options: KeyboardAssistOptions) {
    const { visibleArea, doc, doneLabel, onDone, onVisibleAreaChanged } = options;
    this.visibleArea = visibleArea;
    this.camera = options.camera;
    this.canvasElement = options.canvasElement;
    const isCoarse = isCoarsePointer(doc.defaultView);
    this.doneBar =
      visibleArea !== null && isCoarse ? createDoneBar(doc, doneLabel, onDone) : null;
    this.unsubscribe = visibleArea?.subscribe(onVisibleAreaChanged) ?? (() => {});
  }

  sync(
    editingNodeId: NodeId | null,
    layout: LayoutResult | null,
    sizes: ReadonlyMap<NodeId, Size>,
  ): void {
    if (this.visibleArea === null) return;
    if (editingNodeId === null || layout === null) return this.stopAssisting();
    const area = this.visibleArea.read();
    this.doneBar?.show(area);
    const nodePosition = layout.positions.get(editingNodeId);
    const nodeSize = sizes.get(editingNodeId);
    if (nodePosition === undefined || nodeSize === undefined) return;
    const key = { nodeId: editingNodeId, width: nodeSize.width, height: nodeSize.height, area };
    const previous = this.lastRevealKey;
    if (previous !== null && isSameRevealKey(previous, key)) return;
    this.lastRevealKey = key;
    this.reveal(nodePosition, nodeSize, area, overflowAlignFor(previous, key));
  }

  destroy(): void {
    this.unsubscribe();
    this.doneBar?.destroy();
  }

  private stopAssisting(): void {
    this.lastRevealKey = null;
    this.doneBar?.hide();
  }

  private reveal(
    nodePosition: { readonly x: number; readonly y: number },
    nodeSize: Size,
    area: Rect,
    overflowAlign: OverflowAlign,
  ): void {
    const delta = computeRevealPan({
      camera: this.camera.getCamera(),
      canvasRect: this.canvasElement.getBoundingClientRect(),
      nodePosition,
      nodeSize,
      visibleArea: area,
      reservedBottomPx: this.doneBar === null ? 0 : DONE_BAR_HEIGHT_PX,
      overflowAlign,
    });
    if (delta.x !== 0 || delta.y !== 0) this.camera.panBy(delta.x, delta.y);
  }
}

function isSameArea(a: Rect, b: Rect): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

function isSameRevealKey(a: RevealKey, b: RevealKey): boolean {
  return (
    a.nodeId === b.nodeId &&
    a.width === b.width &&
    a.height === b.height &&
    isSameArea(a.area, b.area)
  );
}

function overflowAlignFor(previous: RevealKey | null, next: RevealKey): OverflowAlign {
  const isSameNodeAndArea =
    previous !== null && previous.nodeId === next.nodeId && isSameArea(previous.area, next.area);
  return isSameNodeAndArea ? "end" : "start";
}
