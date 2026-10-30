import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap } from "../model";
import { DEFAULT_HISTORY_DEPTH, History } from "./history";

function mapNamed(text: string): MindMap {
  return buildMindMap([{ id: "r1", text, parentId: null }]);
}

function rootText(map: MindMap): string {
  return map.nodes.get("r1")?.text ?? "";
}

describe("History round trips", () => {
  it("returns the pushed map on undo", () => {
    const history = new History();
    const before = mapNamed("before");
    history.push(before);

    expect(history.undo(mapNamed("after"))).toBe(before);
  });

  it("returns the map that was current at undo time on redo", () => {
    const history = new History();
    const after = mapNamed("after");
    history.push(mapNamed("before"));
    history.undo(after);

    expect(history.redo(mapNamed("before"))).toBe(after);
  });

  it("undoes several steps in reverse order", () => {
    const history = new History();
    history.push(mapNamed("one"));
    history.push(mapNamed("two"));

    const first = history.undo(mapNamed("three"));
    const second = history.undo(first as MindMap);

    expect([rootText(first as MindMap), rootText(second as MindMap)]).toEqual(["two", "one"]);
  });

  it("redoes several undone steps in the original order", () => {
    const history = new History();
    history.push(mapNamed("one"));
    history.push(mapNamed("two"));
    const atTwo = history.undo(mapNamed("three")) as MindMap;
    const atOne = history.undo(atTwo) as MindMap;

    const redoneToTwo = history.redo(atOne) as MindMap;
    const redoneToThree = history.redo(redoneToTwo) as MindMap;

    expect([rootText(redoneToTwo), rootText(redoneToThree)]).toEqual(["two", "three"]);
  });
});

describe("History availability", () => {
  it("has nothing to undo or redo when new", () => {
    const history = new History();

    expect([history.canUndo, history.canRedo]).toEqual([false, false]);
  });

  it("can undo but not redo after a push", () => {
    const history = new History();

    history.push(mapNamed("before"));

    expect([history.canUndo, history.canRedo]).toEqual([true, false]);
  });

  it("can redo but not undo after undoing the only step", () => {
    const history = new History();
    history.push(mapNamed("before"));

    history.undo(mapNamed("after"));

    expect([history.canUndo, history.canRedo]).toEqual([false, true]);
  });

  it("can undo and redo in the middle of the stack", () => {
    const history = new History();
    history.push(mapNamed("one"));
    history.push(mapNamed("two"));

    history.undo(mapNamed("three"));

    expect([history.canUndo, history.canRedo]).toEqual([true, true]);
  });

  it("cannot redo after redoing every undone step", () => {
    const history = new History();
    history.push(mapNamed("before"));
    const atBefore = history.undo(mapNamed("after")) as MindMap;

    history.redo(atBefore);

    expect([history.canUndo, history.canRedo]).toEqual([true, false]);
  });
});

describe("History after a new push", () => {
  it("clears redo when a push follows an undo", () => {
    const history = new History();
    history.push(mapNamed("one"));
    history.undo(mapNamed("two"));

    history.push(mapNamed("other"));

    expect(history.canRedo).toBe(false);
  });

  it("keeps the new push undoable after clearing redo", () => {
    const history = new History();
    const other = mapNamed("other");
    history.push(mapNamed("one"));
    history.undo(mapNamed("two"));
    history.push(other);

    expect(history.undo(mapNamed("three"))).toBe(other);
  });
});

describe("History depth cap", () => {
  it("defaults to 200 steps", () => {
    expect(DEFAULT_HISTORY_DEPTH).toBe(200);
  });

  it("keeps exactly 200 steps after the 201st push", () => {
    const history = new History();
    for (let step = 0; step <= DEFAULT_HISTORY_DEPTH; step++) history.push(mapNamed(`step ${step}`));

    let undone = 0;
    let current = mapNamed("current");
    for (let restored = history.undo(current); restored !== null; restored = history.undo(current)) {
      current = restored;
      undone++;
    }

    expect(undone).toBe(DEFAULT_HISTORY_DEPTH);
  });

  it("drops the oldest entry when the cap is exceeded", () => {
    const history = new History();
    for (let step = 0; step <= DEFAULT_HISTORY_DEPTH; step++) history.push(mapNamed(`step ${step}`));

    let oldest = mapNamed("current");
    for (let restored = history.undo(oldest); restored !== null; restored = history.undo(oldest)) {
      oldest = restored;
    }

    expect(rootText(oldest)).toBe("step 1");
  });

  it("keeps the newest entry first when the cap is exceeded", () => {
    const history = new History();
    for (let step = 0; step <= DEFAULT_HISTORY_DEPTH; step++) history.push(mapNamed(`step ${step}`));

    const newest = history.undo(mapNamed("current")) as MindMap;

    expect(rootText(newest)).toBe(`step ${DEFAULT_HISTORY_DEPTH}`);
  });

  it("honours a custom depth", () => {
    const history = new History(2);
    history.push(mapNamed("one"));
    history.push(mapNamed("two"));
    history.push(mapNamed("three"));

    const first = history.undo(mapNamed("four")) as MindMap;
    const second = history.undo(first) as MindMap;

    expect([rootText(first), rootText(second), history.canUndo]).toEqual(["three", "two", false]);
  });
});

describe("History clear", () => {
  it("forgets both undo and redo steps", () => {
    const history = new History();
    history.push(mapNamed("one"));
    history.push(mapNamed("two"));
    history.undo(mapNamed("three"));

    history.clear();

    expect([history.canUndo, history.canRedo]).toEqual([false, false]);
  });

  it("accepts new steps after clearing", () => {
    const history = new History();
    const before = mapNamed("before");
    history.push(mapNamed("old"));
    history.clear();
    history.push(before);

    expect(history.undo(mapNamed("after"))).toBe(before);
  });
});

describe("History on empty stacks", () => {
  it("reports no change for undo", () => {
    expect(new History().undo(mapNamed("current"))).toBeNull();
  });

  it("reports no change for redo", () => {
    expect(new History().redo(mapNamed("current"))).toBeNull();
  });

  it("does not create a redo step from an undo that did nothing", () => {
    const history = new History();

    history.undo(mapNamed("current"));

    expect(history.canRedo).toBe(false);
  });

  it("does not create an undo step from a redo that did nothing", () => {
    const history = new History();

    history.redo(mapNamed("current"));

    expect(history.canUndo).toBe(false);
  });
});
