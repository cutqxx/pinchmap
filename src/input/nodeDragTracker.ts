import type { Intent, PointerSample } from "./gestureRecognizer";

interface NodeDrag {
  readonly pointerId: number;
  readonly nodeId: string;
  readonly originX: number;
  readonly originY: number;
  hasStarted: boolean;
}

type NodeDragOutcome = "nodeDragEnd" | "nodeDragCancel";

const PRIMARY_BUTTON = 0;

export class NodeDragTracker {
  private drag: NodeDrag | null = null;

  begin(sample: PointerSample, isSpaceHeld: boolean): void {
    this.drag = isDraggableNodePress(sample, isSpaceHeld)
      ? { pointerId: sample.pointerId, nodeId: sample.target.nodeId, originX: sample.x, originY: sample.y, hasStarted: false }
      : null;
  }

  move(sample: PointerSample, thresholdPx: number): readonly Intent[] {
    const drag = this.drag;
    if (drag === null || drag.pointerId !== sample.pointerId) return [];
    const dx = sample.x - drag.originX;
    const dy = sample.y - drag.originY;
    if (drag.hasStarted) return [{ type: "nodeDrag", dx, dy }];
    if (Math.hypot(dx, dy) <= thresholdPx) return [];
    drag.hasStarted = true;
    return [{ type: "nodeDragStart", nodeId: drag.nodeId }, { type: "nodeDrag", dx, dy }];
  }

  finish(pointerId: number, outcome: NodeDragOutcome): readonly Intent[] {
    const drag = this.drag;
    if (drag === null || drag.pointerId !== pointerId) return [];
    this.drag = null;
    return drag.hasStarted ? [{ type: outcome }] : [];
  }

  cancelCurrent(): readonly Intent[] {
    return this.drag === null ? [] : this.finish(this.drag.pointerId, "nodeDragCancel");
  }

  clear(): void {
    this.drag = null;
  }
}

function isDraggableNodePress(
  sample: PointerSample,
  isSpaceHeld: boolean,
): sample is PointerSample & { readonly target: { readonly kind: "node"; readonly nodeId: string } } {
  if (sample.target.kind !== "node") return false;
  return sample.kind === "touch" || (sample.button === PRIMARY_BUTTON && !isSpaceHeld);
}
