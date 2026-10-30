import { describe, expect, it } from "vitest";
import { pasteBranch } from "../commands";
import { parseMapFile, serializeMapFile } from "../format";
import { listNodesInDocumentOrder } from "../model";
import type { MindMap } from "../model";
import { parsePastedBranches } from "../format";

const FILE = ["---", "mindmap: true", "---", "- Main ^a1b2c3", "\t- Sub ^d4e5f6", "\t- Other ^g7h8i9", ""].join("\n");

function textsInOrder(map: MindMap): string[] {
  return listNodesInDocumentOrder(map).map(({ node }) => node.text);
}

function pasteAndReopen(clipboardText: string, targetId: string | null): { before: MindMap; after: MindMap; written: string } {
  const { map, source } = parseMapFile(FILE);
  const pasted = pasteBranch(map, { drafts: parsePastedBranches(clipboardText), targetId }).map;
  const written = serializeMapFile(pasted, source);
  return { before: pasted, after: parseMapFile(written).map, written };
}

describe("a pasted branch saved into the map file", () => {
  it.each([
    ["a code fence", "- Snippet\n  ```\n  code\n  ```\n- After"],
    ["a JSON fence", "- Snippet\n  ```json\n  {\"nodes\": {}}\n  ```\n- After"],
    ["a JSON fence as plain text lines", "```json\n{}\n```"],
    ["a comment marker", "- %%\n- text %% more\n  %%"],
    ["text that looks like an id", "- see ^abc\n- ^xyz\n  ^id"],
    ["list-like extra lines", "- Title\n  \\- not child\n  1\\. nor this"],
    ["nested items with checkboxes", "- [x] done\n\t- [ ] todo ^a1b2c3"],
    ["a numbered list", "1. First\n2. Second\n\t1. Nested"],
    ["a heading and blank lines", "# Heading\n\n- Item\n\n\n- Item two"],
    ["empty items", "- A\n\t-\n\t-\n- "],
    ["Cyrillic text", "- Привет\n\t- мир ^abc"],
  ])("keeps every node and its text for %s", (_name, clipboardText) => {
    const { before, after } = pasteAndReopen(clipboardText, "d4e5f6");

    expect(after.nodes.size).toBe(before.nodes.size);
    expect(textsInOrder(after)).toEqual(textsInOrder(before));
  });

  it("keeps the structure of the pasted branch", () => {
    const { before, after } = pasteAndReopen("- P\n\t- P1\n\t\t- P1a\n\t- P2", "g7h8i9");

    expect(after.rootIds).toEqual(before.rootIds);
    expect([...after.nodes.values()].map((node) => [node.id, node.parentId, node.childIds])).toEqual(
      [...before.nodes.values()].map((node) => [node.id, node.parentId, node.childIds]),
    );
  });

  it("keeps new roots pasted without a target", () => {
    const { before, after } = pasteAndReopen("- One\n\t- Child\n- Two", null);

    expect(after.rootIds).toHaveLength(before.rootIds.length);
    expect(textsInOrder(after)).toEqual(textsInOrder(before));
  });

  it("writes the ids of pasted nodes so they stay stable on the next load", () => {
    const { before, after } = pasteAndReopen("- New one\n- New two", "d4e5f6");

    expect([...after.nodes.keys()].sort()).toEqual([...before.nodes.keys()].sort());
  });
});
