import { describe, expect, it } from "vitest";
import { buildMindMap, getNode } from "../model";
import { setNodeText } from "./setNodeText";

const map = buildMindMap([
  { id: "root", text: "Root", parentId: null },
  { id: "child", text: "Child", parentId: "root" },
]);

describe("setNodeText", () => {
  it("returns a map where the node has the new text", () => {
    const updated = setNodeText(map, { nodeId: "child", text: "Changed" });

    expect(getNode(updated, "child").text).toBe("Changed");
  });

  it("does not change other nodes", () => {
    const updated = setNodeText(map, { nodeId: "child", text: "Changed" });

    expect(getNode(updated, "root")).toBe(getNode(map, "root"));
  });

  it("does not mutate the input map", () => {
    setNodeText(map, { nodeId: "child", text: "Changed" });

    expect(getNode(map, "child").text).toBe("Child");
  });

  it("returns the very same map when the text is unchanged", () => {
    expect(setNodeText(map, { nodeId: "child", text: "Child" })).toBe(map);
  });

  it("allows clearing the text of an existing node", () => {
    const updated = setNodeText(map, { nodeId: "child", text: "" });

    expect(getNode(updated, "child").text).toBe("");
    expect(updated.nodes.has("child")).toBe(true);
  });

  it("throws when the node does not exist", () => {
    expect(() => setNodeText(map, { nodeId: "ghost", text: "x" })).toThrow("Node not found: ghost");
  });
});
