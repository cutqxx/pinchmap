import { getNode } from "../model";
import type { MindMap, NodeId } from "../model";

export function selectionAfterDelete(map: MindMap, deletedId: NodeId): NodeId | null {
  const { parentId } = getNode(map, deletedId);
  const siblingIds = parentId === null ? map.rootIds : getNode(map, parentId).childIds;
  const index = siblingIds.indexOf(deletedId);
  return siblingIds[index - 1] ?? siblingIds[index + 1] ?? parentId;
}

export interface SelectionDeps {
  focusCanvas(): void;
  scheduleFrame(): void;
}

export class Selection {
  private selectedId: NodeId | null = null;

  constructor(private readonly deps: SelectionDeps) {}

  get current(): NodeId | null {
    return this.selectedId;
  }

  select(nodeId: NodeId | null): void {
    this.selectedId = nodeId;
    this.deps.focusCanvas();
    this.deps.scheduleFrame();
  }

  set(nodeId: NodeId | null): void {
    this.selectedId = nodeId;
  }
}
