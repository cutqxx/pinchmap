// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import { MapRenderer } from "./mapRenderer";

const MAP = buildMindMap([{ id: "r", text: "Saved", parentId: null }]);

function displayedText(draftText: string | null): string {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new MapRenderer(container);
  const editing = draftText === null ? null : { nodeId: "r", draftText };
  renderer.syncContent(MAP, { editing, selectedIds: new Set<string>() });
  const text = container.querySelector(".pinchmap-node")?.firstElementChild?.textContent;
  container.remove();
  return text ?? "";
}

describe("MapRenderer text of the node being edited", () => {
  it("adds a visible empty line when the draft ends with a newline", () => {
    expect(displayedText("first\n")).toBe("first\n\n");
  });

  it("shows a draft without a trailing newline unchanged", () => {
    expect(displayedText("first\nsecond")).toBe("first\nsecond");
  });

  it("keeps newlines inside the draft as they are", () => {
    expect(displayedText("a\n\nb")).toBe("a\n\nb");
  });

  it("does not alter the saved text of a node that is not being edited", () => {
    expect(displayedText(null)).toBe("Saved");
  });
});
