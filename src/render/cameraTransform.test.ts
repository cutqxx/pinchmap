// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MapRenderer } from "./mapRenderer";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new MapRenderer(container);
  const world = container.querySelector<HTMLElement>(".pinchmap-world");
  if (world === null) throw new Error("world element expected");
  return { renderer, world };
}

describe("MapRenderer camera", () => {
  it("applies the camera as a translate and scale transform of the world", () => {
    const { renderer, world } = setup();

    renderer.setCamera({ x: 12, y: -30, zoom: 2.5 });

    expect(world.style.transform).toBe("translate(12px, -30px) scale(2.5)");
  });

  it("replaces the previous transform on each update", () => {
    const { renderer, world } = setup();
    renderer.setCamera({ x: 1, y: 1, zoom: 1 });

    renderer.setCamera({ x: 5, y: 6, zoom: 0.5 });

    expect(world.style.transform).toBe("translate(5px, 6px) scale(0.5)");
  });

  it("hints will-change: transform while a gesture is active", () => {
    const { renderer, world } = setup();

    renderer.setGestureActive(true);

    expect(world.style.willChange).toBe("transform");
  });

  it("clears will-change when the gesture ends", () => {
    const { renderer, world } = setup();
    renderer.setGestureActive(true);

    renderer.setGestureActive(false);

    expect(world.style.willChange).toBe("");
  });

  it("makes the canvas focusable so Space can be received", () => {
    const { renderer } = setup();

    expect(renderer.canvasElement.tabIndex).toBe(0);
  });

  it("exposes the zoom as a CSS variable on the world so plus buttons can keep a constant size", () => {
    const { renderer, world } = setup();

    renderer.setCamera({ x: 0, y: 0, zoom: 2.5 });

    expect(world.style.getPropertyValue("--pinchmap-zoom")).toBe("2.5");
  });

  it("updates the zoom variable on each camera change", () => {
    const { renderer, world } = setup();
    renderer.setCamera({ x: 0, y: 0, zoom: 2 });

    renderer.setCamera({ x: 0, y: 0, zoom: 0.25 });

    expect(world.style.getPropertyValue("--pinchmap-zoom")).toBe("0.25");
  });
});
