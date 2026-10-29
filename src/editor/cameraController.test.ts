import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, INITIAL_CAMERA, mapToScreen, screenToMap } from "../viewport";
import type { Camera } from "../viewport";
import { CameraController, isCameraIntent } from "./cameraController";
import type { CameraSurface } from "./cameraController";

function lastOf<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

class FakeSurface implements CameraSurface {
  readonly cameras: Camera[] = [];
  readonly gestureActiveCalls: boolean[] = [];

  setCamera(camera: Camera): void {
    this.cameras.push(camera);
  }

  setGestureActive(isActive: boolean): void {
    this.gestureActiveCalls.push(isActive);
  }

  get lastCamera(): Camera | undefined {
    return this.cameras[this.cameras.length - 1];
  }
}

function setup() {
  const surface = new FakeSurface();
  const frames: Array<() => void> = [];
  const controller = new CameraController(surface, (callback) => frames.push(callback));
  const runFrame = (): void => {
    const pending = frames.splice(0);
    pending.forEach((callback) => callback());
  };
  return { surface, controller, frames, runFrame };
}

describe("CameraController frame batching", () => {
  it("shows the initial camera on construction", () => {
    const { surface } = setup();

    expect(surface.cameras).toEqual([INITIAL_CAMERA]);
  });

  it("does not touch the surface before the frame runs", () => {
    const { surface, controller } = setup();

    controller.handle({ type: "pan", dx: 10, dy: 0 });

    expect(surface.cameras).toHaveLength(1);
  });

  it("applies at most one camera per frame however many intents arrive", () => {
    const { surface, controller, frames, runFrame } = setup();

    controller.handle({ type: "pan", dx: 10, dy: 0 });
    controller.handle({ type: "pan", dx: 5, dy: 5 });
    controller.handle({ type: "wheelPan", dx: 1, dy: 1 });

    expect(frames).toHaveLength(1);
    runFrame();
    expect(surface.cameras).toHaveLength(2);
  });

  it("applies the accumulated result of all intents in the frame", () => {
    const { surface, controller, runFrame } = setup();

    controller.handle({ type: "pan", dx: 10, dy: 0 });
    controller.handle({ type: "pan", dx: 5, dy: 5 });
    runFrame();

    expect(surface.lastCamera).toEqual({ x: INITIAL_CAMERA.x + 15, y: INITIAL_CAMERA.y + 5, zoom: 1 });
  });

  it("schedules a new frame for intents that arrive after a frame ran", () => {
    const { surface, controller, runFrame } = setup();
    controller.handle({ type: "pan", dx: 10, dy: 0 });
    runFrame();

    controller.handle({ type: "pan", dx: 10, dy: 0 });
    runFrame();

    expect(surface.cameras).toHaveLength(3);
    expect(surface.lastCamera?.x).toBe(INITIAL_CAMERA.x + 20);
  });

  it("requests no frame when no camera intent arrived", () => {
    const { frames, controller } = setup();

    controller.handle({ type: "gestureEnd" });

    expect(frames).toHaveLength(0);
  });

  it("reports the latest camera immediately through getCamera before the frame", () => {
    const { controller } = setup();

    controller.handle({ type: "pan", dx: 7, dy: 0 });

    expect(controller.getCamera().x).toBe(INITIAL_CAMERA.x + 7);
  });
});

describe("CameraController destroy", () => {
  it("writes nothing to the surface from a frame scheduled before destroy", () => {
    const { surface, controller, runFrame } = setup();
    controller.handle({ type: "pan", dx: 10, dy: 0 });

    controller.destroy();
    runFrame();

    expect(surface.cameras).toEqual([INITIAL_CAMERA]);
  });
});

