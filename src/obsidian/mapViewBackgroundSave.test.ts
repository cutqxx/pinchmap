import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapHost } from "../editor";


const mocks = vi.hoisted(() => ({
  editor: { commitPendingEdit: vi.fn(), isEditingText: vi.fn(() => false) },
  host: null as unknown,
  save: vi.fn<() => Promise<void>>(),
  notice: vi.fn(),
  doc: { visibilityState: "visible", defaultView: {} as object } as { visibilityState: string; defaultView: object },
  listeners: [] as { target: unknown; type: string; callback: () => void }[],
}));

vi.mock("obsidian", () => {
  class TextFileView {
    contentEl = { classList: { add: vi.fn() }, ownerDocument: mocks.doc };
    file = null;
    app = { vault: { on: vi.fn(), read: vi.fn() } };
    constructor(public leaf: unknown) {}
    addAction(): { setAttribute(): void; classList: { add(): void } } {
      return { setAttribute() {}, classList: { add() {} } };
    }
    registerEvent(): void {}
    registerDomEvent(target: unknown, type: string, callback: () => void): void {
      mocks.listeners.push({ target, type, callback });
    }
    save(): Promise<void> {
      return mocks.save();
    }
  }
  return { TextFileView, Notice: mocks.notice };
});

vi.mock("../editor", () => ({
  MapEditor: vi.fn().mockImplementation(function (options: { host: MapHost }) {
    mocks.host = options.host;
    return mocks.editor;
  }),
}));

vi.mock("./visibleArea", () => ({ createVisibleAreaSource: () => ({}) }));

import { MapView } from "./mapView";

const AUTOSAVE_DELAY_MS = 1000;

function fire(target: unknown, type: string): void {
  const matching = mocks.listeners.filter((listener) => listener.target === target && listener.type === type);
  if (matching.length === 0) throw new Error(`no ${type} listener on the target`);
  matching.forEach((listener) => listener.callback());
}

function editMap(): void {
  (mocks.host as MapHost).onMapChanged();
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { localStorage: { getItem: () => "en" } });
  mocks.listeners.length = 0;
  mocks.doc.visibilityState = "visible";
  mocks.doc.defaultView = {};
  mocks.editor.commitPendingEdit.mockReset();
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.notice.mockReset();
  new MapView({} as never, 0.5);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MapView when the app goes to the background", () => {
  it("commits the open text edit and saves at once when the page becomes hidden", async () => {
    mocks.editor.commitPendingEdit.mockImplementation(editMap);
    mocks.doc.visibilityState = "hidden";

    fire(mocks.doc, "visibilitychange");
    await settle();

    expect(mocks.editor.commitPendingEdit).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("commits the edit before it flushes the save", async () => {
    const order: string[] = [];
    mocks.editor.commitPendingEdit.mockImplementation(() => {
      order.push("commit");
      editMap();
    });
    mocks.save.mockImplementation(() => {
      order.push("save");
      return Promise.resolve();
    });
    mocks.doc.visibilityState = "hidden";

    fire(mocks.doc, "visibilitychange");
    await settle();

    expect(order).toEqual(["commit", "save"]);
  });

  it("saves a pending autosave at once without waiting for the timer", async () => {
    editMap();
    mocks.doc.visibilityState = "hidden";

    fire(mocks.doc, "visibilitychange");
    await settle();

    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("does not save a second time when the timer would have fired later", async () => {
    editMap();
    mocks.doc.visibilityState = "hidden";
    fire(mocks.doc, "visibilitychange");

    await vi.advanceTimersByTimeAsync(5 * AUTOSAVE_DELAY_MS);

    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the page becomes visible", async () => {
    editMap();
    mocks.doc.visibilityState = "visible";

    fire(mocks.doc, "visibilitychange");
    await settle();

    expect(mocks.editor.commitPendingEdit).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("commits and saves on pagehide of the window", async () => {
    mocks.editor.commitPendingEdit.mockImplementation(editMap);

    fire(mocks.doc.defaultView, "pagehide");
    await settle();

    expect(mocks.editor.commitPendingEdit).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("commits the edit but saves nothing when nothing changed", async () => {
    mocks.doc.visibilityState = "hidden";

    fire(mocks.doc, "visibilitychange");
    await settle();

    expect(mocks.editor.commitPendingEdit).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("tries again after the delay when the save at hide time fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    editMap();
    mocks.doc.visibilityState = "hidden";

    fire(mocks.doc, "visibilitychange");
    await settle();
    expect(mocks.save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(mocks.save).toHaveBeenCalledTimes(2);
  });

  it("does not show a notice for a failed save at hide time that is only retried", async () => {
    mocks.save.mockRejectedValueOnce(new Error("offline"));
    editMap();
    mocks.doc.visibilityState = "hidden";

    fire(mocks.doc, "visibilitychange");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(mocks.notice).not.toHaveBeenCalled();
  });
});

describe("MapView when autosave fails", () => {
  it("tells the user once that the map could not be saved, with the reason", async () => {
    mocks.save.mockRejectedValue(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    editMap();

    await vi.advanceTimersByTimeAsync(5 * AUTOSAVE_DELAY_MS);

    expect(mocks.notice).toHaveBeenCalledTimes(1);
    expect(mocks.notice).toHaveBeenCalledWith(
      "Pinchmap: the map could not be saved. Your changes are kept and saving is retried. (disk full)",
    );
  });

  it("keeps retrying every second while it fails", async () => {
    mocks.save.mockRejectedValue(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    editMap();

    await vi.advanceTimersByTimeAsync(4 * AUTOSAVE_DELAY_MS);

    expect(mocks.save).toHaveBeenCalledTimes(4);
  });

  it("describes a non-Error failure by its text", async () => {
    mocks.save.mockRejectedValue("quota exceeded");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    editMap();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(mocks.notice).toHaveBeenCalledWith(expect.stringContaining("(quota exceeded)"));
  });

  it("tells the user again when a later failure follows a successful save", async () => {
    mocks.save.mockRejectedValueOnce(new Error("first")).mockResolvedValueOnce(undefined).mockRejectedValue(new Error("second"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    editMap();
    await vi.advanceTimersByTimeAsync(2 * AUTOSAVE_DELAY_MS);

    editMap();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(mocks.notice).toHaveBeenCalledTimes(2);
  });

  it("logs the failure to the console", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("disk full");
    mocks.save.mockRejectedValue(failure);
    editMap();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    expect(consoleError).toHaveBeenCalledWith("Pinchmap: autosave failed", failure);
  });
});

