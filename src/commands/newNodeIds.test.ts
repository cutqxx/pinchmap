import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import { createNodeIdSource } from "./newNodeIds";

describe("createNodeIdSource", () => {
  it("never hands out an id that exists in the map", () => {
    const map = buildMindMap([{ id: "taken", text: "", parentId: null }]);
    const nextId = createNodeIdSource(map);

    const ids = Array.from({ length: 500 }, nextId);

    expect(ids).not.toContain("taken");
  });

  it("never hands out the same id twice", () => {
    const nextId = createNodeIdSource(buildMindMap([]));

    const ids = Array.from({ length: 5000 }, nextId);

    expect(new Set(ids).size).toBe(5000);
  });
});
