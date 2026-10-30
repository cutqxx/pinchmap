import { buildMindMap, withBranchesAttached } from "../model";
import type { BranchDraft, BranchPlacement, MindMap, NodeEntry, NodeId, NodeState, Side } from "../model";
import type { BranchEditResult } from "./branchEditResult";
import { unchangedMap } from "./branchEditResult";
import { setNodeCollapsed } from "./collapse";
import { createNodeIdSource } from "./newNodeIds";
import { stateForNewNode } from "./newBranchState";

export interface PasteBranchArgs {
  readonly drafts: readonly BranchDraft[];
  /** The node that receives the drafts as its last children; null pastes them as new roots. */
  readonly targetId: NodeId | null;
  readonly side?: Side;
}

interface DraftEntryContext {
  readonly nextId: () => NodeId;
  readonly topState: NodeState | undefined;
  readonly isFirstLevelSidePending: boolean;
}

export function pasteBranch(map: MindMap, { drafts, targetId, side = "right" }: PasteBranchArgs): BranchEditResult {
  if (drafts.length === 0) return unchangedMap(map);
  const context: DraftEntryContext = {
    nextId: createNodeIdSource(map),
    topState: targetId === null ? undefined : stateForNewNode(map, targetId, side),
    isFirstLevelSidePending: targetId === null,
  };
  const pasted = buildMindMap(draftsToEntries(drafts, null, 0, context));
  const attached = withBranchesAttached(map, pasted, placementFor(targetId));
  return { map: expandTarget(attached, targetId), firstNodeId: pasted.rootIds[0] ?? null };
}

function placementFor(targetId: NodeId | null): BranchPlacement {
  return targetId === null ? { kind: "newRoot" } : { kind: "lastChildOf", parentId: targetId };
}

function expandTarget(map: MindMap, targetId: NodeId | null): MindMap {
  if (targetId === null) return map;
  return setNodeCollapsed(map, { nodeId: targetId, isCollapsed: false });
}

function draftsToEntries(
  drafts: readonly BranchDraft[],
  parentId: NodeId | null,
  depth: number,
  context: DraftEntryContext,
): NodeEntry[] {
  return drafts.flatMap((draft) => {
    const id = context.nextId();
    const entry: NodeEntry = { id, text: draft.text, parentId, ...extraFieldsAtDepth(depth, context) };
    return [entry, ...draftsToEntries(draft.children, id, depth + 1, context)];
  });
}

function extraFieldsAtDepth(depth: number, context: DraftEntryContext): { state?: NodeState; isSidePending?: true } {
  if (depth === 0) return context.topState === undefined ? {} : { state: context.topState };
  return depth === 1 && context.isFirstLevelSidePending ? { isSidePending: true } : {};
}
