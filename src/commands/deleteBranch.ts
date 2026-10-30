import { withoutBranch } from "../model";
import type { MindMap, NodeId } from "../model";

export interface DeleteBranchArgs {
  readonly nodeId: NodeId;
}

export function deleteBranch(map: MindMap, { nodeId }: DeleteBranchArgs): MindMap {
  return withoutBranch(map, nodeId);
}
