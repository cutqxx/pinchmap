import type { Intent } from "../input";
import { INITIAL_CAMERA, panBy, pinchAt, zoomAt } from "../viewport";
import type { Camera } from "../viewport";

export interface CameraSurface {
  setCamera(camera: Camera): void;
  setGestureActive(isActive: boolean): void;
}

export type CameraIntent = Extract<
  Intent,
  { type: "pan" | "pinch" | "wheelPan" | "wheelZoom" | "gestureEnd" }
>;

const CAMERA_INTENT_TYPES: readonly Intent["type"][] = [
  "pan",
  "pinch",
  "wheelPan",
  "wheelZoom",
  "gestureEnd",
];

export function isCameraIntent(intent: Intent): intent is CameraIntent {
  return CAMERA_INTENT_TYPES.includes(intent.type);
}

export class CameraController {
  private camera: Camera = INITIAL_CAMERA;
  private isApplyPending = false;
  private isDisposed = false;

  constructor(
    private readonly surface: CameraSurface,
    private readonly requestFrame: (callback: () => void) => void,
  ) {
    surface.setCamera(this.camera);
  }

  getCamera(): Camera {
    return this.camera;
  }

  handle(intent: CameraIntent): void {
    switch (intent.type) {
      case "pan":
        this.beginGesture();
        return this.moveTo(panBy(this.camera, intent.dx, intent.dy));
      case "wheelPan":
        return this.moveTo(panBy(this.camera, intent.dx, intent.dy));
      case "pinch":
        this.beginGesture();
        return this.moveTo(this.pinchedCamera(intent));
      case "wheelZoom":
        return this.moveTo(zoomAt(this.camera, intent.center, intent.scaleDelta));
      case "gestureEnd":
        return this.surface.setGestureActive(false);
    }
  }

  panBy(dx: number, dy: number): void {
    this.moveTo(panBy(this.camera, dx, dy));
  }

  destroy(): void {
    this.isDisposed = true;
  }

  private pinchedCamera(pinch: Extract<CameraIntent, { type: "pinch" }>): Camera {
    const previousCenter = {
      x: pinch.center.x - pinch.centerDelta.x,
      y: pinch.center.y - pinch.centerDelta.y,
    };
    return pinchAt(this.camera, previousCenter, pinch.centerDelta, pinch.scaleDelta);
  }

  private beginGesture(): void {
    this.surface.setGestureActive(true);
  }

  private moveTo(camera: Camera): void {
    this.camera = camera;
    if (this.isApplyPending) return;
    this.isApplyPending = true;
    this.requestFrame(() => {
      this.isApplyPending = false;
      if (this.isDisposed) return;
      this.surface.setCamera(this.camera);
    });
  }
}
