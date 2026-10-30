import { withNewRoot, withRootPosition } from "../model";
import type { MindMap, NodeId, RootPosition } from "../model";

export interface AddRootArgs {
  readonly id: NodeId;
  readonly text: string;
  readonly position: RootPosition;
}

export function addRoot(map: MindMap, { id, text, position }: AddRootArgs): MindMap {
  return withNewRoot(map, { id, text, state: withRootPosition(undefined, position) });
}
