import { isOnlyBlankRoot, withOnlyBlankRoot, withoutBranch } from "../model";
import type { MindMap, NodeId } from "../model";

export interface DeleteBranchArgs {
  readonly nodeId: NodeId;
}

/**
 * Deleting the branch that holds every node of the map keeps its root, blanked: a map never
 * becomes empty by editing, so the saved file always keeps a list item of its own.
 */
export function deleteBranch(map: MindMap, { nodeId }: DeleteBranchArgs): MindMap {
  const remaining = withoutBranch(map, nodeId);
  if (remaining.nodes.size > 0) return remaining;
  return isOnlyBlankRoot(map) ? map : withOnlyBlankRoot(map, nodeId);
}
