import { withNewChild } from "../model";
import type { MindMap, NodeId, Side } from "../model";
import { stateForNewNode } from "./newBranchState";

export interface AddChildArgs {
  readonly parentId: NodeId;
  readonly id: NodeId;
  readonly text: string;
  readonly side?: Side;
}

export function addChild(map: MindMap, { parentId, id, text, side = "right" }: AddChildArgs): MindMap {
  const state = stateForNewNode(map, parentId, side);
  return withNewChild(map, { id, text, parentId, ...(state === undefined ? {} : { state }) });
}
