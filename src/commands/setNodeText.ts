import { getNode, withNodeText } from "../model";
import type { MindMap, NodeId } from "../model";

export interface SetNodeTextArgs {
  readonly nodeId: NodeId;
  readonly text: string;
}

export function setNodeText(map: MindMap, { nodeId, text }: SetNodeTextArgs): MindMap {
  if (getNode(map, nodeId).text === text) {
    return map;
  }
  return withNodeText(map, nodeId, text);
}
