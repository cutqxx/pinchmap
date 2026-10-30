import { buildMindMap, getNode, withBranchesAttached, withoutManualPosition } from "../model";
import type { MindMap, NodeEntry, NodeId } from "../model";
import type { BranchEditResult } from "./branchEditResult";
import { createNodeIdSource } from "./newNodeIds";

export interface DuplicateBranchArgs {
  readonly nodeId: NodeId;
}

/** The copy sits right after the original, keeps colours, collapsed state and sides, and drops manual positions. */
export function duplicateBranch(map: MindMap, { nodeId }: DuplicateBranchArgs): BranchEditResult {
  const copy = buildMindMap(cloneBranch(map, nodeId, null, createNodeIdSource(map)));
  return {
    map: withBranchesAttached(map, copy, { kind: "after", anchorId: nodeId }),
    firstNodeId: copy.rootIds[0] ?? null,
  };
}

function cloneBranch(map: MindMap, nodeId: NodeId, parentId: NodeId | null, nextId: () => NodeId): NodeEntry[] {
  const node = getNode(map, nodeId);
  const copyId = nextId();
  const state = withoutManualPosition(node.state);
  const entry: NodeEntry = { id: copyId, text: node.text, parentId, ...(state === undefined ? {} : { state }) };
  return [entry, ...node.childIds.flatMap((childId) => cloneBranch(map, childId, copyId, nextId))];
}
