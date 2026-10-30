import { beforeEach, describe, expect, it } from "vitest";
import type { LayoutResult, Rect, Size } from "../layout";
import { buildMindMap } from "../model";
import type { NodeId } from "../model";
import type { Camera } from "../viewport";
import { MarqueeSelection } from "./marqueeSelection";

const SIZE: Size = { width: 100, height: 40 };
const map = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
  { id: "b", text: "B", parentId: "r" },
]);
const layout: LayoutResult = {
  positions: new Map([["r", { x: 0, y: 0 }], ["a", { x: 200, y: 0 }], ["b", { x: 200, y: 100 }]]),
  sides: new Map(),
  sideHeights: new Map(),
};
const sizes = new Map<NodeId, Size>([["r", SIZE], ["a", SIZE], ["b", SIZE]]);

let camera: Camera;
let currentLayout: LayoutResult | null;
let shown: (Rect | null)[];
let selections: (readonly NodeId[])[];
let menuClosures: number;
let marquee: MarqueeSelection;

beforeEach(() => {
  camera = { x: 0, y: 0, zoom: 1 };
  currentLayout = layout;
  shown = [];
  selections = [];
  menuClosures = 0;
  marquee = new MarqueeSelection({
    getMap: () => map,
    getLayout: () => currentLayout,
    getSizes: () => sizes,
    getCamera: () => camera,
    showMarquee: (rect) => void shown.push(rect),
    selectNodes: (ids) => void selections.push(ids),
    closeMenu: () => void (menuClosures += 1),
  });
});

describe("MarqueeSelection", () => {
  it("closes the open menu when the marquee starts", () => {
    marquee.start({ x: 10, y: 10 });

    expect(menuClosures).toBe(1);
  });

  it("shows an empty rectangle at the origin on start", () => {
    marquee.start({ x: 10, y: 20 });

    expect(shown).toEqual([{ x: 10, y: 20, width: 0, height: 0 }]);
  });

  it("shows the rectangle between origin and the latest point in screen pixels", () => {
    marquee.start({ x: 50, y: 60 });
    marquee.move({ x: 20, y: 90 });

    expect(shown[shown.length - 1]).toEqual({ x: 20, y: 60, width: 30, height: 30 });
  });

  it("selects the nodes wholly inside the rectangle on end", () => {
    marquee.start({ x: -10, y: -10 });
    marquee.move({ x: 400, y: 200 });
    marquee.end();

    expect(selections).toEqual([["r", "a", "b"]]);
  });

  it("removes the rectangle on end", () => {
    marquee.start({ x: 0, y: 0 });
    marquee.end();

    expect(shown[shown.length - 1]).toBeNull();
  });

  it("selects only fully covered nodes", () => {
    marquee.start({ x: 190, y: -5 });
    marquee.move({ x: 310, y: 50 });
    marquee.end();

    expect(selections).toEqual([["a"]]);
  });

  it("clears the selection when the rectangle covers no node", () => {
    marquee.start({ x: 1000, y: 1000 });
    marquee.move({ x: 1100, y: 1100 });
    marquee.end();

    expect(selections).toEqual([[]]);
  });

  it("converts the screen rectangle through a panned and zoomed camera", () => {
    camera = { x: 100, y: 50, zoom: 2 };
    // Node a spans map (200,0)-(300,40) which is screen (500,50)-(700,130).
    marquee.start({ x: 499, y: 49 });
    marquee.move({ x: 701, y: 131 });
    marquee.end();

    expect(selections).toEqual([["a"]]);
  });

  it("does not select a node that a zoomed-in camera cuts off", () => {
    camera = { x: 100, y: 50, zoom: 2 };
    marquee.start({ x: 501, y: 49 });
    marquee.move({ x: 701, y: 131 });
    marquee.end();

    expect(selections).toEqual([[]]);
  });

  it("selects nothing and does not fail when no layout exists yet", () => {
    currentLayout = null;

    marquee.start({ x: 0, y: 0 });
    marquee.end();

    expect(selections).toEqual([[]]);
  });

  it("does not change the selection when cancelled", () => {
    marquee.start({ x: -10, y: -10 });
    marquee.move({ x: 400, y: 200 });
    marquee.cancel();

    expect(selections).toEqual([]);
    expect(shown[shown.length - 1]).toBeNull();
  });

  it("ignores move and end without a start", () => {
    marquee.move({ x: 5, y: 5 });
    marquee.end();

    expect(selections).toEqual([]);
  });

  it("ends only once: a second end does nothing", () => {
    marquee.start({ x: -10, y: -10 });
    marquee.move({ x: 400, y: 200 });
    marquee.end();
    marquee.end();

    expect(selections).toHaveLength(1);
  });
});
