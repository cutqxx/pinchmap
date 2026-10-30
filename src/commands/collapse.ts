import { getNode, isNodeCollapsed, withCollapsed, withNodeState } from "../model";
import type { MindMap, NodeId } from "../model";

export interface SetNodeCollapsedArgs {
  readonly nodeId: NodeId;
  readonly isCollapsed: boolean;
}

export interface ToggleNodeCollapsedArgs {
  readonly nodeId: NodeId;
}

export function setNodeCollapsed(map: MindMap, { nodeId, isCollapsed }: SetNodeCollapsedArgs): MindMap {
  const node = getNode(map, nodeId);
  if (isNodeCollapsed(node) === isCollapsed) return map;
  return withNodeState(map, nodeId, withCollapsed(node.state, isCollapsed));
}

/** A node without children has nothing to fold, so toggling it leaves the map untouched. */
export function toggleNodeCollapsed(map: MindMap, { nodeId }: ToggleNodeCollapsedArgs): MindMap {
  const node = getNode(map, nodeId);
  if (node.childIds.length === 0) return map;
  return setNodeCollapsed(map, { nodeId, isCollapsed: !isNodeCollapsed(node) });
}
