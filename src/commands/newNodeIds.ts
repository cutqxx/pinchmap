import { generateNodeId } from "../model";
import type { MindMap, NodeId } from "../model";

/** Hands out IDs that differ from every node in `map` and from each other. */
export function createNodeIdSource(map: MindMap): () => NodeId {
  const takenIds = new Set<NodeId>(map.nodes.keys());
  return () => {
    const id = generateNodeId(takenIds);
    takenIds.add(id);
    return id;
  };
}
