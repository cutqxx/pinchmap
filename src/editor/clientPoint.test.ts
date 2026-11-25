import { describe, expect, it } from "vitest";
import { clientPointOf } from "./clientPoint";

function canvasAt(left: number, top: number): HTMLElement {
  return { getBoundingClientRect: () => ({ left, top }) } as unknown as HTMLElement;
}

describe("clientPointOf", () => {
  it("offsets a canvas point by the canvas position on the page", () => {
    expect(clientPointOf(canvasAt(40, 25), { x: 10, y: 5 })).toEqual({ x: 50, y: 30 });
  });

  it("leaves the point unchanged when the canvas sits at the page origin", () => {
    expect(clientPointOf(canvasAt(0, 0), { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
  });
});
