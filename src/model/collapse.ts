import { getNode } from "./mindMap";
import type { MapNode, MindMap } from "./mindMap";
import type { NodeId } from "./nodeId";
import type { JsonObject, NodeState } from "./nodeState";

const COLLAPSED_KEY = "collapsed";

export function readCollapsed(state: NodeState | undefined): boolean {
  return state?.[COLLAPSED_KEY] === true;
}

export function isNodeCollapsed(node: MapNode): boolean {
  return readCollapsed(node.state);
}

export function withCollapsed(state: NodeState | undefined, isCollapsed: boolean): NodeState | undefined {
  const otherFields = Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => key !== COLLAPSED_KEY));
  const updated: JsonObject = isCollapsed ? { ...otherFields, [COLLAPSED_KEY]: true } : otherFields;
  return Object.keys(updated).length === 0 ? undefined : updated;
}

export function countDescendants(map: MindMap, id: NodeId): number {
  return getNode(map, id).childIds.reduce((total, childId) => total + 1 + countDescendants(map, childId), 0);
}

/** Every node that sits below a collapsed node, at any depth. */
export function listHiddenNodeIds(map: MindMap): Set<NodeId> {
  const hidden = new Set<NodeId>();
  const hideBelow = (id: NodeId): void => {
    getNode(map, id).childIds.forEach((childId) => {
      hidden.add(childId);
      hideBelow(childId);
    });
  };
  const visit = (id: NodeId): void => {
    const node = getNode(map, id);
    if (isNodeCollapsed(node)) hideBelow(id);
    else node.childIds.forEach(visit);
  };
  map.rootIds.forEach(visit);
  return hidden;
}

/** The node itself when it is visible, otherwise the outermost collapsed ancestor that hides it. */
export function visibleStandIn(map: MindMap, id: NodeId): NodeId {
  return ancestorsOutermostFirst(map, id).find(isNodeCollapsed)?.id ?? id;
}

function ancestorsOutermostFirst(map: MindMap, id: NodeId): MapNode[] {
  const { parentId } = getNode(map, id);
  return parentId === null ? [] : [...ancestorsOutermostFirst(map, parentId), getNode(map, parentId)];
}
