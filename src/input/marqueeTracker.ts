import type { Intent, PointerSample } from "./gestureRecognizer";
import type { ScreenPoint } from "./pinch";

interface Marquee {
  readonly pointerId: number;
  readonly origin: ScreenPoint;
  hasStarted: boolean;
}

type MarqueeOutcome = "marqueeEnd" | "marqueeCancel";

const PRIMARY_BUTTON = 0;

export class MarqueeTracker {
  private marquee: Marquee | null = null;

  /** A mouse press on empty space is ready to draw a marquee once it travels past the threshold. */
  beginMousePress(sample: PointerSample, isSpaceHeld: boolean): void {
    const isMarqueePress =
      sample.kind === "mouse" && sample.button === PRIMARY_BUTTON && !isSpaceHeld && sample.target.kind === "canvas";
    this.marquee = isMarqueePress ? armed(sample) : null;
  }

  /** A held touch (after the long press) is ready to draw a marquee once it travels past the threshold. */
  armAfterLongPress(sample: PointerSample): void {
    this.marquee = armed(sample);
  }

  move(sample: PointerSample, thresholdPx: number): readonly Intent[] {
    const marquee = this.marquee;
    if (marquee === null || marquee.pointerId !== sample.pointerId) return [];
    const point = { x: sample.x, y: sample.y };
    if (marquee.hasStarted) return [{ type: "marqueeMove", point }];
    const distance = Math.hypot(point.x - marquee.origin.x, point.y - marquee.origin.y);
    if (distance <= thresholdPx) return [];
    marquee.hasStarted = true;
    return [{ type: "marqueeStart", origin: marquee.origin }, { type: "marqueeMove", point }];
  }

  finish(pointerId: number, outcome: MarqueeOutcome): readonly Intent[] {
    const marquee = this.marquee;
    if (marquee === null || marquee.pointerId !== pointerId) return [];
    this.marquee = null;
    return marquee.hasStarted ? [{ type: outcome }] : [];
  }

  cancelCurrent(): readonly Intent[] {
    return this.marquee === null ? [] : this.finish(this.marquee.pointerId, "marqueeCancel");
  }

  clear(): void {
    this.marquee = null;
  }
}

function armed(sample: PointerSample): Marquee {
  return { pointerId: sample.pointerId, origin: { x: sample.x, y: sample.y }, hasStarted: false };
}
