import type { MindMap, NodeId } from "../model";

/** `firstNodeId` is the top node of the first branch the edit created, or null when it changed nothing. */
export interface BranchEditResult {
  readonly map: MindMap;
  readonly firstNodeId: NodeId | null;
}

export function unchangedMap(map: MindMap): BranchEditResult {
  return { map, firstNodeId: null };
}
