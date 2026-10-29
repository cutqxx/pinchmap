import { getNode, withNewChild, withSide } from "../model";
import type { MindMap, NodeId, Side } from "../model";

export interface AddChildArgs {
  readonly parentId: NodeId;
  readonly id: NodeId;
  readonly text: string;
  readonly side?: Side;
}

export function addChild(map: MindMap, { parentId, id, text, side = "right" }: AddChildArgs): MindMap {
  const isFirstLevelBranch = getNode(map, parentId).parentId === null;
  const state = isFirstLevelBranch ? withSide(undefined, side) : undefined;
  return withNewChild(map, { id, text, parentId, ...(state === undefined ? {} : { state }) });
}
