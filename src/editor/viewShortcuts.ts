import type { LayoutResult, Size } from "../layout";
import type { NodeId } from "../model";
import { MAX_ZOOM, MIN_ZOOM, fitToRect, zoomAt } from "../viewport";
import type { Camera } from "../viewport";
import { contentBounds } from "./contentBounds";
import type { CameraController } from "./cameraController";
import { computeRevealPan } from "./revealEditedNode";

export const ZOOM_STEP_FACTOR = 1.25;
export const FIT_MARGIN_PX = 40;

export interface ViewShortcutsDeps {
  readonly camera: CameraController;
  readonly canvasElement: HTMLElement;
  readonly getLayout: () => LayoutResult | null;
  readonly getSizes: () => ReadonlyMap<NodeId, Size>;
}

export class ViewShortcuts {
  constructor(private readonly deps: ViewShortcutsDeps) {}

  fitToScreen(): void {
    const layout = this.deps.getLayout();
    const bounds = layout === null ? null : contentBounds(layout, this.deps.getSizes());
    if (bounds === null) return;
    const { width, height } = this.canvasRect();
    this.deps.camera.setCamera(
      fitToRect(bounds, { width, height }, FIT_MARGIN_PX, { min: MIN_ZOOM, max: MAX_ZOOM }),
    );
  }

  zoomStep(direction: "in" | "out"): void {
    const { width, height } = this.canvasRect();
    const factor = direction === "in" ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
    const zoomed: Camera = zoomAt(this.deps.camera.getCamera(), { x: width / 2, y: height / 2 }, factor);
    this.deps.camera.setCamera(zoomed);
  }

  revealNode(nodeId: NodeId): void {
    const nodePosition = this.deps.getLayout()?.positions.get(nodeId);
    const nodeSize = this.deps.getSizes().get(nodeId);
    if (nodePosition === undefined || nodeSize === undefined) return;
    const canvasRect = this.canvasRect();
    const delta = computeRevealPan({
      camera: this.deps.camera.getCamera(),
      canvasRect,
      nodePosition,
      nodeSize,
      visibleArea: canvasRect,
      reservedBottomPx: 0,
    });
    if (delta.x !== 0 || delta.y !== 0) this.deps.camera.panBy(delta.x, delta.y);
  }

  private canvasRect(): DOMRect {
    return this.deps.canvasElement.getBoundingClientRect();
  }
}
