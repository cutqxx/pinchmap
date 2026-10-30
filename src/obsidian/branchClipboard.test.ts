import { describe, expect, it, vi } from "vitest";
import { buildMindMap } from "../model";
import { createBranchClipboard, textClipboardOf } from "./branchClipboard";
import type { TextClipboard } from "./branchClipboard";

const MAP = buildMindMap([
  { id: "r", text: "Root", parentId: null },
  { id: "a", text: "A", parentId: "r" },
  { id: "a1", text: "A1", parentId: "a" },
  { id: "b", text: "B", parentId: "r" },
]);

function fakeClipboard(initial = ""): TextClipboard & { text: string } {
  const clipboard = {
    text: initial,
    readText: () => Promise.resolve(clipboard.text),
    writeText: (text: string) => {
      clipboard.text = text;
      return Promise.resolve();
    },
  };
  return clipboard;
}

describe("createBranchClipboard writeBranch", () => {
  it("writes the branch as a nested Markdown list without ids", async () => {
    const text = fakeClipboard();

    await createBranchClipboard(text).writeBranch(MAP, "r");

    expect(text.text).toBe(["- Root", "\t- A", "\t\t- A1", "\t- B"].join("\n"));
  });

  it("resolves quietly when writing is denied", async () => {
    const denied: TextClipboard = { readText: () => Promise.resolve(""), writeText: () => Promise.reject(new Error("denied")) };

    await expect(createBranchClipboard(denied).writeBranch(MAP, "a")).resolves.toBeUndefined();
  });

  it("resolves quietly when there is no clipboard API", async () => {
    await expect(createBranchClipboard(undefined).writeBranch(MAP, "a")).resolves.toBeUndefined();
  });
});

describe("createBranchClipboard readBranches", () => {
  it("parses the clipboard text into drafts", async () => {
    const text = fakeClipboard("- One\n\t- Two");

    expect(await createBranchClipboard(text).readBranches()).toEqual([{ text: "One", children: [{ text: "Two", children: [] }] }]);
  });

  it("returns nothing for an empty clipboard", async () => {
    expect(await createBranchClipboard(fakeClipboard("")).readBranches()).toEqual([]);
  });

  it("returns nothing when reading is denied", async () => {
    const denied: TextClipboard = { readText: () => Promise.reject(new Error("denied")), writeText: () => Promise.resolve() };

    expect(await createBranchClipboard(denied).readBranches()).toEqual([]);
  });

  it("returns nothing when there is no clipboard API", async () => {
    expect(await createBranchClipboard(undefined).readBranches()).toEqual([]);
  });

  it("reads back what writeBranch wrote", async () => {
    const text = fakeClipboard();
    const clipboard = createBranchClipboard(text);

    await clipboard.writeBranch(MAP, "r");

    expect(await clipboard.readBranches()).toEqual([
      {
        text: "Root",
        children: [
          { text: "A", children: [{ text: "A1", children: [] }] },
          { text: "B", children: [] },
        ],
      },
    ]);
  });
});

describe("textClipboardOf", () => {
  it("returns the navigator clipboard of the window", () => {
    const clipboard = { readText: vi.fn(), writeText: vi.fn() };

    expect(textClipboardOf({ navigator: { clipboard } } as unknown as Window)).toBe(clipboard);
  });

  it("returns undefined when the window has no clipboard", () => {
    expect(textClipboardOf({ navigator: {} } as unknown as Window)).toBeUndefined();
    expect(textClipboardOf({} as unknown as Window)).toBeUndefined();
  });
});
