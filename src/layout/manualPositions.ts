import { getNode, readManualPosition } from "../model";
import type { MindMap, NodeId } from "../model";
import type { Point } from "./geometry";

/**
 * Applies manual positions on top of the auto-layout, top-down. A pinned non-root sits at its
 * parent's final position plus its offset; any other node keeps its auto position shifted by
 * however far its parent moved. Roots keep their auto positions (their own x/y already drive them).
 */
export function applyManualPositions(
  map: MindMap,
  autoPositions: ReadonlyMap<NodeId, Point>,
): Map<NodeId, Point> {
  const finalPositions = new Map<NodeId, Point>();
  for (const rootId of map.rootIds) {
    placeSubtree({ map, autoPositions, finalPositions }, rootId, autoPositions.get(rootId));
  }
  return finalPositions;
}

interface ApplyContext {
  readonly map: MindMap;
  readonly autoPositions: ReadonlyMap<NodeId, Point>;
  readonly finalPositions: Map<NodeId, Point>;
}

function placeSubtree(context: ApplyContext, id: NodeId, final: Point | undefined): void {
  const auto = context.autoPositions.get(id);
  if (final === undefined || auto === undefined) return;
  context.finalPositions.set(id, final);
  const displacement = { x: final.x - auto.x, y: final.y - auto.y };
  for (const childId of getNode(context.map, id).childIds) {
    placeSubtree(context, childId, finalPositionOfChild(context, childId, final, displacement));
  }
}

function finalPositionOfChild(
  context: ApplyContext,
  childId: NodeId,
  parentFinal: Point,
  parentDisplacement: Point,
): Point | undefined {
  const offset = readManualPosition(getNode(context.map, childId).state);
  if (offset !== undefined) return { x: parentFinal.x + offset.x, y: parentFinal.y + offset.y };
  const auto = context.autoPositions.get(childId);
  return auto === undefined ? undefined : { x: auto.x + parentDisplacement.x, y: auto.y + parentDisplacement.y };
}
