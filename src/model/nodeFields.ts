import type { JsonObject, NodeState } from "./nodeState";

export type Side = "left" | "right";

export interface RootPosition {
  readonly x: number;
  readonly y: number;
}

const SIDE_KEY = "side";
const LEFT: Side = "left";

export function readSide(state: NodeState | undefined): Side {
  return state?.[SIDE_KEY] === LEFT ? LEFT : "right";
}

export function withSide(state: NodeState | undefined, side: Side): NodeState | undefined {
  const otherFields = Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => key !== SIDE_KEY));
  const updated: JsonObject = side === LEFT ? { ...otherFields, [SIDE_KEY]: LEFT } : otherFields;
  return Object.keys(updated).length === 0 ? undefined : updated;
}

export function withRootPosition(state: NodeState | undefined, position: RootPosition): NodeState {
  return { ...state, x: position.x, y: position.y };
}

export function readRootPosition(state: NodeState | undefined): RootPosition | undefined {
  const x = state?.x;
  const y = state?.y;
  const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  return isCoordinate(x) && isCoordinate(y) ? { x, y } : undefined;
}
