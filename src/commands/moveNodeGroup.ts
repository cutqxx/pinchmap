import type { ManualPosition, MindMap, NodeId } from "../model";
import { pinAutoPlacedRoots, setNodePosition } from "./moveNode";

export interface MoveNodeGroupArgs {
  /** The new manual position of each moved node. */
  readonly positions: ReadonlyMap<NodeId, ManualPosition>;
  /** Where each root stands in the current layout; only used when a moved node is a root. */
  readonly rootPlacements: ReadonlyMap<NodeId, ManualPosition>;
}

/** Moves several nodes in one edit, so a single undo step puts them all back. */
export function moveNodeGroup(map: MindMap, { positions, rootPlacements }: MoveNodeGroupArgs): MindMap {
  const movesRoot = map.rootIds.some((rootId) => positions.has(rootId));
  const prepared = movesRoot ? pinAutoPlacedRoots(map, rootPlacements, new Set(positions.keys())) : map;
  return [...positions].reduce(
    (current, [nodeId, position]) => setNodePosition(current, { nodeId, position }),
    prepared,
  );
}
