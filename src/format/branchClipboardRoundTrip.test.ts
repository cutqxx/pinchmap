import { describe, expect, it } from "vitest";
import { buildMindMap, canonicalNodeText, getNode } from "../model";
import type { BranchDraft, MindMap, NodeEntry, NodeId } from "../model";
import { branchToMarkdown } from "./branchMarkdown";
import { parsePastedBranches } from "./pastedBranches";

const TRICKY_TEXTS = [
  "foo",
  "1. foo",
  "1) foo",
  "- dash",
  "* star",
  "+ plus",
  "-",
  "\\- escaped",
  "^abc",
  "foo ^abc",
  "[x] done",
  "[ ] todo",
  "\\[x] literal",
  "```",
  "```json",
  "%% comment %%",
  "# heading",
  "",
  "two\nlines",
  "a\n- b",
  "a\n  - b",
  "a\nplain\n\t* b",
  "a\nplain\n  1. b",
  "a\nplain\n  -",
  "a\nplain\n  \\- kept",
  "a\n* b",
  "a\n1. b",
  "a\n12) b",
  "a\n\\- b",
  "a\n1\\. b",
  "a\n\n\nb",
  "a\nb\n  c",
  "a\n^id",
  "a\n[x] b",
  "a\n```json\n{}\n```",
  "ключ ^abc",
  "foo \\^abc",
  "\\\\^abc",
  "a\n\\^id",
  "x^2",
  "tab\tinside",
  "a\n-",
  "a\n+\nb",
  "a  \nb",
  "a\n\tb\n\t\tc",
  "a\n\\\\- b",
];

function drafts(map: MindMap, ids: readonly NodeId[]): BranchDraft[] {
  return ids.map((id) => {
    const node = getNode(map, id);
    return { text: node.text, children: drafts(map, node.childIds) };
  });
}

function roundTrip(map: MindMap, id: NodeId): BranchDraft[] {
  return parsePastedBranches(branchToMarkdown(map, id));
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomTree(random: () => number, size: number): MindMap {
  const entries: NodeEntry[] = [{ id: "n0", text: canonicalNodeText(pick(random)), parentId: null }];
  for (let index = 1; index < size; index++) {
    const parent = entries[Math.floor(random() * entries.length)];
    entries.push({ id: `n${index}`, text: canonicalNodeText(pick(random)), parentId: parent?.id ?? "n0" });
  }
  return buildMindMap(entries);
}

function pick(random: () => number): string {
  const first = TRICKY_TEXTS[Math.floor(random() * TRICKY_TEXTS.length)] ?? "";
  if (random() < 0.7) return first;
  return `${first}\n${TRICKY_TEXTS[Math.floor(random() * TRICKY_TEXTS.length)] ?? ""}`;
}

describe("copying a branch and pasting it back", () => {
  it.each(TRICKY_TEXTS)("keeps the node text %j", (text) => {
    const map = buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "c", text: canonicalNodeText(text), parentId: "r" },
      { id: "d", text: "After", parentId: "r" },
    ]);

    expect(roundTrip(map, "r")).toEqual(drafts(map, ["r"]));
  });

  it.each(TRICKY_TEXTS)("keeps %j as the text of a lone top node", (text) => {
    const map = buildMindMap([{ id: "r", text: canonicalNodeText(text), parentId: null }]);

    expect(roundTrip(map, "r")).toEqual(drafts(map, ["r"]));
  });

  it("keeps a deep branch with siblings", () => {
    const map = buildMindMap([
      { id: "r", text: "Root", parentId: null },
      { id: "a", text: "A", parentId: "r" },
      { id: "a1", text: "A1", parentId: "a" },
      { id: "a1x", text: "A1x\nmore", parentId: "a1" },
      { id: "a2", text: "A2", parentId: "a" },
      { id: "b", text: "B", parentId: "r" },
    ]);

    expect(roundTrip(map, "r")).toEqual(drafts(map, ["r"]));
  });

  it("keeps the structure and texts of 1000 random branches", () => {
    const random = seededRandom(20240607);
    for (let run = 0; run < 1000; run++) {
      const map = randomTree(random, 1 + Math.floor(random() * 12));

      expect(roundTrip(map, "n0"), branchToMarkdown(map, "n0")).toEqual(drafts(map, ["n0"]));
    }
  });
});
