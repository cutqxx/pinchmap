import type { NodeId } from "./nodeId";
import { withSide } from "./nodeFields";
import type { Side } from "./nodeFields";
import type { NodeState } from "./nodeState";

export interface MapNode {
  readonly id: NodeId;
  readonly text: string;
  readonly parentId: NodeId | null;
  readonly childIds: readonly NodeId[];
  readonly state?: NodeState;
  readonly isSidePending?: boolean;
}

export interface MindMap {
  readonly rootIds: readonly NodeId[];
  readonly nodes: ReadonlyMap<NodeId, MapNode>;
}

export interface NodeEntry {
  readonly id: NodeId;
  readonly text: string;
  readonly parentId: NodeId | null;
  readonly state?: NodeState;
  readonly isSidePending?: boolean;
}

export interface PlacedNode {
  readonly node: MapNode;
  readonly depth: number;
}

export const EMPTY_MIND_MAP: MindMap = { rootIds: [], nodes: new Map() };

export function buildMindMap(entries: readonly NodeEntry[]): MindMap {
  const childIdsByParent = groupChildIdsByParent(entries);
  const nodes = new Map<NodeId, MapNode>();
  for (const { id, text, parentId, state, isSidePending } of entries) {
    const node = { id, text, parentId, childIds: childIdsByParent.get(id) ?? [] };
    nodes.set(id, {
      ...node,
      ...(state === undefined ? {} : { state }),
      ...(isSidePending === true ? { isSidePending } : {}),
    });
  }
  const rootIds = entries.filter((entry) => entry.parentId === null).map((entry) => entry.id);
  return { rootIds, nodes };
}

export function getNode(map: MindMap, id: NodeId): MapNode {
  const node = map.nodes.get(id);
  if (node === undefined) {
    throw new Error(`Node not found: ${id}`);
  }
  return node;
}

export function withNodeText(map: MindMap, id: NodeId, text: string): MindMap {
  const node = getNode(map, id);
  const nodes = new Map(map.nodes);
  nodes.set(id, { ...node, text });
  return { rootIds: map.rootIds, nodes };
}

export function withSidesResolved(map: MindMap, sides: ReadonlyMap<NodeId, Side>): MindMap {
  const pendingNodes = [...map.nodes.values()].filter((node) => node.isSidePending === true);
  if (pendingNodes.length === 0) return map;
  const nodes = new Map(map.nodes);
  for (const node of pendingNodes) {
    nodes.set(node.id, withSideSettled(node, sides.get(node.id) ?? "right"));
  }
  return { rootIds: map.rootIds, nodes };
}

export function withNewChild(map: MindMap, child: NodeEntry & { readonly parentId: NodeId }): MindMap {
  const parent = getNode(map, child.parentId);
  const nodes = new Map(map.nodes);
  nodes.set(parent.id, { ...parent, childIds: [...parent.childIds, child.id] });
  const { state, ...fields } = child;
  nodes.set(child.id, { ...fields, childIds: [], ...(state === undefined ? {} : { state }) });
  return { rootIds: map.rootIds, nodes };
}

export function listNodesInDocumentOrder(map: MindMap): PlacedNode[] {
  const placed: PlacedNode[] = [];
  const visit = (id: NodeId, depth: number): void => {
    const node = getNode(map, id);
    placed.push({ node, depth });
    node.childIds.forEach((childId) => visit(childId, depth + 1));
  };
  map.rootIds.forEach((rootId) => visit(rootId, 0));
  return placed;
}

function withSideSettled(node: MapNode, side: Side): MapNode {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isSidePending: _isSidePending, state: previousState, ...fields } = node;
  const state = withSide(previousState, side);
  return state === undefined ? fields : { ...fields, state };
}

function groupChildIdsByParent(entries: readonly NodeEntry[]): Map<NodeId, NodeId[]> {
  const childIdsByParent = new Map<NodeId, NodeId[]>();
  for (const { id, parentId } of entries) {
    if (parentId === null) continue;
    const siblings = childIdsByParent.get(parentId) ?? [];
    siblings.push(id);
    childIdsByParent.set(parentId, siblings);
  }
  return childIdsByParent;
}
