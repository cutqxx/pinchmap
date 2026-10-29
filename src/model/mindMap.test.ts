import { describe, expect, it } from "vitest";
import {
  EMPTY_MIND_MAP,
  buildMindMap,
  generateNodeId,
  getNode,
  listNodesInDocumentOrder,
  withNewChild,
  withNodeText,
  withSidesResolved,
} from ".";
import type { NodeEntry } from ".";

const SAMPLE_ENTRIES: NodeEntry[] = [
  { id: "r1", text: "Root one", parentId: null },
  { id: "c1", text: "Child one", parentId: "r1" },
  { id: "g1", text: "Grandchild", parentId: "c1" },
  { id: "c2", text: "Child two", parentId: "r1" },
  { id: "r2", text: "Root two", parentId: null },
];

describe("buildMindMap", () => {
  it("lists nodes without a parent as roots in input order", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    expect(map.rootIds).toEqual(["r1", "r2"]);
  });

  it("lists children of a parent in input order", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    expect(getNode(map, "r1").childIds).toEqual(["c1", "c2"]);
  });

  it("gives a node without children an empty child list", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    expect(getNode(map, "g1").childIds).toEqual([]);
  });

  it("keeps parent and child links consistent in both directions", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    for (const node of map.nodes.values()) {
      for (const childId of node.childIds) {
        expect(getNode(map, childId).parentId).toBe(node.id);
      }
      if (node.parentId !== null) {
        expect(getNode(map, node.parentId).childIds).toContain(node.id);
      }
    }
  });

  it("stores the text of each node", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    expect(getNode(map, "c2").text).toBe("Child two");
  });

  it("builds an empty map from no entries", () => {
    const map = buildMindMap([]);

    expect(map.rootIds).toEqual([]);
    expect(map.nodes.size).toBe(0);
  });
});

describe("getNode", () => {
  it("throws naming the id when the node does not exist", () => {
    expect(() => getNode(EMPTY_MIND_MAP, "nope")).toThrow("Node not found: nope");
  });
});

describe("withNodeText", () => {
  it("returns a map where the node has the new text", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    const updated = withNodeText(map, "c1", "Renamed");

    expect(getNode(updated, "c1").text).toBe("Renamed");
  });

  it("does not modify the original map", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    withNodeText(map, "c1", "Renamed");

    expect(getNode(map, "c1").text).toBe("Child one");
  });

  it("leaves the tree structure and other nodes unchanged", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    const updated = withNodeText(map, "c1", "Renamed");

    expect(updated.rootIds).toEqual(map.rootIds);
    expect(getNode(updated, "c1").childIds).toEqual(["g1"]);
    expect(getNode(updated, "c1").parentId).toBe("r1");
    expect(getNode(updated, "c2")).toBe(getNode(map, "c2"));
  });

  it("throws when the node does not exist", () => {
    expect(() => withNodeText(EMPTY_MIND_MAP, "nope", "x")).toThrow("Node not found: nope");
  });
});

describe("listNodesInDocumentOrder", () => {
  it("visits each node before its children, depth first", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    const order = listNodesInDocumentOrder(map).map(({ node }) => node.id);

    expect(order).toEqual(["r1", "c1", "g1", "c2", "r2"]);
  });

  it("reports the nesting depth of each node", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    const depths = listNodesInDocumentOrder(map).map(({ depth }) => depth);

    expect(depths).toEqual([0, 1, 2, 1, 0]);
  });

  it("returns nothing for an empty map", () => {
    expect(listNodesInDocumentOrder(EMPTY_MIND_MAP)).toEqual([]);
  });
});

describe("generateNodeId", () => {
  it("produces six characters from a-z and 0-9", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateNodeId(new Set())).toMatch(/^[a-z0-9]{6}$/);
    }
  });

  it("maps the random source onto the alphabet deterministically", () => {
    expect(generateNodeId(new Set(), () => 0)).toBe("aaaaaa");
    expect(generateNodeId(new Set(), () => 0.999999)).toBe("999999");
  });

  it("draws again when the candidate is already taken", () => {
    const draws = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let next = 0;
    const random = (): number => draws[next++] ?? 0.25;

    const id = generateNodeId(new Set(["aaaaaa"]), random);

    expect(id).toBe("ssssss");
  });
});

