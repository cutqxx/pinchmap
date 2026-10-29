import { describe, expect, it } from "vitest";
import type { Camera, Rect } from "../viewport";
import { computeRevealPan, REVEAL_MARGIN_PX } from "./revealEditedNode";
import type { RevealRequest } from "./revealEditedNode";

const CANVAS: Rect = { left: 5, top: 50, right: 805, bottom: 650 };
const EVERYWHERE: Rect = { left: 0, top: 0, right: 2000, bottom: 2000 };

// Node screen rect with this camera: left 75, top 150, right 175, bottom 170
const CAMERA: Camera = { x: 10, y: 20, zoom: 2 };

function request(overrides: Partial<RevealRequest> = {}): RevealRequest {
  return {
    camera: CAMERA,
    canvasRect: CANVAS,
    nodePosition: { x: 30, y: 40 },
    nodeSize: { width: 50, height: 10 },
    visibleArea: EVERYWHERE,
    reservedBottomPx: 0,
    ...overrides,
  };
}

describe("computeRevealPan", () => {
  it("does not pan when the node, placed by camera, layout, size and canvas offset, is visible", () => {
    expect(computeRevealPan(request())).toEqual({ x: 0, y: 0 });
  });

  it("pans by the amount the zoomed node sticks out below the visible area", () => {
    const delta = computeRevealPan(request({ visibleArea: { ...EVERYWHERE, bottom: 160 } }));

    expect(delta).toEqual({ x: 0, y: 160 - REVEAL_MARGIN_PX - 170 });
  });

  it("takes the canvas offset into account", () => {
    const delta = computeRevealPan(
      request({ canvasRect: { ...CANVAS, top: 80 }, visibleArea: { ...EVERYWHERE, bottom: 160 } }),
    );

    expect(delta.y).toBe(160 - REVEAL_MARGIN_PX - 200);
  });

  it("scales the node size by the zoom", () => {
    const delta = computeRevealPan(
      request({ camera: { ...CAMERA, zoom: 4 }, visibleArea: { ...EVERYWHERE, bottom: 300 } }),
    );

    // top 50 + 20 + 160 = 230, height 10 * 4 = 40, bottom 270 fits above 300 - 8
    expect(delta).toEqual({ x: 0, y: 0 });
    const tooLow = computeRevealPan(
      request({ camera: { ...CAMERA, zoom: 4 }, visibleArea: { ...EVERYWHERE, bottom: 260 } }),
    );
    expect(tooLow.y).toBe(260 - REVEAL_MARGIN_PX - 270);
  });

  it("subtracts the done-bar height from the bottom of the visible area", () => {
    const visibleArea = { ...EVERYWHERE, bottom: 200 };

    expect(computeRevealPan(request({ visibleArea, reservedBottomPx: 0 }))).toEqual({ x: 0, y: 0 });
    expect(computeRevealPan(request({ visibleArea, reservedBottomPx: 44 }))).toEqual({
      x: 0,
      y: 200 - 44 - REVEAL_MARGIN_PX - 170,
    });
  });

  it("intersects the visible area with the canvas, so the canvas edge limits the reveal", () => {
    const lowCamera = { ...CAMERA, y: 520 };

    const delta = computeRevealPan(request({ camera: lowCamera }));

    // node top 650, bottom 670; canvas bottom 650 although the visible area reaches 2000
    expect(delta).toEqual({ x: 0, y: CANVAS.bottom - REVEAL_MARGIN_PX - 670 });
  });

  it("pans horizontally when the node is left of the visible area", () => {
    const delta = computeRevealPan(request({ visibleArea: { ...EVERYWHERE, left: 100 } }));

    expect(delta).toEqual({ x: 100 + REVEAL_MARGIN_PX - 75, y: 0 });
  });

  it("does not pan again once the camera already includes the previous pan", () => {
    const visibleArea = { ...EVERYWHERE, bottom: 160 };
    const first = computeRevealPan(request({ visibleArea }));
    const pannedCamera = { ...CAMERA, x: CAMERA.x + first.x, y: CAMERA.y + first.y };

    const second = computeRevealPan(request({ camera: pannedCamera, visibleArea }));

    expect(first.y).not.toBe(0);
    expect(second).toEqual({ x: 0, y: 0 });
  });
});