describe("CameraController gesture activity (will-change)", () => {
  it("marks the gesture active on the first pan", () => {
    const { surface, controller } = setup();

    controller.handle({ type: "pan", dx: 1, dy: 0 });

    expect(lastOf(surface.gestureActiveCalls)).toBe(true);
  });

  it("marks the gesture active on the first pinch", () => {
    const { surface, controller } = setup();

    controller.handle({ type: "pinch", center: { x: 100, y: 100 }, centerDelta: { x: 0, y: 0 }, scaleDelta: 1.1 });

    expect(lastOf(surface.gestureActiveCalls)).toBe(true);
  });

  it("clears the gesture active flag on gestureEnd", () => {
    const { surface, controller } = setup();
    controller.handle({ type: "pan", dx: 1, dy: 0 });

    controller.handle({ type: "gestureEnd" });

    expect(lastOf(surface.gestureActiveCalls)).toBe(false);
  });

  it("keeps the flag set across several pan steps until gestureEnd", () => {
    const { surface, controller } = setup();

    controller.handle({ type: "pan", dx: 1, dy: 0 });
    controller.handle({ type: "pan", dx: 1, dy: 0 });

    expect(surface.gestureActiveCalls.every((isActive) => isActive)).toBe(true);
  });

  it("does not mark wheel panning or wheel zooming as a gesture", () => {
    const { surface, controller } = setup();

    controller.handle({ type: "wheelPan", dx: 5, dy: 5 });
    controller.handle({ type: "wheelZoom", center: { x: 1, y: 1 }, scaleDelta: 1.2 });

    expect(surface.gestureActiveCalls).toEqual([]);
  });

  it("still applies the last camera after gestureEnd when the frame had not run yet", () => {
    const { surface, controller, runFrame } = setup();
    controller.handle({ type: "pan", dx: 30, dy: 0 });
    controller.handle({ type: "gestureEnd" });

    runFrame();

    expect(surface.lastCamera?.x).toBe(INITIAL_CAMERA.x + 30);
  });
});

describe("CameraController pinch", () => {
  it("keeps the map point between the fingers under the fingers", () => {
    const { controller } = setup();
    const before = controller.getCamera();
    const previousCenter = { x: 150, y: 100 };
    const mapPointBetweenFingers = screenToMap(before, previousCenter);

    controller.handle({
      type: "pinch",
      center: { x: 200, y: 100 },
      centerDelta: { x: 50, y: 0 },
      scaleDelta: 2,
    });

    const after = controller.getCamera();
    expect(after.zoom).toBe(2);
    const onScreen = mapToScreen(after, mapPointBetweenFingers);
    expect(onScreen.x).toBeCloseTo(200, 6);
    expect(onScreen.y).toBeCloseTo(100, 6);
  });

  it("zooms around the previous center then pans by the center delta", () => {
    const { controller } = setup();

    controller.handle({
      type: "pinch",
      center: { x: 200, y: 100 },
      centerDelta: { x: 50, y: 0 },
      scaleDelta: 2,
    });

    expect(controller.getCamera()).toEqual({ x: -20, y: -20, zoom: 2 });
  });

  it("behaves as a pure pan when the scale does not change", () => {
    const { controller } = setup();

    controller.handle({
      type: "pinch",
      center: { x: 120, y: 90 },
      centerDelta: { x: 20, y: -10 },
      scaleDelta: 1,
    });

    expect(controller.getCamera()).toEqual({ x: INITIAL_CAMERA.x + 20, y: INITIAL_CAMERA.y - 10, zoom: 1 });
  });

  it("keeps the map point under the fingers over a sequence of pinch steps", () => {
    const { controller } = setup();
    let center = { x: 300, y: 200 };
    const anchoredMapPoint = screenToMap(controller.getCamera(), center);

    for (const step of [
      { delta: { x: 5, y: -3 }, scale: 1.1 },
      { delta: { x: -12, y: 8 }, scale: 0.9 },
      { delta: { x: 0, y: 0 }, scale: 1.5 },
    ]) {
      center = { x: center.x + step.delta.x, y: center.y + step.delta.y };
      controller.handle({ type: "pinch", center, centerDelta: step.delta, scaleDelta: step.scale });
    }

    const onScreen = mapToScreen(controller.getCamera(), anchoredMapPoint);
    expect(onScreen.x).toBeCloseTo(center.x, 6);
    expect(onScreen.y).toBeCloseTo(center.y, 6);
  });

  it("clamps zoom when pinching beyond the limits", () => {
    const { controller } = setup();

    controller.handle({ type: "pinch", center: { x: 0, y: 0 }, centerDelta: { x: 0, y: 0 }, scaleDelta: 50 });
    expect(controller.getCamera().zoom).toBe(MAX_ZOOM);

    controller.handle({ type: "pinch", center: { x: 0, y: 0 }, centerDelta: { x: 0, y: 0 }, scaleDelta: 0.001 });
    expect(controller.getCamera().zoom).toBe(MIN_ZOOM);
  });

  it("keeps the map point under the fingers even when the zoom is clamped", () => {
    const { controller } = setup();
    controller.handle({ type: "pinch", center: { x: 0, y: 0 }, centerDelta: { x: 0, y: 0 }, scaleDelta: 50 });
    const center = { x: 250, y: 180 };
    const anchoredMapPoint = screenToMap(controller.getCamera(), center);

    controller.handle({ type: "pinch", center, centerDelta: { x: 0, y: 0 }, scaleDelta: 3 });

    const onScreen = mapToScreen(controller.getCamera(), anchoredMapPoint);
    expect(onScreen.x).toBeCloseTo(center.x, 6);
    expect(onScreen.y).toBeCloseTo(center.y, 6);
  });
});

