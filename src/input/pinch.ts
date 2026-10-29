export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface PinchState {
  readonly pointerIds: readonly [number, number];
  center: ScreenPoint;
  distance: number;
}

export interface PinchStep {
  readonly center: ScreenPoint;
  readonly centerDelta: ScreenPoint;
  readonly scaleDelta: number;
}

export function startPinch(touchPoints: ReadonlyMap<number, ScreenPoint>): PinchState | null {
  const pointerIds = [...touchPoints.keys()].slice(0, 2);
  const [firstId, secondId] = pointerIds;
  if (firstId === undefined || secondId === undefined) return null;
  const measured = measure(touchPoints, [firstId, secondId]);
  return measured && { pointerIds: [firstId, secondId], ...measured };
}

export function involvesPointer(state: PinchState, pointerId: number): boolean {
  return state.pointerIds.includes(pointerId);
}

export function advancePinch(
  state: PinchState,
  touchPoints: ReadonlyMap<number, ScreenPoint>,
): PinchStep | null {
  const measured = measure(touchPoints, state.pointerIds);
  if (measured === null) return null;
  const centerDelta = {
    x: measured.center.x - state.center.x,
    y: measured.center.y - state.center.y,
  };
  const scaleDelta = state.distance > 0 ? measured.distance / state.distance : 1;
  state.center = measured.center;
  state.distance = measured.distance;
  if (scaleDelta === 1 && centerDelta.x === 0 && centerDelta.y === 0) return null;
  return { center: measured.center, centerDelta, scaleDelta };
}

function measure(
  touchPoints: ReadonlyMap<number, ScreenPoint>,
  pointerIds: readonly [number, number],
): { center: ScreenPoint; distance: number } | null {
  const first = touchPoints.get(pointerIds[0]);
  const second = touchPoints.get(pointerIds[1]);
  if (first === undefined || second === undefined) return null;
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}
