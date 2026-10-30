import { describe, expect, it } from "vitest";
import { mapToScreen } from "./camera";
import { fitToRect } from "./fitToRect";

const LIMITS = { min: 0.1, max: 4 };
const VIEWPORT = { width: 800, height: 600 };
const MARGIN = 40;

function rect(left: number, top: number, right: number, bottom: number) {
  return { left, top, right, bottom };
}

describe("fitToRect", () => {
  it("centers the content in the viewport", () => {
    const content = rect(100, 200, 500, 400);

    const camera = fitToRect(content, VIEWPORT, MARGIN, LIMITS);

    const center = mapToScreen(camera, { x: 300, y: 300 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });

  it("fits a width-bound content exactly inside the margin", () => {
    const camera = fitToRect(rect(0, 0, 1600, 200), VIEWPORT, MARGIN, LIMITS);

    expect(camera.zoom).toBeCloseTo((800 - 80) / 1600);
    expect(mapToScreen(camera, { x: 0, y: 0 }).x).toBeCloseTo(MARGIN);
    expect(mapToScreen(camera, { x: 1600, y: 0 }).x).toBeCloseTo(800 - MARGIN);
  });

  it("fits a height-bound content exactly inside the margin", () => {
    const camera = fitToRect(rect(0, 0, 200, 1200), VIEWPORT, MARGIN, LIMITS);

    expect(camera.zoom).toBeCloseTo((600 - 80) / 1200);
    expect(mapToScreen(camera, { x: 0, y: 0 }).y).toBeCloseTo(MARGIN);
    expect(mapToScreen(camera, { x: 0, y: 1200 }).y).toBeCloseTo(600 - MARGIN);
  });

  it("keeps every corner of a wide and a tall content inside the margin", () => {
    for (const content of [rect(-300, -50, 2000, 50), rect(-50, -900, 50, 700)]) {
      const camera = fitToRect(content, VIEWPORT, MARGIN, LIMITS);

      const topLeft = mapToScreen(camera, { x: content.left, y: content.top });
      const bottomRight = mapToScreen(camera, { x: content.right, y: content.bottom });
      expect(topLeft.x).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      expect(topLeft.y).toBeGreaterThanOrEqual(MARGIN - 1e-6);
      expect(bottomRight.x).toBeLessThanOrEqual(800 - MARGIN + 1e-6);
      expect(bottomRight.y).toBeLessThanOrEqual(600 - MARGIN + 1e-6);
    }
  });

  it("clamps tiny content at the maximum zoom and keeps it centered", () => {
    const camera = fitToRect(rect(10, 10, 20, 20), VIEWPORT, MARGIN, LIMITS);

    expect(camera.zoom).toBe(4);
    const center = mapToScreen(camera, { x: 15, y: 15 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });

  it("clamps huge content at the minimum zoom and keeps it centered", () => {
    const camera = fitToRect(rect(0, 0, 100000, 100000), VIEWPORT, MARGIN, LIMITS);

    expect(camera.zoom).toBe(0.1);
    const center = mapToScreen(camera, { x: 50000, y: 50000 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });

  it("uses the maximum zoom and centers the point for a zero-size rect", () => {
    const camera = fitToRect(rect(70, 90, 70, 90), VIEWPORT, MARGIN, LIMITS);

    expect(camera.zoom).toBe(4);
    const center = mapToScreen(camera, { x: 70, y: 90 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });

  it("fits by width alone for a rect with zero height", () => {
    const camera = fitToRect(rect(0, 5, 1000, 5), VIEWPORT, MARGIN, LIMITS);

    expect(camera.zoom).toBeCloseTo((800 - 80) / 1000);
  });

  it("falls back to the minimum zoom when the margin exceeds the viewport", () => {
    const camera = fitToRect(rect(0, 0, 400, 300), VIEWPORT, 500, LIMITS);

    expect(camera.zoom).toBe(0.1);
    const center = mapToScreen(camera, { x: 200, y: 150 });
    expect(center.x).toBeCloseTo(400);
    expect(center.y).toBeCloseTo(300);
  });

  it("returns finite numbers for every degenerate input", () => {
    for (const content of [rect(0, 0, 0, 0), rect(0, 0, 0, 100), rect(0, 0, 100, 0)]) {
      const camera = fitToRect(content, VIEWPORT, MARGIN, LIMITS);

      expect(Number.isFinite(camera.x)).toBe(true);
      expect(Number.isFinite(camera.y)).toBe(true);
      expect(Number.isFinite(camera.zoom)).toBe(true);
    }
  });
});
