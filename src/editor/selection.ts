import { getNode } from "../model";
import type { MindMap, NodeId } from "../model";

export function selectionAfterDelete(map: MindMap, deletedId: NodeId): NodeId | null {
  const { parentId } = getNode(map, deletedId);
  const siblingIds = parentId === null ? map.rootIds : getNode(map, parentId).childIds;
  const index = siblingIds.indexOf(deletedId);
  return siblingIds[index - 1] ?? siblingIds[index + 1] ?? parentId;
}

/** The selected nodes that no other selected node sits above: moving or deleting them covers the rest. */
export function topmostNodeIds(map: MindMap, ids: readonly NodeId[]): NodeId[] {
  const selected = new Set(ids);
  const hasSelectedAncestor = (id: NodeId): boolean => {
    const { parentId } = getNode(map, id);
    return parentId !== null && (selected.has(parentId) || hasSelectedAncestor(parentId));
  };
  return ids.filter((id) => !hasSelectedAncestor(id));
}

export interface SelectionDeps {
  focusCanvas(): void;
  scheduleFrame(): void;
}

/** The selected nodes in the order they were picked; the last one is the primary node. */
export class Selection {
  private selectedIds: readonly NodeId[] = [];

  constructor(private readonly deps: SelectionDeps) {}

  get current(): NodeId | null {
    return this.selectedIds[this.selectedIds.length - 1] ?? null;
  }

  get ids(): readonly NodeId[] {
    return this.selectedIds;
  }

  get isMultiple(): boolean {
    return this.selectedIds.length > 1;
  }

  /** The selected node when exactly one is selected: what single-node commands act on. */
  get sole(): NodeId | null {
    return this.isMultiple ? null : this.current;
  }

  select(nodeId: NodeId | null): void {
    this.set(nodeId);
    this.refresh();
  }

  selectMany(nodeIds: readonly NodeId[]): void {
    this.setMany(nodeIds);
    this.refresh();
  }

  toggle(nodeId: NodeId): void {
    const isSelected = this.selectedIds.includes(nodeId);
    this.setMany(isSelected ? this.selectedIds.filter((id) => id !== nodeId) : [...this.selectedIds, nodeId]);
    this.refresh();
  }

  set(nodeId: NodeId | null): void {
    this.selectedIds = nodeId === null ? [] : [nodeId];
  }

  setMany(nodeIds: readonly NodeId[]): void {
    this.selectedIds = [...new Set(nodeIds)];
  }

  private refresh(): void {
    this.deps.focusCanvas();
    this.deps.scheduleFrame();
  }
}