describe("withSidesResolved", () => {
  const pendingMap = buildMindMap([
    { id: "r", text: "Root", parentId: null, state: { x: 1, y: 2 } },
    { id: "a", text: "Pending A", parentId: "r", isSidePending: true, state: { future: [1, "two"], color: "red" } },
    { id: "b", text: "Pending B", parentId: "r", isSidePending: true },
    { id: "c", text: "Decided", parentId: "r", state: { side: "left" } },
    { id: "g", text: "Grandchild", parentId: "a" },
  ]);

  it("returns the very same map when no branch is pending", () => {
    const map = buildMindMap(SAMPLE_ENTRIES);

    expect(withSidesResolved(map, new Map([["c1", "left"]]))).toBe(map);
  });

  it("writes left into the state of a pending branch placed on the left", () => {
    const settled = withSidesResolved(pendingMap, new Map([["a", "left"], ["b", "right"]]));

    expect(getNode(settled, "a").state).toMatchObject({ side: "left" });
  });

  it("writes no state for a pending branch placed on the right", () => {
    const settled = withSidesResolved(pendingMap, new Map([["a", "left"], ["b", "right"]]));

    expect(getNode(settled, "b").state).toBeUndefined();
  });

  it("treats a pending branch missing from the sides as right", () => {
    const settled = withSidesResolved(pendingMap, new Map());

    expect(getNode(settled, "a").state).toEqual({ future: [1, "two"], color: "red" });
  });

  it("clears the pending flag on settled branches", () => {
    const settled = withSidesResolved(pendingMap, new Map([["a", "left"], ["b", "left"]]));

    expect(getNode(settled, "a").isSidePending).toBeUndefined();
    expect(getNode(settled, "b").isSidePending).toBeUndefined();
  });

  it("keeps text, parent, children and every other state key of a settled branch", () => {
    const settled = withSidesResolved(pendingMap, new Map([["a", "left"]]));

    const branch = getNode(settled, "a");
    expect(branch.text).toBe("Pending A");
    expect(branch.parentId).toBe("r");
    expect(branch.childIds).toEqual(["g"]);
    expect(branch.state).toEqual({ future: [1, "two"], color: "red", side: "left" });
  });

  it("leaves decided branches, roots and descendants as they were", () => {
    const settled = withSidesResolved(pendingMap, new Map([["a", "left"]]));

    for (const id of ["r", "c", "g"]) {
      expect(getNode(settled, id)).toBe(getNode(pendingMap, id));
    }
    expect(settled.rootIds).toBe(pendingMap.rootIds);
  });

  it("does not mutate the input map", () => {
    withSidesResolved(pendingMap, new Map([["a", "left"]]));

    expect(getNode(pendingMap, "a").isSidePending).toBe(true);
    expect(getNode(pendingMap, "a").state).toEqual({ future: [1, "two"], color: "red" });
  });
});

describe("buildMindMap pending side flag", () => {
  it("keeps the pending flag on a node", () => {
    const map = buildMindMap([
      { id: "r", text: "", parentId: null },
      { id: "a", text: "", parentId: "r", isSidePending: true },
    ]);

    expect(getNode(map, "a").isSidePending).toBe(true);
    expect(getNode(map, "r").isSidePending).toBeUndefined();
  });
});

describe("withNewChild", () => {
  const map = buildMindMap(SAMPLE_ENTRIES);

  it("appends the new node last among the children of its parent", () => {
    const updated = withNewChild(map, { id: "c3", text: "New", parentId: "r1" });

    expect(getNode(updated, "r1").childIds).toEqual(["c1", "c2", "c3"]);
  });

  it("creates a childless node with the given text, parent and state", () => {
    const updated = withNewChild(map, { id: "c3", text: "New", parentId: "r1", state: { side: "left" } });

    expect(getNode(updated, "c3")).toEqual({
      id: "c3",
      text: "New",
      parentId: "r1",
      childIds: [],
      state: { side: "left" },
    });
  });

  it("does not mutate the input map", () => {
    withNewChild(map, { id: "c3", text: "New", parentId: "r1" });

    expect(getNode(map, "r1").childIds).toEqual(["c1", "c2"]);
    expect(map.nodes.has("c3")).toBe(false);
  });

  it("fails for an unknown parent", () => {
    expect(() => withNewChild(map, { id: "x", text: "", parentId: "nope" })).toThrow("Node not found: nope");
  });
});
