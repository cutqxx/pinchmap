// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { hitTargetOf } from "./domTargets";

function elementWith(hit: string, nodeId: string | null): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("data-pinchmap-hit", hit);
  if (nodeId !== null) element.setAttribute("data-node-id", nodeId);
  return element;
}

describe("hitTargetOf", () => {
  it("recognises the link icon as a node-bound target", () => {
    expect(hitTargetOf(elementWith("link-icon", "n1"))).toEqual({ kind: "link-icon", nodeId: "n1" });
  });

  it("resolves a click on the icon's inner svg to the icon", () => {
    const icon = elementWith("link-icon", "n1");
    const inner = icon.appendChild(document.createElement("span"));
    expect(hitTargetOf(inner)).toEqual({ kind: "link-icon", nodeId: "n1" });
  });

  it("prefers the icon over the node that contains it", () => {
    const node = elementWith("node", "n1");
    const icon = node.appendChild(elementWith("link-icon", "n1"));
    expect(hitTargetOf(icon).kind).toBe("link-icon");
  });

  it("falls back to canvas when the icon has no node id", () => {
    expect(hitTargetOf(elementWith("link-icon", null))).toEqual({ kind: "canvas" });
  });

  it("falls back to canvas for an unknown hit kind", () => {
    expect(hitTargetOf(elementWith("mystery", "n1"))).toEqual({ kind: "canvas" });
  });
});
