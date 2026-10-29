// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  class FakeTFile {
    extension = "md";
    constructor(
      public path: string,
      public basename: string = path.replace(/^.*\//, "").replace(/\.md$/, ""),
    ) {}
  }
  class FakeFolder {
    constructor(
      public path: string,
      public children: unknown[] = [],
    ) {}
    isRoot(): boolean {
      return this.path === "/";
    }
  }
  class FakeMarkdownView {
    save = vi.fn(async () => {});
    constructor(
      public file: FakeTFile | null,
      public leaf: unknown = {},
    ) {}
  }
  class FakeMapView {
    beginEditingFirstRoot = vi.fn();
  }
  return { FakeTFile, FakeFolder, FakeMarkdownView, FakeMapView };
});

vi.mock("obsidian", () => ({ MarkdownView: fakes.FakeMarkdownView, TFile: fakes.FakeTFile }));
vi.mock("./mapView", () => ({ MapView: fakes.FakeMapView }));

import { parseMapFile } from "../format";
import { MapNotes, isMapNote } from "./mapNotes";

const { FakeTFile, FakeFolder, FakeMarkdownView, FakeMapView } = fakes;

interface Setup {
  notes: MapNotes;
  openAsMap: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  files: Map<string, string>;
  leaf: { view: unknown };
  frontmatterByPath: Map<string, Record<string, unknown>>;
  setActiveView: (view: unknown) => void;
  setFolder: (folder: unknown) => void;
}

function setup(): Setup {
  const files = new Map<string, string>();
  const frontmatterByPath = new Map<string, Record<string, unknown>>();
  const leaf: { view: unknown } = { view: new FakeMapView() };
  let activeView: unknown = null;
  let folder: unknown = new FakeFolder("/");
  const create = vi.fn(async (path: string, text: string) => {
    files.set(path, text);
    return new FakeTFile(path);
  });
  const openAsMap = vi.fn(async () => {});
  const app = {
    metadataCache: { getFileCache: (file: { path: string }) => ({ frontmatter: frontmatterByPath.get(file.path) }) },
    fileManager: { getNewFileParent: () => folder },
    workspace: { getActiveFile: () => null, getActiveViewOfType: () => activeView, getLeaf: () => leaf },
    vault: {
      create,
      process: async (file: { path: string }, fn: (text: string) => string) => {
        files.set(file.path, fn(files.get(file.path) ?? ""));
      },
    },
  };
  const notes = new MapNotes(app as never, { openAsMap } as never);
  return {
    notes,
    openAsMap,
    create,
    files,
    leaf,
    frontmatterByPath,
    setActiveView: (view) => (activeView = view),
    setFolder: (value) => (folder = value),
  };
}

let env: Setup;
beforeEach(() => {
  localStorage.setItem("language", "en");
  env = setup();
});

describe("isMapNote", () => {
  it("is true only when the cached frontmatter has mindmap: true", () => {
    env.frontmatterByPath.set("a.md", { mindmap: true });
    env.frontmatterByPath.set("b.md", { mindmap: false });
    env.frontmatterByPath.set("c.md", { mindmap: "true" });
    const app = { metadataCache: { getFileCache: (file: { path: string }) => ({ frontmatter: env.frontmatterByPath.get(file.path) }) } };

    const results = ["a.md", "b.md", "c.md", "none.md"].map((path) => isMapNote(app as never, new FakeTFile(path) as never));

    expect(results).toEqual([true, false, false, false]);
  });
});

