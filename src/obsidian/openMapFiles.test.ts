import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  class FakeTFile {
    extension = "md";
    constructor(public path: string) {}
  }
  class FakeWorkspaceLeaf {
    static prototypeSetViewState = vi.fn<(viewState: unknown, eState?: unknown) => Promise<void>>(async () => {});
    async setViewState(viewState: unknown, eState?: unknown): Promise<void> {
      await FakeWorkspaceLeaf.prototypeSetViewState(viewState, eState);
    }
  }
  return { FakeTFile, FakeWorkspaceLeaf };
});

vi.mock("obsidian", () => ({ TFile: fakes.FakeTFile, WorkspaceLeaf: fakes.FakeWorkspaceLeaf }));
vi.mock("./mapView", () => ({ MAP_VIEW_TYPE: "pinchmap-view" }));

import type { WorkspaceLeaf } from "obsidian";
import { MapFileOpener } from "./openMapFiles";

const { FakeTFile, FakeWorkspaceLeaf } = fakes;
const MAP_PATH = "map.md";

function createOpener(): MapFileOpener {
  const file = new FakeTFile(MAP_PATH);
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (path === MAP_PATH ? file : null),
      cachedRead: async () => "---\nmindmap: true\n---\n- a ^aaaaaa\n",
    },
    workspace: { setActiveLeaf: vi.fn() },
  };
  return new MapFileOpener(app as never);
}

function appliedViewTypes(): unknown[] {
  return FakeWorkspaceLeaf.prototypeSetViewState.mock.calls.map(([viewState]) => (viewState as { type: string }).type);
}

describe("MapFileOpener", () => {
  let leaf: WorkspaceLeaf;
  let opener: MapFileOpener;
  let uninstall: () => void;

  beforeEach(() => {
    FakeWorkspaceLeaf.prototypeSetViewState.mockClear();
    leaf = new FakeWorkspaceLeaf() as unknown as WorkspaceLeaf;
    opener = createOpener();
    uninstall = opener.install();
  });

  afterEach(() => uninstall());

  async function openMarkdownViewState(): Promise<void> {
    await leaf.setViewState({ type: "markdown", state: { file: MAP_PATH } });
  }

  it("switches a markdown view state of a map file to the map view", async () => {
    await openMarkdownViewState();

    expect(appliedViewTypes()).toEqual(["pinchmap-view"]);
  });

  it("keeps the markdown view after openAsMarkdown for the same path", async () => {
    await opener.openAsMarkdown(leaf, MAP_PATH);
    await openMarkdownViewState();

    expect(appliedViewTypes()).toEqual(["markdown", "markdown"]);
  });

  it("switches a later markdown view state to the map view after openAsMarkdown then openAsMap", async () => {
    await opener.openAsMarkdown(leaf, MAP_PATH);
    await opener.openAsMap(leaf, MAP_PATH);
    FakeWorkspaceLeaf.prototypeSetViewState.mockClear();

    await openMarkdownViewState();

    expect(appliedViewTypes()).toEqual(["pinchmap-view"]);
  });
});
