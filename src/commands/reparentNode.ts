import { getNode, withMovedBranch, withSide, withoutManualPosition } from "../model";
import type { MindMap, NodeId, Side } from "../model";
import { setNodeCollapsed } from "./collapse";

export interface ReparentNodeArgs {
  readonly nodeId: NodeId;
  readonly newParentId: NodeId;
  /** Side of the branch when the new parent is a root; ignored otherwise. */
  readonly side?: Side;
}

export function reparentNode(map: MindMap, { nodeId, newParentId, side = "right" }: ReparentNodeArgs): MindMap {
  const isFirstLevelBranch = getNode(map, newParentId).parentId === null;
  const state = withoutManualPosition(getNode(map, nodeId).state);
  const moved = withMovedBranch(map, nodeId, newParentId, withSide(state, isFirstLevelBranch ? side : "right"));
  // A collapsed target opens up: otherwise the dropped branch would vanish from view.
  return moved === map ? map : setNodeCollapsed(moved, { nodeId: newParentId, isCollapsed: false });
}

/** Drops x/y of nodes whose parent differs from the previous map: a stale offset or absolute position would misplace them. */
export function clearPositionsOfReparentedNodes(previous: MindMap, next: MindMap): MindMap {
  const nodes = new Map(next.nodes);
  const changedIds: NodeId[] = [];
  for (const node of next.nodes.values()) {
    const before = previous.nodes.get(node.id);
    if (before === undefined || before.parentId === node.parentId) continue;
    const state = withoutManualPosition(node.state);
    if (state === node.state) continue;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { state: _state, ...fields } = node;
    changedIds.push(node.id);
    nodes.set(node.id, state === undefined ? fields : { ...fields, state });
  }
  return changedIds.length === 0 ? next : { rootIds: next.rootIds, nodes };
}
