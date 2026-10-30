import { getNode, readManualPosition, withNodeState, withoutManualPosition } from "../model";
import type { MindMap, NodeId } from "../model";

export interface ResetNodeLayoutArgs {
  readonly nodeId: NodeId;
}

export function resetNodeLayout(map: MindMap, { nodeId }: ResetNodeLayoutArgs): MindMap {
  const state = getNode(map, nodeId).state;
  if (readManualPosition(state) === undefined) return map;
  return withNodeState(map, nodeId, withoutManualPosition(state));
}

export function resetMapLayout(map: MindMap): MindMap {
  const nonRootIds = [...map.nodes.values()].filter((node) => node.parentId !== null).map((node) => node.id);
  return nonRootIds.reduce((current, nodeId) => resetNodeLayout(current, { nodeId }), map);
}
