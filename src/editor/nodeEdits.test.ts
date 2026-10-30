import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap } from "../model";
import { NodeEdits } from "./nodeEdits";
import { Selection } from "./selection";

const MAP = buildMindMap([
  { id: "r1", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r1" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r1" },
  { id: "c", text: "C", parentId: "r1" },
]);

let changes: number;
let frames: number;
let selection: Selection;
let edits: NodeEdits;

beforeEach(() => {
  changes = 0;
  frames = 0;
  selection = new Selection({ focusCanvas: () => undefined, scheduleFrame: () => undefined });
  edits = new NodeEdits({
    selection,
    getLayout: () => null,
    getSizes: () => new Map(),
    onMapChanged: () => void changes++,
    renderFrame: () => undefined,
    scheduleFrame: () => void frames++,
    beginEditingNewNode: vi.fn(),
  });
  edits.replaceDisplayMap(MAP);
});

function nodeIds(map: MindMap): string[] {
  return [...map.nodes.keys()].sort();
}

describe("NodeEdits.deleteNode", () => {
  it("removes the branch of the given node regardless of the current selection", () => {
    selection.set("c");

    edits.deleteNode("a");

    expect(nodeIds(edits.getDisplayMap())).toEqual(["b", "c", "r1"]);
  });

  it("applies the post-delete selection rule to the deleted node, not the old selection", () => {
    selection.set("c");

    edits.deleteNode("b");

    expect(selection.current).toBe("a");
  });

  it("reports one change and schedules a frame", () => {
    edits.deleteNode("a");

    expect(changes).toBe(1);
    expect(frames).toBe(1);
  });

  it("gives the same map and selection as deleteSelection on that node", () => {
    selection.set("a");
    edits.deleteSelection();
    const viaSelection = { map: edits.getDisplayMap(), selected: selection.current };

    edits.replaceDisplayMap(MAP);
    selection.set("c");
    edits.deleteNode("a");

    expect(edits.getDisplayMap()).toEqual(viaSelection.map);
    expect(selection.current).toBe(viaSelection.selected);
  });
});

describe("NodeEdits.deleteSelection", () => {
  it("does nothing when nothing is selected", () => {
    edits.deleteSelection();

    expect(edits.getDisplayMap()).toBe(MAP);
    expect(changes).toBe(0);
  });
});

describe("NodeEdits on an id missing from the map", () => {
  const operations: [string, (target: NodeEdits) => void][] = [
    ["deleteNode", (target) => target.deleteNode("gone")],
    ["addChildTo", (target) => target.addChildTo("gone")],
    ["addSiblingTo", (target) => target.addSiblingTo("gone")],
  ];

  it.each(operations)("%s changes nothing and does not throw", (_name, operation) => {
    selection.set("c");

    expect(() => operation(edits)).not.toThrow();

    expect(edits.getDisplayMap()).toBe(MAP);
    expect(selection.current).toBe("c");
    expect(changes).toBe(0);
    expect(frames).toBe(0);
  });
});
