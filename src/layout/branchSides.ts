import { getNode, readSide } from "../model";
import type { MapNode, MindMap, NodeId, Side } from "../model";
import { stackedHeight } from "./blockHeights";

export interface SideHeights {
  readonly left: number;
  readonly right: number;
}

export interface RootSides {
  readonly sides: ReadonlyMap<NodeId, Side>;
  readonly heights: SideHeights;
}

export function pickSideForNewBranch(heights: SideHeights | undefined): Side {
  return heights !== undefined && heights.right > heights.left ? "left" : "right";
}

export function resolveRootSides(
  map: MindMap,
  rootId: NodeId,
  blockHeights: ReadonlyMap<NodeId, number>,
  siblingGap: number,
): RootSides {
  const branches = getNode(map, rootId).childIds.map((id) => getNode(map, id));
  const stacks: Record<Side, NodeId[]> = { left: [], right: [] };
  const sides = new Map<NodeId, Side>();
  const assign = (branch: MapNode, side: Side): void => {
    sides.set(branch.id, side);
    stacks[side].push(branch.id);
  };
  const heightOf = (side: Side): number => stackedHeight(stacks[side], blockHeights, siblingGap);

  branches.filter((branch) => branch.isSidePending !== true).forEach((branch) => assign(branch, readSide(branch.state)));
  branches
    .filter((branch) => branch.isSidePending === true)
    .forEach((branch) => assign(branch, pickSideForNewBranch({ left: heightOf("left"), right: heightOf("right") })));
  return { sides, heights: { left: heightOf("left"), right: heightOf("right") } };
}
