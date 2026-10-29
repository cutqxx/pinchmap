import { advancePinch, involvesPointer, startPinch } from "./pinch";
import type { PinchState, ScreenPoint } from "./pinch";
import { wheelToIntent } from "./wheelIntent";

export type PointerKind = "touch" | "mouse";

export type HitTarget =
  | { readonly kind: "node" | "add-child" | "add-sibling"; readonly nodeId: string }
  | { readonly kind: "canvas" };

export interface PointerSample {
  readonly phase: "down" | "move" | "up" | "cancel";
  readonly pointerId: number;
  readonly kind: PointerKind;
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly button: number;
  readonly target: HitTarget;
}

export interface WheelSample {
  readonly x: number;
  readonly y: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export type Intent =
  | { readonly type: "tap"; readonly target: HitTarget }
  | { readonly type: "doubleTap"; readonly target: HitTarget }
  | { readonly type: "pan"; readonly dx: number; readonly dy: number }
  | {
      readonly type: "pinch";
      readonly center: ScreenPoint;
      readonly centerDelta: ScreenPoint;
      readonly scaleDelta: number;
    }
  | { readonly type: "wheelPan"; readonly dx: number; readonly dy: number }
  | { readonly type: "wheelZoom"; readonly center: ScreenPoint; readonly scaleDelta: number }
  | { readonly type: "gestureEnd" }
  | { readonly type: "addChild" }
  | { readonly type: "addSibling" }
  | { readonly type: "deleteSelection" }
  | { readonly type: "editSelection" }
  | { readonly type: "clearSelection" };

export interface GestureConfig {
  readonly dragThresholdPx: number;
  readonly doubleTapIntervalMs: number;
  readonly doubleTapDistancePx: number;
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  dragThresholdPx: 8,
  doubleTapIntervalMs: 300,
  doubleTapDistancePx: 24,
};

const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;

interface TapCandidate {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly target: HitTarget;
  isValid: boolean;
}

interface PanDrag {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly mustPassThreshold: boolean;
  lastX: number;
  lastY: number;
  hasStarted: boolean;
}

interface CompletedTap {
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

export class GestureRecognizer {
  private candidate: TapCandidate | null = null;
  private lastTap: CompletedTap | null = null;
  private panDrag: PanDrag | null = null;
  private pinch: PinchState | null = null;
  private isSpaceHeld = false;
  private readonly activePointerIds = new Set<number>();
  private readonly touchPoints = new Map<number, ScreenPoint>();

  constructor(private readonly config: GestureConfig = DEFAULT_GESTURE_CONFIG) {}

  handle(sample: PointerSample): readonly Intent[] {
    switch (sample.phase) {
      case "down":
        return this.onDown(sample);
      case "move":
        return this.onMove(sample);
      case "up":
        return this.onUp(sample);
      case "cancel":
        return this.onCancel(sample);
    }
  }

  handleWheel(sample: WheelSample): readonly Intent[] {
    const intent = wheelToIntent(sample);
    return intent === null ? [] : [intent];
  }

  setSpaceHeld(isHeld: boolean): void {
    this.isSpaceHeld = isHeld;
  }

  private onDown(sample: PointerSample): readonly Intent[] {
    const staleIntents = this.discardStalePress(sample.pointerId);
    const hadOtherPointers = this.activePointerIds.size > 0;
    this.activePointerIds.add(sample.pointerId);
    if (sample.kind === "touch") this.touchPoints.set(sample.pointerId, sample);
    if (hadOtherPointers) return [...staleIntents, ...this.onAdditionalPointer()];
    const isPrimary = sample.kind === "touch" || sample.button === PRIMARY_BUTTON;
    this.candidate = isPrimary ? startCandidate(sample) : null;
    this.panDrag = this.startPanDrag(sample);
    return staleIntents;
  }

  private discardStalePress(pointerId: number): readonly Intent[] {
    if (!this.activePointerIds.has(pointerId)) return [];
    return this.cancelPointer(pointerId);
  }

  private onAdditionalPointer(): readonly Intent[] {
    this.invalidateCandidate();
    this.lastTap = null;
    const wasPanning = this.endPanDrag();
    if (this.pinch === null && this.touchPoints.size === 2) {
      this.pinch = startPinch(this.touchPoints);
    }
    return wasPanning && this.pinch === null ? [{ type: "gestureEnd" }] : [];
  }

  private startPanDrag(sample: PointerSample): PanDrag | null {
    const isTouchOnCanvas = sample.kind === "touch" && sample.target.kind === "canvas";
    const isMiddleDrag = sample.kind === "mouse" && sample.button === MIDDLE_BUTTON;
    const isSpaceDrag = sample.kind === "mouse" && sample.button === PRIMARY_BUTTON && this.isSpaceHeld;
    if (!isTouchOnCanvas && !isMiddleDrag && !isSpaceDrag) return null;
    return {
      pointerId: sample.pointerId,
      originX: sample.x,
      originY: sample.y,
      mustPassThreshold: isTouchOnCanvas,
      lastX: sample.x,
      lastY: sample.y,
      hasStarted: false,
    };
  }

