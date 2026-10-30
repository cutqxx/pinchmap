import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editor: { undo: vi.fn(), redo: vi.fn(), fitToScreen: vi.fn(), zoomStep: vi.fn() },
  scope: undefined as unknown,
}));

vi.mock("obsidian", () => {
  class TextFileView {
    contentEl = { classList: { add: vi.fn() }, ownerDocument: { defaultView: {} } };
    file = null;
    app = { vault: { on: vi.fn(), read: vi.fn() } };
    scope: unknown;
    constructor(public leaf: unknown) {
      this.scope = mocks.scope;
    }
    addAction(): { setAttribute(): void; getAttribute(): null; classList: { add(): void } } {
      return { setAttribute() {}, getAttribute: () => null, classList: { add() {} } };
    }
    registerEvent(): void {}
  }
  return { TextFileView, Notice: vi.fn() };
});

vi.mock("../editor", () => ({ MapEditor: vi.fn().mockImplementation(function () { return mocks.editor; }) }));
vi.mock("./visibleArea", () => ({ createVisibleAreaSource: () => ({}) }));

import { MapView } from "./mapView";

type Handler = () => unknown;

function scopeRecordingHandlers(): { registered: Map<string, Handler>; scope: unknown } {
  const registered = new Map<string, Handler>();
  const scope = {
    register: (modifiers: string[], key: string, handler: Handler) => {
      registered.set(`${[...modifiers].sort().join("+")}+${key}`, handler);
    },
  };
  return { registered, scope };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "en" } });
  Object.values(mocks.editor).forEach((fn) => fn.mockClear());
  mocks.scope = undefined;
});

describe("MapView zoom hotkeys", () => {
  it("wires the view scope hotkeys to the editor", () => {
    const { registered, scope } = scopeRecordingHandlers();
    mocks.scope = scope;

    new MapView({} as never, 0.5);
    registered.get("Mod+0")?.();
    registered.get("Mod+=")?.();
    registered.get("Mod+-")?.();

    expect(mocks.editor.fitToScreen).toHaveBeenCalledTimes(1);
    expect(mocks.editor.zoomStep.mock.calls).toEqual([["in"], ["out"]]);
  });

  it("registers all six chords on the view scope", () => {
    const { registered, scope } = scopeRecordingHandlers();
    mocks.scope = scope;

    new MapView({} as never, 0.5);

    expect([...registered.keys()].sort()).toEqual(["Mod++", "Mod+-", "Mod+0", "Mod+=", "Mod+Shift++", "Mod+d"].sort());
  });

  it("opens without error when the view has no scope", () => {
    expect(() => new MapView({} as never, 0.5)).not.toThrow();
  });
});
