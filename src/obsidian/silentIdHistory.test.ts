// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapEditor } from "../editor";
import { parseMapFile, serializeMapFile } from "../format";

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

const FILE_WITHOUT_IDS = ["---", "mindmap: true", "---", "- Alpha", "\t- Beta", "- Gamma", ""].join("\n");

let container: HTMLElement;
let editor: MapEditor;
let reports: [boolean, boolean][];
let onMapChanged: () => void;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  reports = [];
  onMapChanged = vi.fn();
  const pendingFrames: (() => void)[] = [];
  editor = new MapEditor({
    container,
    requestFrame: (callback) => pendingFrames.push(callback),
    host: {
      onMapChanged: () => onMapChanged(),
      onHistoryChanged: (canUndo, canRedo) => reports.push([canUndo, canRedo]),
      onTextEditEnded: () => undefined,
      showMenu: () => undefined,
      notify: () => undefined,
    },
  });
});

afterEach(() => {
  editor.destroy();
  container.remove();
  vi.unstubAllGlobals();
});

function listLinesWithoutIds(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /^\s*- /.test(line))
    .map((line) => line.replace(/ \^[a-z0-9]+$/, ""));
}

function editFirstRootText(text: string): void {
  const [firstRootId] = editor.getMap().rootIds;
  editor.beginEditingNode(firstRootId ?? "");
  const input = container.querySelector("textarea");
  if (input === null) throw new Error("no text input is open");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  editor.commitPendingEdit();
}

describe("opening a file without ids", () => {
  it("starts with an empty history because the ids are added silently", () => {
    editor.loadMap(parseMapFile(FILE_WITHOUT_IDS).map);

    editor.undo();

    expect(reports).toEqual([[false, false]]);
    expect(onMapChanged).not.toHaveBeenCalled();
  });

  it("returns to the original text with a single undo after one edit", () => {
    const parsed = parseMapFile(FILE_WITHOUT_IDS);
    editor.loadMap(parsed.map);
    editFirstRootText("Changed");
    serializeMapFile(editor.getMap(), parsed.source);

    editor.undo();

    expect(listLinesWithoutIds(serializeMapFile(editor.getMap(), parsed.source))).toEqual([
      "- Alpha",
      "\t- Beta",
      "- Gamma",
    ]);
    expect(reports[reports.length - 1]).toEqual([false, true]);
  });

  it("counts only the edit as a history step", () => {
    const parsed = parseMapFile(FILE_WITHOUT_IDS);
    editor.loadMap(parsed.map);

    editFirstRootText("Changed");

    expect(reports[reports.length - 1]).toEqual([true, false]);
  });
});
