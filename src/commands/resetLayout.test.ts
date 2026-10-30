import { describe, expect, it } from "vitest";
import { buildMindMap, getNode } from "../model";
import { resetMapLayout, resetNodeLayout } from "./resetLayout";

const map = buildMindMap([
  { id: "r1", text: "R1", parentId: null, state: { x: 100, y: 200 } },
  { id: "a", text: "A", parentId: "r1", state: { x: 5, y: 6, side: "left" } },
  { id: "a1", text: "A1", parentId: "a", state: { x: 7, y: 8 } },
  { id: "b", text: "B", parentId: "r1" },
  { id: "r2", text: "R2", parentId: null, state: { x: -50, y: 0, color: "red" } },
]);

describe("resetNodeLayout", () => {
  it("removes the position from the node", () => {
    const reset = resetNodeLayout(map, { nodeId: "a1" });

    expect(getNode(reset, "a1").state).toBeUndefined();
  });

  it("keeps other state fields of the node", () => {
    const reset = resetNodeLayout(map, { nodeId: "a" });

    expect(getNode(reset, "a").state).toEqual({ side: "left" });
  });

  it("does not touch descendants of the node", () => {
    const reset = resetNodeLayout(map, { nodeId: "a" });

    expect(getNode(reset, "a1").state).toEqual({ x: 7, y: 8 });
  });

  it("returns the very same map when the node has no position", () => {
    expect(resetNodeLayout(map, { nodeId: "b" })).toBe(map);
  });

  it("throws when the node does not exist", () => {
    expect(() => resetNodeLayout(map, { nodeId: "ghost" })).toThrow("Node not found: ghost");
  });
});

describe("resetMapLayout", () => {
  it("removes the positions of all non-root nodes", () => {
    const reset = resetMapLayout(map);

    expect(getNode(reset, "a").state).toEqual({ side: "left" });
    expect(getNode(reset, "a1").state).toBeUndefined();
  });

  it("keeps the absolute positions of all roots", () => {
    const reset = resetMapLayout(map);

    expect(getNode(reset, "r1").state).toEqual({ x: 100, y: 200 });
    expect(getNode(reset, "r2").state).toEqual({ x: -50, y: 0, color: "red" });
  });

  it("returns the very same map when no non-root has a position", () => {
    const rootsOnly = resetMapLayout(map);

    expect(resetMapLayout(rootsOnly)).toBe(rootsOnly);
  });
});
