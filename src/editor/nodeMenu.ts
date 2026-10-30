import type { HitTarget, ScreenPoint } from "../input";
import type { MindMap, NodeId } from "../model";
import type { MenuItem } from "./emptySpaceMenu";

export interface NodeMenuLabels {
  readonly addChild: string;
  readonly addSibling: string;
  readonly delete: string;
}

export const DEFAULT_NODE_MENU_LABELS: NodeMenuLabels = {
  addChild: "Add child",
  addSibling: "Add sibling",
  delete: "Delete",
};

export interface NodeMenuActions {
  addChildTo(nodeId: NodeId): void;
  addSiblingTo(nodeId: NodeId): void;
  deleteNode(nodeId: NodeId): void;
}

export function nodeMenuItems(
  _map: MindMap,
  nodeId: NodeId,
  labels: NodeMenuLabels,
  actions: NodeMenuActions,
): readonly MenuItem[] {
  return [
    { label: labels.addChild, onSelect: () => actions.addChildTo(nodeId) },
    { label: labels.addSibling, onSelect: () => actions.addSiblingTo(nodeId) },
    { label: labels.delete, onSelect: () => actions.deleteNode(nodeId) },
  ];
}

export interface NodeMenuDeps {
  readonly canvasElement: HTMLElement;
  readonly labels: NodeMenuLabels;
  readonly actions: NodeMenuActions;
  getMap(): MindMap;
  showMenu(items: readonly MenuItem[], at: ScreenPoint): void;
  commitPendingEdit(): void;
  selectNode(nodeId: NodeId): void;
}

export class NodeMenu {
  constructor(private readonly deps: NodeMenuDeps) {}

  requestMenu(target: HitTarget, point: ScreenPoint): void {
    if (target.kind !== "node") return;
    this.deps.commitPendingEdit();
    if (!this.deps.getMap().nodes.has(target.nodeId)) return;
    this.deps.selectNode(target.nodeId);
    const items = nodeMenuItems(this.deps.getMap(), target.nodeId, this.deps.labels, this.deps.actions);
    this.deps.showMenu(items, this.clientPointOf(point));
  }

  private clientPointOf(point: ScreenPoint): ScreenPoint {
    const bounds = this.deps.canvasElement.getBoundingClientRect();
    return { x: point.x + bounds.left, y: point.y + bounds.top };
  }
}
