import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, clampZoom, mapToScreen, panBy, pinchAt, screenToMap, zoomAt } from "./camera";
import type { Camera } from "./camera";

const ZOOMS = [MIN_ZOOM, 0.25, 0.5, 1, 1.7, 3, MAX_ZOOM];
const OFFSETS = [-5000, -123.5, 0, 40, 987.25];
const POINTS = [
  { x: 0, y: 0 },
  { x: 13.5, y: -77 },
  { x: 800, y: 600 },
  { x: -250, y: 4000 },
];

function allCameras(): Camera[] {
  return ZOOMS.flatMap((zoom) => OFFSETS.flatMap((x) => OFFSETS.map((y) => ({ x, y, zoom }))));
}

describe("clampZoom", () => {
  it("keeps the lower bound at exactly 10 percent", () => {
    expect(MIN_ZOOM).toBe(0.1);
    expect(clampZoom(0.1)).toBe(0.1);
  });

  it("keeps the upper bound at exactly 400 percent", () => {
    expect(MAX_ZOOM).toBe(4);
    expect(clampZoom(4)).toBe(4);
  });

  it("raises zoom below 10 percent up to 10 percent", () => {
    expect(clampZoom(0.0999)).toBe(MIN_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
  });

  it("lowers zoom above 400 percent down to 400 percent", () => {
    expect(clampZoom(4.0001)).toBe(MAX_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
  });

  it("leaves zoom inside the range untouched", () => {
    expect(clampZoom(1.25)).toBe(1.25);
  });
});

describe("screen and map coordinate conversion", () => {
  it("returns the original screen point after screen to map to screen at any zoom and offset", () => {
    for (const camera of allCameras()) {
      for (const point of POINTS) {
        const back = mapToScreen(camera, screenToMap(camera, point));
        expect(back.x).toBeCloseTo(point.x, 6);
        expect(back.y).toBeCloseTo(point.y, 6);
      }
    }
  });

  it("returns the original map point after map to screen to map at any zoom and offset", () => {
    for (const camera of allCameras()) {
      for (const point of POINTS) {
        const back = screenToMap(camera, mapToScreen(camera, point));
        expect(back.x).toBeCloseTo(point.x, 6);
        expect(back.y).toBeCloseTo(point.y, 6);
      }
    }
  });

  it("places the map origin at the camera offset", () => {
    expect(mapToScreen({ x: 40, y: 20, zoom: 2 }, { x: 0, y: 0 })).toEqual({ x: 40, y: 20 });
  });

  it("scales map distances by zoom", () => {
    expect(mapToScreen({ x: 0, y: 0, zoom: 2 }, { x: 10, y: 5 })).toEqual({ x: 20, y: 10 });
  });
});

describe("panBy", () => {
  it("moves the camera by the given screen delta and keeps zoom", () => {
    expect(panBy({ x: 10, y: 20, zoom: 2 }, 5, -30)).toEqual({ x: 15, y: -10, zoom: 2 });
  });

  it("does not mutate the original camera", () => {
    const camera: Camera = { x: 1, y: 2, zoom: 1 };
    panBy(camera, 10, 10);
    expect(camera).toEqual({ x: 1, y: 2, zoom: 1 });
  });
});

describe("zoomAt", () => {
  it("multiplies zoom by the factor", () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 2).zoom).toBe(2);
  });

  it("keeps the map point under the anchor fixed", () => {
    const anchor = { x: 321, y: 123 };
    for (const camera of allCameras()) {
      const mapPointBefore = screenToMap(camera, anchor);
      const zoomed = zoomAt(camera, anchor, 1.3);
      const screenAfter = mapToScreen(zoomed, mapPointBefore);
      expect(screenAfter.x).toBeCloseTo(anchor.x, 6);
      expect(screenAfter.y).toBeCloseTo(anchor.y, 6);
    }
  });

  it("keeps the anchor fixed when zooming in is clamped at 400 percent", () => {
    const camera: Camera = { x: 50, y: -20, zoom: 3 };
    const anchor = { x: 200, y: 150 };
    const mapPointBefore = screenToMap(camera, anchor);

    const zoomed = zoomAt(camera, anchor, 10);

    expect(zoomed.zoom).toBe(MAX_ZOOM);
    const screenAfter = mapToScreen(zoomed, mapPointBefore);
    expect(screenAfter.x).toBeCloseTo(anchor.x, 6);
    expect(screenAfter.y).toBeCloseTo(anchor.y, 6);
  });

  it("keeps the anchor fixed when zooming out is clamped at 10 percent", () => {
    const camera: Camera = { x: 50, y: -20, zoom: 0.2 };
    const anchor = { x: 200, y: 150 };
    const mapPointBefore = screenToMap(camera, anchor);

    const zoomed = zoomAt(camera, anchor, 0.01);

    expect(zoomed.zoom).toBe(MIN_ZOOM);
    const screenAfter = mapToScreen(zoomed, mapPointBefore);
    expect(screenAfter.x).toBeCloseTo(anchor.x, 6);
    expect(screenAfter.y).toBeCloseTo(anchor.y, 6);
  });

  it("does not move the camera when already at the limit and zooming further", () => {
    const camera: Camera = { x: 50, y: -20, zoom: MAX_ZOOM };

    expect(zoomAt(camera, { x: 200, y: 150 }, 2)).toEqual(camera);
  });

  it("stays within limits over a long sequence of zoom steps", () => {
    let camera: Camera = { x: 0, y: 0, zoom: 1 };
    for (let i = 0; i < 100; i++) camera = zoomAt(camera, { x: 10, y: 10 }, 1.2);
    expect(camera.zoom).toBe(MAX_ZOOM);
    for (let i = 0; i < 200; i++) camera = zoomAt(camera, { x: 10, y: 10 }, 0.8);
    expect(camera.zoom).toBe(MIN_ZOOM);
  });
});

