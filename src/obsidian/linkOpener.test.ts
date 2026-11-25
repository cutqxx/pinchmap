import { describe, expect, it, vi } from "vitest";
import type { NodeLink } from "../model";
import { openNodeLink } from "./linkOpener";
import type { LinkOpenerDeps } from "./linkOpener";

function makeDeps(options: { existingNote?: boolean; folderPath?: string } = {}) {
  const calls: string[] = [];
  const deps = {
    workspace: { openLinkText: vi.fn(async () => void calls.push("open")) },
    metadataCache: { getFirstLinkpathDest: vi.fn(() => (options.existingNote ? {} : null)) },
    vault: { create: vi.fn(async () => void calls.push("create")) },
    fileManager: { getNewFileParent: vi.fn(() => ({ path: options.folderPath ?? "/" })) },
    openExternal: vi.fn(),
  };
  return { deps: deps as unknown as LinkOpenerDeps, mocks: deps, calls };
}

const wiki = (target: string): NodeLink => ({ kind: "wiki", target, label: target });

describe("openNodeLink wiki links", () => {
  it("opens an existing note in a new tab from the map's path", async () => {
    const { deps, mocks } = makeDeps({ existingNote: true });
    await openNodeLink(deps, "maps/m.md", wiki("Note"));
    expect(mocks.workspace.openLinkText).toHaveBeenCalledWith("Note", "maps/m.md", "tab");
  });

  it("keeps the heading when opening", async () => {
    const { deps, mocks } = makeDeps({ existingNote: true });
    await openNodeLink(deps, "m.md", wiki("Note#Heading"));
    expect(mocks.workspace.openLinkText).toHaveBeenCalledWith("Note#Heading", "m.md", "tab");
  });

  it("does not recreate an existing note", async () => {
    const { deps, mocks } = makeDeps({ existingNote: true });
    await openNodeLink(deps, "m.md", wiki("Note"));
    expect(mocks.vault.create).not.toHaveBeenCalled();
  });

  it("looks the note up without its heading", async () => {
    const { deps, mocks } = makeDeps({ existingNote: true });
    await openNodeLink(deps, "m.md", wiki("Note#Heading"));
    expect(mocks.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith("Note", "m.md");
  });

  it("creates a missing note in the folder Obsidian picks, then opens it", async () => {
    const { deps, mocks, calls } = makeDeps({ folderPath: "inbox" });
    await openNodeLink(deps, "m.md", wiki("New idea"));
    expect(mocks.fileManager.getNewFileParent).toHaveBeenCalledWith("m.md", "New idea.md");
    expect(mocks.vault.create).toHaveBeenCalledWith("inbox/New idea.md", "");
    expect(calls).toEqual(["create", "open"]);
  });

  it("creates a missing note at the vault root without a leading slash", async () => {
    const { deps, mocks } = makeDeps({ folderPath: "/" });
    await openNodeLink(deps, "m.md", wiki("New"));
    expect(mocks.vault.create).toHaveBeenCalledWith("New.md", "");
  });

  it("creates the note without the heading and opens it on the heading", async () => {
    const { deps, mocks } = makeDeps();
    await openNodeLink(deps, "m.md", wiki("New#Part"));
    expect(mocks.vault.create).toHaveBeenCalledWith("New.md", "");
    expect(mocks.workspace.openLinkText).toHaveBeenCalledWith("New#Part", "m.md", "tab");
  });

  it("does not append .md twice", async () => {
    const { deps, mocks } = makeDeps();
    await openNodeLink(deps, "m.md", wiki("New.md"));
    expect(mocks.vault.create).toHaveBeenCalledWith("New.md", "");
  });

  it("opens a heading-only link without creating anything", async () => {
    const { deps, mocks } = makeDeps();
    await openNodeLink(deps, "m.md", wiki("#Heading"));
    expect(mocks.vault.create).not.toHaveBeenCalled();
    expect(mocks.workspace.openLinkText).toHaveBeenCalledWith("#Heading", "m.md", "tab");
  });
});

describe("openNodeLink external links", () => {
  it("opens the url in the browser and touches no notes", async () => {
    const { deps, mocks } = makeDeps();
    await openNodeLink(deps, "m.md", { kind: "external", target: "https://example.com", label: "x" });
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com");
    expect(mocks.workspace.openLinkText).not.toHaveBeenCalled();
    expect(mocks.vault.create).not.toHaveBeenCalled();
  });
});
