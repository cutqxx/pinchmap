import type { ScreenPoint } from "../input";
import { nodesInsideRect, rectBetween } from "../layout";
import type { LayoutResult, Rect, Size } from "../layout";
import type { MindMap, NodeId } from "../model";
import { screenToMap } from "../viewport";
import type { Camera } from "../viewport";

export interface MarqueeSelectionDeps {
  getLayout(): LayoutResult | null;
  getSizes(): ReadonlyMap<NodeId, Size>;
  getCamera(): Camera;
  getMap(): MindMap;
  showMarquee(rect: Rect | null): void;
  selectNodes(nodeIds: readonly NodeId[]): void;
  closeMenu(): void;
}

interface DrawnMarquee {
  readonly origin: ScreenPoint;
  latest: ScreenPoint;
}

export class MarqueeSelection {
  private marquee: DrawnMarquee | null = null;

  constructor(private readonly deps: MarqueeSelectionDeps) {}

  start(origin: ScreenPoint): void {
    this.deps.closeMenu();
    this.marquee = { origin, latest: origin };
    this.deps.showMarquee(rectBetween(origin, origin));
  }

  move(point: ScreenPoint): void {
    const marquee = this.marquee;
    if (marquee === null) return;
    marquee.latest = point;
    this.deps.showMarquee(rectBetween(marquee.origin, point));
  }

  end(): void {
    const marquee = this.marquee;
    this.cancel();
    if (marquee !== null) this.deps.selectNodes(this.nodesBetween(marquee));
  }

  cancel(): void {
    this.marquee = null;
    this.deps.showMarquee(null);
  }

  private nodesBetween({ origin, latest }: DrawnMarquee): NodeId[] {
    const layout = this.deps.getLayout();
    if (layout === null) return [];
    const camera = this.deps.getCamera();
    const rect = rectBetween(screenToMap(camera, origin), screenToMap(camera, latest));
    return nodesInsideRect(this.deps.getMap(), layout, this.deps.getSizes(), rect);
  }
}
