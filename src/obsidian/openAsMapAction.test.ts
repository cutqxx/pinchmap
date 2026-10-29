// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { MarkdownView } from "obsidian";

const fakes = vi.hoisted(() => {
  class FakeTFile {
    constructor(public path: string) {}
  }
  class FakeMarkdownView {
    actions: { icon: string; title: string; onClick: () => void; element: { remove: ReturnType<typeof vi.fn> } }[] = [];
    constructor(public file: FakeTFile | null) {}
    addAction(icon: string, title: string, onClick: () => void) {
      const element = { remove: vi.fn() };
      this.actions.push({ icon, title, onClick, element });
      return element;
    }
  }
  return { FakeTFile, FakeMarkdownView };
});

vi.mock("obsidian", () => ({ MarkdownView: fakes.FakeMarkdownView, TFile: fakes.FakeTFile }));
vi.mock("./mapView", () => ({ MapView: class {} }));

import { OpenAsMapActions } from "./openAsMapAction";

const { FakeTFile, FakeMarkdownView } = fakes;

let frontmatterByPath: Map<string, Record<string, unknown>>;
let leaves: { view: unknown }[];
let openAsMap: Mock<(view: unknown) => void>;
let actions: OpenAsMapActions;

function markdownView(path: string | null): InstanceType<typeof FakeMarkdownView> {
  const view = new FakeMarkdownView(path === null ? null : new FakeTFile(path));
  leaves.push({ view });
  return view;
}

beforeEach(() => {
  localStorage.setItem("language", "en");
  frontmatterByPath = new Map();
  leaves = [];
  openAsMap = vi.fn();
  const app = {
    metadataCache: { getFileCache: (file: { path: string }) => ({ frontmatter: frontmatterByPath.get(file.path) }) },
    workspace: { getLeavesOfType: () => leaves },
  };
  actions = new OpenAsMapActions(app as never, openAsMap as unknown as (view: MarkdownView) => void);
});

describe("OpenAsMapActions.refresh", () => {
  it("adds one labelled button to a view of a mindmap: true file", () => {
    frontmatterByPath.set("map.md", { mindmap: true });
    const view = markdownView("map.md");

    actions.refresh();

    expect(view.actions).toHaveLength(1);
    expect(view.actions[0]?.title).toBe("Open as map");
  });

  it("labels the button in Russian when Obsidian is in Russian", () => {
    localStorage.setItem("language", "ru");
    frontmatterByPath.set("map.md", { mindmap: true });
    const view = markdownView("map.md");

    actions.refresh();

    expect(view.actions[0]?.title).toBe("Открыть как карту");
  });

  it("runs the open-as-map callback with the view when the button is clicked", () => {
    frontmatterByPath.set("map.md", { mindmap: true });
    const view = markdownView("map.md");
    actions.refresh();

    view.actions[0]?.onClick();

    expect(openAsMap).toHaveBeenCalledWith(view);
  });

  it("adds no button to a plain note", () => {
    const view = markdownView("plain.md");

    actions.refresh();

    expect(view.actions).toEqual([]);
  });

  it("adds no button when mindmap is not true", () => {
    frontmatterByPath.set("off.md", { mindmap: false });
    const view = markdownView("off.md");

    actions.refresh();

    expect(view.actions).toEqual([]);
  });

  it("adds no button to a view without a file", () => {
    const view = markdownView(null);

    actions.refresh();

    expect(view.actions).toEqual([]);
  });

  it("does not duplicate the button on repeated refreshes", () => {
    frontmatterByPath.set("map.md", { mindmap: true });
    const view = markdownView("map.md");

    actions.refresh();
    actions.refresh();
    actions.refresh();

    expect(view.actions).toHaveLength(1);
  });

  it("removes the button once the file no longer has the flag", () => {
    frontmatterByPath.set("map.md", { mindmap: true });
    const view = markdownView("map.md");
    actions.refresh();

    frontmatterByPath.set("map.md", { mindmap: false });
    actions.refresh();

    expect(view.actions[0]?.element.remove).toHaveBeenCalledTimes(1);
  });

  it("adds the button again after it was removed and the flag returned", () => {
    frontmatterByPath.set("map.md", { mindmap: true });
    const view = markdownView("map.md");
    actions.refresh();
    frontmatterByPath.set("map.md", { mindmap: false });
    actions.refresh();

    frontmatterByPath.set("map.md", { mindmap: true });
    actions.refresh();

    expect(view.actions).toHaveLength(2);
  });

  it("handles several views independently", () => {
    frontmatterByPath.set("map.md", { mindmap: true });
    const mapView = markdownView("map.md");
    const plainView = markdownView("plain.md");

    actions.refresh();

    expect(mapView.actions).toHaveLength(1);
    expect(plainView.actions).toHaveLength(0);
  });

  it("skips leaves that are not markdown views", () => {
    leaves.push({ view: {} });

    expect(() => actions.refresh()).not.toThrow();
  });
});

describe("OpenAsMapActions.removeAll", () => {
  it("removes every added button", () => {
    frontmatterByPath.set("a.md", { mindmap: true });
    frontmatterByPath.set("b.md", { mindmap: true });
    const first = markdownView("a.md");
    const second = markdownView("b.md");
    actions.refresh();

    actions.removeAll();

    expect(first.actions[0]?.element.remove).toHaveBeenCalledTimes(1);
    expect(second.actions[0]?.element.remove).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh button to be added by the next refresh", () => {
    frontmatterByPath.set("map.md", { mindmap: true });
    const view = markdownView("map.md");
    actions.refresh();
    actions.removeAll();

    actions.refresh();

    expect(view.actions).toHaveLength(2);
  });

  it("does nothing for views that never had a button", () => {
    const view = markdownView("plain.md");

    expect(() => actions.removeAll()).not.toThrow();
    expect(view.actions).toEqual([]);
  });
});
