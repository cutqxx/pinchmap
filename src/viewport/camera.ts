export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export const INITIAL_CAMERA: Camera = { x: 40, y: 40, zoom: 1 };

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToMap(camera: Camera, screenPoint: Point): Point {
  return {
    x: (screenPoint.x - camera.x) / camera.zoom,
    y: (screenPoint.y - camera.y) / camera.zoom,
  };
}

export function mapToScreen(camera: Camera, mapPoint: Point): Point {
  return {
    x: mapPoint.x * camera.zoom + camera.x,
    y: mapPoint.y * camera.zoom + camera.y,
  };
}

export function panBy(camera: Camera, deltaX: number, deltaY: number): Camera {
  return { ...camera, x: camera.x + deltaX, y: camera.y + deltaY };
}

export function pinchAt(
  camera: Camera,
  previousCenter: Point,
  centerDelta: Point,
  scaleDelta: number,
): Camera {
  const zoomed = zoomAt(camera, previousCenter, scaleDelta);
  return panBy(zoomed, centerDelta.x, centerDelta.y);
}

export function zoomAt(camera: Camera, screenPoint: Point, factor: number): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const appliedRatio = zoom / camera.zoom;
  return {
    zoom,
    x: screenPoint.x - (screenPoint.x - camera.x) * appliedRatio,
    y: screenPoint.y - (screenPoint.y - camera.y) * appliedRatio,
  };
}
