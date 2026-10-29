export type PointerKind = "touch" | "mouse";

export type HitTarget = { readonly kind: "node"; readonly nodeId: string } | { readonly kind: "canvas" };

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

export type Intent =
  | { readonly type: "tap"; readonly target: HitTarget }
  | { readonly type: "doubleTap"; readonly target: HitTarget };

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

interface TapCandidate {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly target: HitTarget;
  isValid: boolean;
}

interface CompletedTap {
  readonly x: number;
  readonly y: number;
  readonly time: number;
}

export class GestureRecognizer {
  private candidate: TapCandidate | null = null;
  private lastTap: CompletedTap | null = null;
  private readonly activePointerIds = new Set<number>();

  constructor(private readonly config: GestureConfig = DEFAULT_GESTURE_CONFIG) {}

  handle(sample: PointerSample): readonly Intent[] {
    switch (sample.phase) {
      case "down":
        this.onDown(sample);
        return [];
      case "move":
        this.onMove(sample);
        return [];
      case "up":
        return this.onUp(sample);
      case "cancel":
        this.onCancel(sample);
        return [];
    }
  }

  private onDown(sample: PointerSample): void {
    const hadOtherPointers = this.activePointerIds.size > 0;
    this.activePointerIds.add(sample.pointerId);
    if (hadOtherPointers) {
      this.invalidateCandidate();
      this.lastTap = null;
      return;
    }
    const isPrimary = sample.kind === "touch" || sample.button === PRIMARY_BUTTON;
    this.candidate = isPrimary ? startCandidate(sample) : null;
  }

  private invalidateCandidate(): void {
    if (this.candidate !== null) {
      this.candidate.isValid = false;
    }
  }

  private onMove(sample: PointerSample): void {
    const candidate = this.candidate;
    if (candidate === null || candidate.pointerId !== sample.pointerId) return;
    if (distance(candidate, sample) > this.config.dragThresholdPx) {
      candidate.isValid = false;
    }
  }

  private onUp(sample: PointerSample): readonly Intent[] {
    this.activePointerIds.delete(sample.pointerId);
    const candidate = this.candidate;
    if (candidate === null || candidate.pointerId !== sample.pointerId) return [];
    this.candidate = null;
    if (!candidate.isValid) {
      this.lastTap = null;
      return [];
    }
    return [this.completeTap(candidate, sample)];
  }

  private onCancel(sample: PointerSample): void {
    this.activePointerIds.delete(sample.pointerId);
    this.candidate = null;
    this.lastTap = null;
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