describe("pinchAt", () => {
  const camera: Camera = { x: 40, y: 40, zoom: 1 };

  function expectMapPointUnder(result: Camera, mapPoint: { x: number; y: number }, screen: { x: number; y: number }) {
    const onScreen = mapToScreen(result, mapPoint);
    expect(onScreen.x).toBeCloseTo(screen.x, 6);
    expect(onScreen.y).toBeCloseTo(screen.y, 6);
  }

  it("moves the map point under the previous center to previous center plus delta", () => {
    const previousCenter = { x: 150, y: 100 };
    const delta = { x: 50, y: -20 };
    const anchored = screenToMap(camera, previousCenter);

    const result = pinchAt(camera, previousCenter, delta, 2);

    expect(result.zoom).toBe(2);
    expectMapPointUnder(result, anchored, { x: 200, y: 80 });
  });

  it("keeps the anchored point under the moving center across chained steps", () => {
    let current = camera;
    let center = { x: 300, y: 200 };
    const anchored = screenToMap(current, center);

    for (const step of [
      { delta: { x: 5, y: -3 }, scale: 1.1 },
      { delta: { x: -12, y: 8 }, scale: 0.9 },
      { delta: { x: 0, y: 0 }, scale: 1.5 },
    ]) {
      current = pinchAt(current, center, step.delta, step.scale);
      center = { x: center.x + step.delta.x, y: center.y + step.delta.y };
    }

    expectMapPointUnder(current, anchored, center);
  });

  it.each([
    ["above the maximum", 50, MAX_ZOOM],
    ["below the minimum", 0.001, MIN_ZOOM],
  ])("keeps the anchored point under the center when the zoom is clamped %s", (_label, scale, expectedZoom) => {
    const previousCenter = { x: 250, y: 180 };
    const delta = { x: 10, y: 15 };
    const anchored = screenToMap(camera, previousCenter);

    const result = pinchAt(camera, previousCenter, delta, scale);

    expect(result.zoom).toBe(expectedZoom);
    expectMapPointUnder(result, anchored, { x: 260, y: 195 });
  });

  it("is a pure pan when the scale does not change", () => {
    expect(pinchAt(camera, { x: 120, y: 90 }, { x: 20, y: -10 }, 1)).toEqual({ x: 60, y: 30, zoom: 1 });
  });
});
