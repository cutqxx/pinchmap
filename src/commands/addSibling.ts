import { getNode, withNewSibling, withRootPosition } from "../model";
import type { MindMap, NodeId, NodeState, RootPosition, Side } from "../model";
import { stateForNewNode } from "./newBranchState";

export interface AddSiblingArgs {
  readonly anchorId: NodeId;
  readonly id: NodeId;
  readonly text: string;
  readonly side?: Side;
  readonly rootPosition?: RootPosition;
}

export function addSibling(
  map: MindMap,
  { anchorId, id, text, side = "right", rootPosition }: AddSiblingArgs,
): MindMap {
  const { parentId } = getNode(map, anchorId);
  const state = stateForSibling(map, parentId, side, rootPosition);
  return withNewSibling(map, anchorId, { id, text, ...(state === undefined ? {} : { state }) });
}

function stateForSibling(
  map: MindMap,
  parentId: NodeId | null,
  side: Side,
  rootPosition: RootPosition | undefined,
): NodeState | undefined {
  if (parentId === null && rootPosition !== undefined) return withRootPosition(undefined, rootPosition);
  return stateForNewNode(map, parentId, side);
}
