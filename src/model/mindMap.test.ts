import { describe, expect, it } from "vitest";
import {
  EMPTY_MIND_MAP,
  buildMindMap,
  generateNodeId,
  getNode,
  listNodesInDocumentOrder,
  withNodeText,
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