describe("CameraController wheel", () => {
  it("zooms at the cursor so the map point under it stays put", () => {
    const { controller } = setup();
    const cursor = { x: 333, y: 222 };
    const mapPointUnderCursor = screenToMap(controller.getCamera(), cursor);

    controller.handle({ type: "wheelZoom", center: cursor, scaleDelta: 1.25 });

    expect(controller.getCamera().zoom).toBe(1.25);
    const onScreen = mapToScreen(controller.getCamera(), mapPointUnderCursor);
    expect(onScreen.x).toBeCloseTo(cursor.x, 6);
    expect(onScreen.y).toBeCloseTo(cursor.y, 6);
  });

  it("stays clamped at 400 percent under repeated wheel zoom in", () => {
    const { controller } = setup();

    for (let i = 0; i < 100; i++) controller.handle({ type: "wheelZoom", center: { x: 5, y: 5 }, scaleDelta: 1.5 });

    expect(controller.getCamera().zoom).toBe(MAX_ZOOM);
  });

  it("stays clamped at 10 percent under repeated wheel zoom out", () => {
    const { controller } = setup();

    for (let i = 0; i < 100; i++) controller.handle({ type: "wheelZoom", center: { x: 5, y: 5 }, scaleDelta: 0.6 });

    expect(controller.getCamera().zoom).toBe(MIN_ZOOM);
  });

  it("pans the camera by the wheel delta", () => {
    const { controller } = setup();

    controller.handle({ type: "wheelPan", dx: -30, dy: 12 });

    expect(controller.getCamera()).toEqual({ x: INITIAL_CAMERA.x - 30, y: INITIAL_CAMERA.y + 12, zoom: 1 });
  });
});

describe("isCameraIntent", () => {
  it("accepts camera intents", () => {
    expect(isCameraIntent({ type: "pan", dx: 0, dy: 0 })).toBe(true);
    expect(isCameraIntent({ type: "gestureEnd" })).toBe(true);
    expect(isCameraIntent({ type: "wheelZoom", center: { x: 0, y: 0 }, scaleDelta: 1 })).toBe(true);
  });

  it("rejects tap intents so they reach the editor", () => {
    expect(isCameraIntent({ type: "tap", target: { kind: "canvas" } })).toBe(false);
    expect(isCameraIntent({ type: "doubleTap", target: { kind: "canvas" } })).toBe(false);
  });
});
