import type { JsonObject, NodeState } from "./nodeState";

export type Side = "left" | "right";

/** Absolute map coordinates for a root; offset from the parent's top-left for any other node. */
export interface ManualPosition {
  readonly x: number;
  readonly y: number;
}

export type RootPosition = ManualPosition;

const SIDE_KEY = "side";
const LEFT: Side = "left";
const POSITION_KEYS: readonly string[] = ["x", "y"];

export function readSide(state: NodeState | undefined): Side {
  return state?.[SIDE_KEY] === LEFT ? LEFT : "right";
}

export function withSide(state: NodeState | undefined, side: Side): NodeState | undefined {
  const otherFields = Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => key !== SIDE_KEY));
  const updated: JsonObject = side === LEFT ? { ...otherFields, [SIDE_KEY]: LEFT } : otherFields;
  return Object.keys(updated).length === 0 ? undefined : updated;
}

export function withManualPosition(state: NodeState | undefined, position: ManualPosition): NodeState {
  return { ...state, x: position.x, y: position.y };
}

export function withoutManualPosition(state: NodeState | undefined): NodeState | undefined {
  const otherFields = Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => !POSITION_KEYS.includes(key)));
  return Object.keys(otherFields).length === 0 ? undefined : otherFields;
}

export function readManualPosition(state: NodeState | undefined): ManualPosition | undefined {
  const x = state?.x;
  const y = state?.y;
  const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  return isCoordinate(x) && isCoordinate(y) ? { x, y } : undefined;
}

export const withRootPosition = withManualPosition;
export const readRootPosition = readManualPosition;
