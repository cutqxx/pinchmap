import { getNode, readManualPosition, withManualPosition, withNodeState } from "../model";
import type { ManualPosition, MindMap, NodeId } from "../model";

export interface SetNodePositionArgs {
  readonly nodeId: NodeId;
  readonly position: ManualPosition;
}

export interface MoveRootArgs extends SetNodePositionArgs {
  /** Where each root stands in the current layout. */
  readonly rootPlacements: ReadonlyMap<NodeId, ManualPosition>;
}

export function setNodePosition(map: MindMap, { nodeId, position }: SetNodePositionArgs): MindMap {
  const state = getNode(map, nodeId).state;
  const current = readManualPosition(state);
  if (current?.x === position.x && current.y === position.y) return map;
  return withNodeState(map, nodeId, withManualPosition(state, position));
}

/**
 * Moves a root and pins every other root without a position at its current placement:
 * auto-placed roots are stacked below the positioned ones, so they would otherwise jump.
 */
export function moveRootKeepingOtherRoots(map: MindMap, { nodeId, position, rootPlacements }: MoveRootArgs): MindMap {
  const withOthersPinned = map.rootIds.reduce((current, rootId) => {
    const placement = rootPlacements.get(rootId);
    const isAutoPlaced = readManualPosition(getNode(current, rootId).state) === undefined;
    const shouldPin = rootId !== nodeId && placement !== undefined && isAutoPlaced;
    return shouldPin ? setNodePosition(current, { nodeId: rootId, position: placement }) : current;
  }, map);
  return setNodePosition(withOthersPinned, { nodeId, position });
}
