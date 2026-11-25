import { describe, expect, it } from "vitest";
import { describeLinkTarget, placeBubble } from "./linkBubbleLayout";

describe("describeLinkTarget", () => {
  it("shows the note name of a wiki link", () => {
    expect(describeLinkTarget({ kind: "wiki", target: "Note", label: "Note" })).toBe("Note");
  });

  it("drops the heading from a wiki link", () => {
    expect(describeLinkTarget({ kind: "wiki", target: "Note#Section", label: "x" })).toBe("Note");
  });

  it("keeps the folder path of a wiki link", () => {
    expect(describeLinkTarget({ kind: "wiki", target: "dir/Note#H", label: "x" })).toBe("dir/Note");
  });

  it("falls back to the target for a heading-only link", () => {
    expect(describeLinkTarget({ kind: "wiki", target: "#Section", label: "x" })).toBe("#Section");
  });

  it("shows only the host of an external link", () => {
    expect(describeLinkTarget({ kind: "external", target: "https://example.com/a/b?q=1#h", label: "x" })).toBe("example.com");
  });

  it("returns the raw text when an external url cannot be parsed", () => {
    expect(describeLinkTarget({ kind: "external", target: "https://", label: "x" })).toBe("https://");
  });
});

describe("placeBubble", () => {
  const area = { left: 0, top: 0, right: 400, bottom: 600 };
  const bubble = { width: 100, height: 50 };

  it("centres the bubble above the node with a gap", () => {
    const node = { left: 150, top: 200, right: 250, bottom: 230 };
    expect(placeBubble(node, bubble, area)).toEqual({ x: 150, y: 142 });
  });

  it("flips below the node when there is no room above", () => {
    const node = { left: 150, top: 30, right: 250, bottom: 60 };
    expect(placeBubble(node, bubble, area)).toEqual({ x: 150, y: 68 });
  });

  it("stays above when it fits exactly within the margin", () => {
    const node = { left: 150, top: 66, right: 250, bottom: 96 };
    expect(placeBubble(node, bubble, area).y).toBe(8);
  });

  it("keeps an 8px margin from the left edge", () => {
    const node = { left: 0, top: 200, right: 20, bottom: 230 };
    expect(placeBubble(node, bubble, area).x).toBe(8);
  });

  it("keeps an 8px margin from the right edge", () => {
    const node = { left: 380, top: 200, right: 400, bottom: 230 };
    expect(placeBubble(node, bubble, area).x).toBe(292);
  });

  it("pulls the bubble up into the area when it fits neither above nor below", () => {
    const node = { left: 150, top: 560, right: 250, bottom: 598 };
    const tallBubble = { width: 100, height: 580 };
    expect(placeBubble(node, tallBubble, area).y).toBe(12);
  });

  it("pins a bubble taller than the area to the top margin", () => {
    const node = { left: 150, top: 300, right: 250, bottom: 330 };
    expect(placeBubble(node, { width: 100, height: 700 }, area).y).toBe(8);
  });

  it("clamps below-placement inside the bottom margin", () => {
    const node = { left: 150, top: 20, right: 250, bottom: 590 };
    expect(placeBubble(node, bubble, area).y).toBe(542);
  });

  it("respects an area that does not start at the origin", () => {
    const offsetArea = { left: 100, top: 100, right: 500, bottom: 700 };
    const node = { left: 100, top: 120, right: 120, bottom: 150 };
    expect(placeBubble(node, bubble, offsetArea)).toEqual({ x: 108, y: 158 });
  });
});
