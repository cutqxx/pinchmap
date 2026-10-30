import { beforeEach, describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { BranchDraft, MindMap } from "../model";
import { BranchTransfer } from "./branchTransfer";
import type { BranchClipboard } from "./branchTransfer";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
]);
const DRAFTS: BranchDraft[] = [{ text: "Pasted", children: [] }];

let calls: string[];
let clipboard: BranchClipboard;
let resolveRead: (drafts: readonly BranchDraft[]) => void;
let active: boolean;
let session: number;
let map: MindMap;
let transfer: BranchTransfer;

beforeEach(() => {
  calls = [];
  active = true;
  session = 1;
  map = MAP;
  clipboard = {
    writeBranch: (_map, nodeId) => {
      calls.push(`write:${nodeId}`);
      return Promise.resolve();
    },
    readBranches: () => new Promise((resolve) => (resolveRead = resolve)),
  };
  transfer = new BranchTransfer({
    clipboard,
    getMap: () => map,
    pasteDrafts: (drafts, targetId) => void calls.push(`paste:${drafts.map((d) => d.text).join(",")}:${targetId}`),
    duplicateBranch: (nodeId) => void calls.push(`duplicate:${nodeId}`),
    commitPendingEdit: () => void calls.push("commit"),
    isActive: () => active,
    mapSession: () => session,
  });
});

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("BranchTransfer.copy", () => {
  it("writes the node's branch to the clipboard", () => {
    transfer.copy("a");

    expect(calls).toEqual(["write:a"]);
  });

  it("does nothing without a node", () => {
    transfer.copy(null);

    expect(calls).toEqual([]);
  });

  it("does nothing for a node that is not in the map", () => {
    transfer.copy("gone");

    expect(calls).toEqual([]);
  });
});

describe("BranchTransfer.paste", () => {
  it("pastes the read branches into the target after committing a pending text edit", async () => {
    transfer.paste("a");
    resolveRead(DRAFTS);
    await settle();

    expect(calls).toEqual(["commit", "paste:Pasted:a"]);
  });

  it("pastes as new roots when no node is selected", async () => {
    transfer.paste(null);
    resolveRead(DRAFTS);
    await settle();

    expect(calls).toEqual(["commit", "paste:Pasted:null"]);
  });

  it("does nothing until the clipboard has been read", async () => {
    transfer.paste("a");
    await settle();

    expect(calls).toEqual([]);
  });

  it("does not touch the editor when it was destroyed while reading", async () => {
    transfer.paste("a");
    active = false;
    resolveRead(DRAFTS);
    await settle();

    expect(calls).toEqual([]);
  });

  it("drops the paste when another map was opened while reading", async () => {
    transfer.paste("a");
    session = 2;
    resolveRead(DRAFTS);
    await settle();

    expect(calls).toEqual([]);
  });

  it("hands over an empty list when the clipboard held nothing so the editor changes nothing", async () => {
    transfer.paste("a");
    resolveRead([]);
    await settle();

    expect(calls).toEqual(["commit", "paste::a"]);
  });
});

describe("BranchTransfer.duplicate", () => {
  it("duplicates the node's branch", () => {
    transfer.duplicate("a");

    expect(calls).toEqual(["duplicate:a"]);
  });

  it("does nothing without a node", () => {
    transfer.duplicate(null);

    expect(calls).toEqual([]);
  });
});

