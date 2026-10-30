import { describe, expect, it } from "vitest";
import { buildMindMap } from ".";
import { countDescendants, isNodeCollapsed, listHiddenNodeIds, readCollapsed, visibleStandIn, withCollapsed } from ".";

const COLLAPSED = { collapsed: true };

function treeWith(collapsedIds: string[]) {
  const state = (id: string) => (collapsedIds.includes(id) ? { state: COLLAPSED } : {});
  return buildMindMap([
    { id: "r", text: "", parentId: null, ...state("r") },
    { id: "a", text: "", parentId: "r", ...state("a") },
    { id: "a1", text: "", parentId: "a", ...state("a1") },
    { id: "a1x", text: "", parentId: "a1" },
    { id: "a2", text: "", parentId: "a" },
    { id: "b", text: "", parentId: "r" },
    { id: "r2", text: "", parentId: null },
  ]);
}

describe("readCollapsed", () => {
  it("is true only when the state says collapsed is true", () => {
    expect(readCollapsed({ collapsed: true })).toBe(true);
  });

  it.each([[undefined], [{}], [{ collapsed: false }], [{ collapsed: "true" }], [{ collapsed: 1 }], [{ collapsed: null }]])(
    "is false for the state %j",
    (state) => {
      expect(readCollapsed(state)).toBe(false);
    },
  );
});

describe("isNodeCollapsed", () => {
  it("reads the flag from the node state", () => {
    const map = treeWith(["a"]);

    expect([...map.nodes.values()].filter(isNodeCollapsed).map((node) => node.id)).toEqual(["a"]);
  });
});

describe("withCollapsed", () => {
  it("adds the flag and keeps the other fields", () => {
    expect(withCollapsed({ color: "red", x: 1 }, true)).toEqual({ color: "red", x: 1, collapsed: true });
  });

  it("creates a state holding only the flag when there was none", () => {
    expect(withCollapsed(undefined, true)).toEqual({ collapsed: true });
  });

  it("removes the key rather than storing false, keeping the other fields", () => {
    expect(withCollapsed({ color: "red", collapsed: true }, false)).toEqual({ color: "red" });
  });

  it("returns no state at all when clearing the flag empties it", () => {
    expect(withCollapsed({ collapsed: true }, false)).toBeUndefined();
  });

  it("returns no state when clearing a flag that was never set", () => {
    expect(withCollapsed(undefined, false)).toBeUndefined();
  });

  it("does not mutate the input state", () => {
    const state = { collapsed: true, color: "red" };

    withCollapsed(state, false);

    expect(state).toEqual({ collapsed: true, color: "red" });
  });
});

describe("countDescendants", () => {
  it("is zero for a leaf", () => {
    expect(countDescendants(treeWith([]), "b")).toBe(0);
  });

  it("counts children of every level, not only direct ones", () => {
    expect(countDescendants(treeWith([]), "a")).toBe(3);
  });

  it("counts the whole tree below a root without the root and without other roots", () => {
    expect(countDescendants(treeWith([]), "r")).toBe(5);
  });

  it("counts descendants hidden under an already collapsed inner node", () => {
    expect(countDescendants(treeWith(["a1"]), "a")).toBe(3);
  });
});

describe("listHiddenNodeIds", () => {
  it("is empty when nothing is collapsed", () => {
    expect([...listHiddenNodeIds(treeWith([]))]).toEqual([]);
  });

  it("hides all levels below a collapsed node but not the node itself", () => {
    expect([...listHiddenNodeIds(treeWith(["a"]))].sort()).toEqual(["a1", "a1x", "a2"]);
  });

  it("hides only the subtree of a collapsed inner node", () => {
    expect([...listHiddenNodeIds(treeWith(["a1"]))]).toEqual(["a1x"]);
  });

  it("hides everything below a collapsed root and leaves other roots alone", () => {
    expect([...listHiddenNodeIds(treeWith(["r"]))].sort()).toEqual(["a", "a1", "a1x", "a2", "b"]);
  });

  it("does not list a collapsed leaf's own flag as hiding anything", () => {
    expect([...listHiddenNodeIds(treeWith(["b"]))]).toEqual([]);
  });
});

describe("visibleStandIn", () => {
  it("is the node itself when no ancestor is collapsed", () => {
    expect(visibleStandIn(treeWith([]), "a1x")).toBe("a1x");
  });

  it("is the node itself when only the node is collapsed", () => {
    expect(visibleStandIn(treeWith(["a"]), "a")).toBe("a");
  });

  it("is the collapsed parent for a hidden child", () => {
    expect(visibleStandIn(treeWith(["a"]), "a2")).toBe("a");
  });

  it("is the outermost collapsed ancestor when several are collapsed", () => {
    expect(visibleStandIn(treeWith(["a", "a1"]), "a1x")).toBe("a");
  });

  it("is the collapsed root for any node of its tree", () => {
    expect(visibleStandIn(treeWith(["r"]), "a1x")).toBe("r");
  });

  it("ignores a collapsed sibling branch", () => {
    expect(visibleStandIn(treeWith(["b"]), "a1")).toBe("a1");
  });
});
