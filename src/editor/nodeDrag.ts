import { setNodePosition } from "../commands";
import type { Intent } from "../input";
import type { LayoutResult, Point } from "../layout";
import type { ManualPosition, MindMap, NodeId } from "../model";
import type { MapEdit } from "./nodeEdits";

export interface NodeDragDeps {
  getMap(): MindMap;
  getLayout(): LayoutResult | null;
  getZoom(): number;
  replaceDisplayMap(map: MindMap): void;
  applyEdit(edit: MapEdit): void;
  selectNode(nodeId: NodeId): void;
  scheduleFrame(): void;
}

interface ActiveDrag {
  readonly nodeId: NodeId;
  readonly mapBeforeDrag: MindMap;
  readonly startPosition: ManualPosition;
  latestPosition: ManualPosition;
}

export class NodeDrag {
  private active: ActiveDrag | null = null;

  constructor(private readonly deps: NodeDragDeps) {}

  /** The map as it was before the running drag began, or null when nothing is being dragged. */
  committedMap(): MindMap | null {
    return this.active?.mapBeforeDrag ?? null;
  }

  start(nodeId: NodeId): void {
    const mapBeforeDrag = this.deps.getMap();
    const startPosition = this.manualPositionOfCurrentPlacement(mapBeforeDrag, nodeId);
    if (startPosition === null) return;
    this.deps.selectNode(nodeId);
    this.active = { nodeId, mapBeforeDrag, startPosition, latestPosition: startPosition };
  }

  move(screenDx: number, screenDy: number): void {
    const drag = this.active;
    if (drag === null) return;
    const zoom = this.deps.getZoom();
    drag.latestPosition = {
      x: drag.startPosition.x + screenDx / zoom,
      y: drag.startPosition.y + screenDy / zoom,
    };
    this.deps.replaceDisplayMap(this.mapWithLatestPosition(drag));
    this.deps.scheduleFrame();
  }

  end(): void {
    const drag = this.active;
    if (drag === null) return;
    this.cancel();
    if (isSamePosition(drag.latestPosition, drag.startPosition)) return;
    this.deps.applyEdit((map) => setNodePosition(map, { nodeId: drag.nodeId, position: drag.latestPosition }));
  }

  cancel(): void {
    const drag = this.active;
    if (drag === null) return;
    this.active = null;
    this.deps.replaceDisplayMap(drag.mapBeforeDrag);
    this.deps.scheduleFrame();
  }

  private mapWithLatestPosition(drag: ActiveDrag): MindMap {
    return setNodePosition(drag.mapBeforeDrag, { nodeId: drag.nodeId, position: drag.latestPosition });
  }

  private manualPositionOfCurrentPlacement(map: MindMap, nodeId: NodeId): ManualPosition | null {
    const node = map.nodes.get(nodeId);
    const positions = this.deps.getLayout()?.positions;
    const own = positions?.get(nodeId);
    if (node === undefined || own === undefined) return null;
    const parent = node.parentId === null ? ORIGIN : positions?.get(node.parentId);
    if (parent === undefined) return null;
    return { x: own.x - parent.x, y: own.y - parent.y };
  }
}

const ORIGIN: Point = { x: 0, y: 0 };

function isSamePosition(a: ManualPosition, b: ManualPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

const NODE_DRAG_INTENT_TYPES: ReadonlySet<Intent["type"]> = new Set([
  "nodeDragStart",
  "nodeDrag",
  "nodeDragEnd",
  "nodeDragCancel",
]);

export function isNodeDragIntent(intent: Intent): boolean {
  return NODE_DRAG_INTENT_TYPES.has(intent.type);
}