  private endPanDrag(): boolean {
    const wasPanning = this.panDrag?.hasStarted === true;
    this.panDrag = null;
    return wasPanning;
  }

  private invalidateCandidate(): void {
    if (this.candidate !== null) {
      this.candidate.isValid = false;
    }
  }

  private onMove(sample: PointerSample): readonly Intent[] {
    if (sample.kind === "touch" && this.touchPoints.has(sample.pointerId)) {
      this.touchPoints.set(sample.pointerId, sample);
    }
    this.invalidateCandidateBeyondThreshold(sample);
    if (this.pinch !== null) return this.movePinch(sample);
    return this.movePanDrag(sample);
  }

  private invalidateCandidateBeyondThreshold(sample: PointerSample): void {
    const candidate = this.candidate;
    if (candidate === null || candidate.pointerId !== sample.pointerId) return;
    if (distance(candidate, sample) > this.config.dragThresholdPx) {
      candidate.isValid = false;
    }
  }

  private movePinch(sample: PointerSample): readonly Intent[] {
    if (this.pinch === null || !involvesPointer(this.pinch, sample.pointerId)) return [];
    const step = advancePinch(this.pinch, this.touchPoints);
    return step === null ? [] : [{ type: "pinch", ...step }];
  }

  private movePanDrag(sample: PointerSample): readonly Intent[] {
    const drag = this.panDrag;
    if (drag === null || drag.pointerId !== sample.pointerId) return [];
    if (this.isWaitingForThreshold(drag, sample)) return [];
    const intent: Intent = { type: "pan", dx: sample.x - drag.lastX, dy: sample.y - drag.lastY };
    drag.hasStarted = true;
    drag.lastX = sample.x;
    drag.lastY = sample.y;
    return [intent];
  }

  private isWaitingForThreshold(drag: PanDrag, sample: PointerSample): boolean {
    if (!drag.mustPassThreshold || drag.hasStarted) return false;
    return distance({ x: drag.originX, y: drag.originY }, sample) <= this.config.dragThresholdPx;
  }

  private onUp(sample: PointerSample): readonly Intent[] {
    this.forgetPointer(sample.pointerId);
    const gestureEnd = this.finishGestureOf(sample.pointerId);
    const candidate = this.candidate;
    if (candidate === null || candidate.pointerId !== sample.pointerId) return gestureEnd;
    this.candidate = null;
    if (!candidate.isValid) {
      this.lastTap = null;
      return gestureEnd;
    }
    return [...gestureEnd, this.completeTap(candidate, sample)];
  }

  private onCancel(sample: PointerSample): readonly Intent[] {
    if (!this.activePointerIds.has(sample.pointerId)) return [];
    return this.cancelPointer(sample.pointerId);
  }

  private cancelPointer(pointerId: number): readonly Intent[] {
    this.forgetPointer(pointerId);
    const gestureEnd = this.finishGestureOf(pointerId);
    this.candidate = null;
    this.lastTap = null;
    return gestureEnd;
  }

  private forgetPointer(pointerId: number): void {
    this.activePointerIds.delete(pointerId);
    this.touchPoints.delete(pointerId);
  }

  private finishGestureOf(pointerId: number): readonly Intent[] {
    let wasGesturing = false;
    if (this.pinch !== null && involvesPointer(this.pinch, pointerId)) {
      this.pinch = null;
      wasGesturing = true;
    }
    if (this.panDrag?.pointerId === pointerId) {
      wasGesturing = this.endPanDrag() || wasGesturing;
    }
    return wasGesturing ? [{ type: "gestureEnd" }] : [];
  }

  private completeTap(candidate: TapCandidate, sample: PointerSample): Intent {
    const previousTap = this.lastTap;
    if (previousTap !== null && this.isDoubleTap(previousTap, sample)) {
      this.lastTap = null;
      return { type: "doubleTap", target: candidate.target };
    }
    this.lastTap = { x: sample.x, y: sample.y, time: sample.time };
    return { type: "tap", target: candidate.target };
  }

  private isDoubleTap(previousTap: CompletedTap, sample: PointerSample): boolean {
    return (
      sample.time - previousTap.time <= this.config.doubleTapIntervalMs &&
      distance(previousTap, sample) <= this.config.doubleTapDistancePx
    );
  }
}

function startCandidate(sample: PointerSample): TapCandidate {
  return {
    pointerId: sample.pointerId,
    x: sample.x,
    y: sample.y,
    target: sample.target,
    isValid: true,
  };
}

function distance(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
