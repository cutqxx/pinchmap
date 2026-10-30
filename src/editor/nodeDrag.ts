import { moveRootKeepingOtherRoots, reparentNode, setNodePosition } from "../commands";
import type { Intent, ScreenPoint } from "../input";
import { chooseSideForNewBranch, findDropTarget } from "../layout";
import type { LayoutResult, Point, Size } from "../layout";
import type { ManualPosition, MindMap, NodeId, Side } from "../model";
import { screenToMap } from "../viewport";
import type { Camera } from "../viewport";
import type { MapEdit } from "./nodeEdits";

export interface NodeDragDeps {
  getMap(): MindMap;
  getLayout(): LayoutResult | null;
  getSizes(): ReadonlyMap<NodeId, Size>;
  getCamera(): Camera;
  replaceDisplayMap(map: MindMap): void;
  applyEdit(edit: MapEdit): void;
  selectNode(nodeId: NodeId): void;
  scheduleFrame(): void;
}

interface ActiveDrag {
  readonly nodeId: NodeId;
  readonly mapBeforeDrag: MindMap;
  readonly startPosition: ManualPosition;
  /** Pre-drag placements of all roots when a root is dragged; null for any other node. */
  readonly rootPlacements: ReadonlyMap<NodeId, Point> | null;
  latestPosition: ManualPosition;
  dropTargetId: NodeId | null;
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
    const rootPlacements = this.rootPlacementsWhenDraggingRoot(mapBeforeDrag, nodeId);
    this.active = { nodeId, mapBeforeDrag, startPosition, rootPlacements, latestPosition: startPosition, dropTargetId: null };
  }

  dropTargetId(): NodeId | null {
    return this.active?.dropTargetId ?? null;
  }

  move(screenDx: number, screenDy: number, pointer: ScreenPoint): void {
    const drag = this.active;
    if (drag === null) return;
    const { zoom } = this.deps.getCamera();
    drag.latestPosition = {
      x: drag.startPosition.x + screenDx / zoom,
      y: drag.startPosition.y + screenDy / zoom,
    };
    drag.dropTargetId = this.dropTargetAt(drag, pointer);
    this.deps.replaceDisplayMap(this.mapWithLatestPosition(drag));
    this.deps.scheduleFrame();
  }

  end(): void {
    const drag = this.active;
    if (drag === null) return;
    this.cancel();
    this.deps.applyEdit(this.committedEdit(drag));
  }

  cancel(): void {
    const drag = this.active;
    if (drag === null) return;
    this.active = null;
    this.deps.replaceDisplayMap(drag.mapBeforeDrag);
    this.deps.scheduleFrame();
  }

  private committedEdit(drag: ActiveDrag): MapEdit {
    const { nodeId, dropTargetId } = drag;
    if (dropTargetId !== null) {
      const side = this.sideForBranchUnder(dropTargetId);
      return (map) => reparentNode(map, { nodeId, newParentId: dropTargetId, side });
    }
    if (isSamePosition(drag.latestPosition, drag.startPosition)) return (map) => map;
    return this.positionEdit(drag);
  }

  private positionEdit({ nodeId, latestPosition: position, rootPlacements }: ActiveDrag): MapEdit {
    if (rootPlacements === null) return (map) => setNodePosition(map, { nodeId, position });
    return (map) => moveRootKeepingOtherRoots(map, { nodeId, position, rootPlacements });
  }

  private rootPlacementsWhenDraggingRoot(map: MindMap, nodeId: NodeId): ReadonlyMap<NodeId, Point> | null {
    const positions = this.deps.getLayout()?.positions;
    if (positions === undefined || !map.rootIds.includes(nodeId)) return null;
    return new Map(map.rootIds.flatMap((rootId) => {
      const placement = positions.get(rootId);
      return placement === undefined ? [] : [[rootId, placement] as const];
    }));
  }

  private dropTargetAt(drag: ActiveDrag, pointer: ScreenPoint): NodeId | null {
    const layout = this.deps.getLayout();
    if (layout === null) return null;
    const worldPoint = screenToMap(this.deps.getCamera(), pointer);
    const target = findDropTarget(drag.mapBeforeDrag, layout, this.deps.getSizes(), worldPoint, drag.nodeId);
    const isCurrentParent = target === drag.mapBeforeDrag.nodes.get(drag.nodeId)?.parentId;
    return isCurrentParent ? null : target;
  }

  private sideForBranchUnder(targetId: NodeId): Side {
    const layout = this.deps.getLayout();
    return layout === null ? "right" : chooseSideForNewBranch(layout, targetId);
  }

  private mapWithLatestPosition(drag: ActiveDrag): MindMap {
    return this.positionEdit(drag)(drag.mapBeforeDrag);
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
