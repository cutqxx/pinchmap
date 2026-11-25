import { computeLayout } from "../layout";
import type { LayoutResult, Size } from "../layout";
import type { MindMap, NodeId } from "../model";
import type { MapRenderer, RenderUi } from "../render";

export interface MapFrameDeps {
  readonly renderer: MapRenderer;
  readonly requestFrame: (callback: () => void) => void;
  getDisplayMap(): MindMap;
  currentUi(): RenderUi;
  onRendered(layout: LayoutResult, sizes: ReadonlyMap<NodeId, Size>): void;
  isDestroyed(): boolean;
}

/** One render pass (sync content, measure, lay out, place) and its batching to animation frames. */
export class MapFrame {
  private currentLayout: LayoutResult | null = null;
  private currentSizes: ReadonlyMap<NodeId, Size> = new Map();
  private isPending = false;

  constructor(private readonly deps: MapFrameDeps) {}

  /** The layout of the last rendered frame, or null before the first frame of a map. */
  get layout(): LayoutResult | null {
    return this.currentLayout;
  }

  get sizes(): ReadonlyMap<NodeId, Size> {
    return this.currentSizes;
  }

  schedule(): void {
    if (this.isPending || this.deps.isDestroyed()) return;
    this.isPending = true;
    this.deps.requestFrame(() => {
      this.isPending = false;
      if (!this.deps.isDestroyed()) this.render();
    });
  }

  render(): void {
    const displayMap = this.deps.getDisplayMap();
    this.deps.renderer.syncContent(displayMap, this.deps.currentUi());
    this.currentSizes = this.deps.renderer.measure();
    this.currentLayout = computeLayout(displayMap, this.currentSizes);
    this.deps.renderer.place(displayMap, this.currentLayout);
    this.deps.onRendered(this.currentLayout, this.currentSizes);
  }

  /** Forgets the layout and sizes of the previous map. */
  reset(): void {
    this.currentLayout = null;
    this.currentSizes = new Map();
  }
}