describe("MapNotes.createNewMap", () => {
  it("creates Untitled.md in the root folder with a flagged one-root map", async () => {
    await env.notes.createNewMap();

    expect([...env.files.keys()]).toEqual(["Untitled.md"]);
    const text = env.files.get("Untitled.md") ?? "";
    expect(text.startsWith("---\nmindmap: true\n---\n")).toBe(true);
    expect(parseMapFile(text).map.rootIds).toHaveLength(1);
  });

  it("creates the file inside the folder for new notes", async () => {
    env.setFolder(new FakeFolder("Inbox/Maps"));

    await env.notes.createNewMap();

    expect([...env.files.keys()]).toEqual(["Inbox/Maps/Untitled.md"]);
  });

  it("numbers the name when Untitled is taken in that folder", async () => {
    env.setFolder(new FakeFolder("Maps", [new FakeTFile("Maps/Untitled.md"), new FakeTFile("Maps/Untitled 1.md")]));

    await env.notes.createNewMap();

    expect([...env.files.keys()]).toEqual(["Maps/Untitled 2.md"]);
  });

  it("ignores non-markdown files and other folders when picking the name", async () => {
    const image = new FakeTFile("Untitled.png", "Untitled");
    image.extension = "png";
    env.setFolder(new FakeFolder("/", [image, new FakeFolder("Untitled")]));

    await env.notes.createNewMap();

    expect([...env.files.keys()]).toEqual(["Untitled.md"]);
  });

  it("uses the Russian name when Obsidian is in Russian", async () => {
    localStorage.setItem("language", "ru");

    await env.notes.createNewMap();

    expect([...env.files.keys()]).toEqual(["Без названия.md"]);
  });

  it("opens the new file as a map and starts editing its first root", async () => {
    await env.notes.createNewMap();

    expect(env.openAsMap).toHaveBeenCalledWith(env.leaf, "Untitled.md");
    expect((env.leaf.view as InstanceType<typeof FakeMapView>).beginEditingFirstRoot).toHaveBeenCalledTimes(1);
  });

  it("does not try to edit when the leaf did not become a map view", async () => {
    const other = { beginEditingFirstRoot: vi.fn() };
    env.leaf.view = other;

    await env.notes.createNewMap();

    expect(other.beginEditingFirstRoot).not.toHaveBeenCalled();
  });
});

describe("MapNotes command targets", () => {
  it("offers conversion for a plain note", () => {
    const view = new FakeMarkdownView(new FakeTFile("plain.md"));
    env.setActiveView(view);

    expect(env.notes.findConvertibleView()).toBe(view);
    expect(env.notes.findMapNoteView()).toBeNull();
  });

  it("does not offer conversion for a note with mindmap: true", () => {
    env.frontmatterByPath.set("map.md", { mindmap: true });
    env.setActiveView(new FakeMarkdownView(new FakeTFile("map.md")));

    expect(env.notes.findConvertibleView()).toBeNull();
  });

  it("offers open-as-map for a note with mindmap: true", () => {
    env.frontmatterByPath.set("map.md", { mindmap: true });
    const view = new FakeMarkdownView(new FakeTFile("map.md"));
    env.setActiveView(view);

    expect(env.notes.findMapNoteView()).toBe(view);
  });

  it("offers neither when there is no active markdown view", () => {
    env.setActiveView(null);

    expect(env.notes.findConvertibleView()).toBeNull();
    expect(env.notes.findMapNoteView()).toBeNull();
  });

  it("offers neither for a markdown view without a file", () => {
    env.setActiveView(new FakeMarkdownView(null));

    expect(env.notes.findConvertibleView()).toBeNull();
    expect(env.notes.findMapNoteView()).toBeNull();
  });
});

describe("MapNotes.convertToMap", () => {
  it("saves the view, rewrites the note as a map named after it and opens it as a map", async () => {
    const file = new FakeTFile("Trips/Rome.md");
    const view = new FakeMarkdownView(file);
    env.files.set(file.path, "Visit soon\n");

    await env.notes.convertToMap(view as never);

    expect(view.save).toHaveBeenCalledTimes(1);
    const text = env.files.get(file.path) ?? "";
    expect(text).toMatch(/^---\nmindmap: true\n---\nVisit soon\n\n- Rome \^[a-z0-9]{6}\n$/);
    expect(env.openAsMap).toHaveBeenCalledWith(view.leaf, "Trips/Rome.md");
  });

  it("does nothing for a view without a file", async () => {
    const view = new FakeMarkdownView(null);

    await env.notes.convertToMap(view as never);

    expect(view.save).not.toHaveBeenCalled();
    expect(env.openAsMap).not.toHaveBeenCalled();
  });
});

describe("MapNotes.openAsMap", () => {
  it("opens the view's file as a map in the same leaf", async () => {
    const view = new FakeMarkdownView(new FakeTFile("map.md"));

    await env.notes.openAsMap(view as never);

    expect(env.openAsMap).toHaveBeenCalledWith(view.leaf, "map.md");
  });

  it("does nothing for a view without a file", async () => {
    await env.notes.openAsMap(new FakeMarkdownView(null) as never);

    expect(env.openAsMap).not.toHaveBeenCalled();
  });
});
