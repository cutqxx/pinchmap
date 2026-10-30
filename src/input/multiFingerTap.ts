import type { ScreenPoint } from "./pinch";

export type MultiFingerTapResult = "undo" | "redo" | null;

interface TapSession {
  readonly startTime: number;
  readonly origins: Map<number, ScreenPoint>;
  isValid: boolean;
}

const FINGERS_FOR_UNDO = 2;
const FINGERS_FOR_REDO = 3;

export class MultiFingerTap {
  private session: TapSession | null = null;

  constructor(
    private readonly movementThresholdPx: number,
    private readonly windowMs: number,
  ) {}

  startWith(pointerId: number, point: ScreenPoint, time: number): void {
    this.session = { startTime: time, origins: new Map([[pointerId, point]]), isValid: true };
  }

  addFinger(pointerId: number, point: ScreenPoint, time: number): void {
    const session = this.session;
    if (session === null) return;
    session.origins.set(pointerId, point);
    if (time - session.startTime > this.windowMs) session.isValid = false;
  }

  move(pointerId: number, point: ScreenPoint): void {
    const origin = this.session?.origins.get(pointerId);
    if (origin === undefined) return;
    if (Math.hypot(point.x - origin.x, point.y - origin.y) > this.movementThresholdPx) this.invalidate();
  }

  invalidate(): void {
    if (this.session !== null) this.session.isValid = false;
  }

  reset(): void {
    this.session = null;
  }

  finishWhenLastFingerLifts(time: number): MultiFingerTapResult {
    const session = this.session;
    this.session = null;
    if (session === null || !session.isValid || time - session.startTime > this.windowMs) return null;
    if (session.origins.size === FINGERS_FOR_UNDO) return "undo";
    return session.origins.size === FINGERS_FOR_REDO ? "redo" : null;
  }
}
