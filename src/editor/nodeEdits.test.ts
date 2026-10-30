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

describe("NodeEdits when the last nodes are deleted", () => {
  const TWO_TREES = buildMindMap([
    { id: "r1", text: "One", parentId: null },
    { id: "a", text: "A", parentId: "r1" },
    { id: "r2", text: "Two", parentId: null, state: { color: "red" } },
    { id: "r3", text: "Three", parentId: null },
  ]);

  function blankRootTexts(): string[] {
    return [...edits.getDisplayMap().nodes.values()].map((node) => node.text);
  }

  it("keeps the deleted only root as a blank root and selects it", () => {
    edits.replaceDisplayMap(buildMindMap([{ id: "only", text: "Only", parentId: null }]));

    edits.deleteNode("only");

    expect(edits.getDisplayMap().rootIds).toEqual(["only"]);
    expect(blankRootTexts()).toEqual([""]);
    expect(selection.ids).toEqual(["only"]);
  });

  it("reports one change when the only root is deleted", () => {
    edits.replaceDisplayMap(buildMindMap([{ id: "only", text: "Only", parentId: null }]));

    edits.deleteNode("only");

    expect(changes).toBe(1);
  });

  it("reports no change and no history step when the blank root is deleted again", () => {
    edits.replaceDisplayMap(buildMindMap([{ id: "only", text: "", parentId: null }]));

    edits.deleteNode("only");
    edits.undo();

    expect(changes).toBe(0);
    expect(blankRootTexts()).toEqual([""]);
  });

  it("leaves one blank root when every root is deleted together", () => {
    edits.replaceDisplayMap(TWO_TREES);

    edits.deleteBranches(["r1", "r2", "r3"]);

    expect(edits.getDisplayMap().nodes.size).toBe(1);
    expect(blankRootTexts()).toEqual([""]);
    expect(selection.ids).toEqual(edits.getDisplayMap().rootIds);
  });

  it("deletes a parent and its selected descendants together down to one blank root", () => {
    edits.replaceDisplayMap(buildMindMap([
      { id: "r", text: "R", parentId: null },
      { id: "c", text: "C", parentId: "r" },
    ]));

    edits.deleteBranches(["r", "c"]);

    expect(edits.getDisplayMap().rootIds).toEqual(["r"]);
    expect(blankRootTexts()).toEqual([""]);
  });

  it("restores everything, with state, in one undo step after deleting all roots together", () => {
    edits.replaceDisplayMap(TWO_TREES);
    edits.deleteBranches(["r1", "r2", "r3"]);

    edits.undo();

    expect(edits.getDisplayMap()).toEqual(TWO_TREES);
  });

  it("deletes all roots again on redo", () => {
    edits.replaceDisplayMap(TWO_TREES);
    edits.deleteBranches(["r1", "r2", "r3"]);
    const afterDelete = edits.getDisplayMap();
    edits.undo();

    edits.redo();

    expect(edits.getDisplayMap()).toEqual(afterDelete);
  });

  it("keeps selecting nothing when only some roots are deleted together", () => {
    edits.replaceDisplayMap(TWO_TREES);
    selection.set("r3");

    edits.deleteBranches(["r1", "r3"]);

    expect(edits.getDisplayMap().rootIds).toEqual(["r2"]);
    expect(selection.ids).toEqual([]);
  });

  it("does not select the root of a map that was not emptied", () => {
    edits.replaceDisplayMap(TWO_TREES);

    edits.deleteNode("a");

    expect(selection.ids).toEqual(["r1"]);
  });
});
