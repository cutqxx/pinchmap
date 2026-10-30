import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MapHost } from "../editor";

interface FakeAction {
  attributes: Map<string, string>;
  classes: Set<string>;
  icon: string;
  title: string;
  click(): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  classList: { add(name: string): void };
}

const mocks = vi.hoisted(() => ({
  actions: [] as unknown[],
  editor: { undo: vi.fn(), redo: vi.fn() },
  host: null as unknown,
}));

vi.mock("obsidian", () => {
  class TextFileView {
    contentEl = { classList: { add: vi.fn() }, ownerDocument: { defaultView: {} } };
    file = null;
    app = { vault: { on: vi.fn(), read: vi.fn() } };
    constructor(public leaf: unknown) {}
    addAction(icon: string, title: string, callback: () => void): FakeAction {
      const attributes = new Map<string, string>();
      const classes = new Set<string>();
      const action: FakeAction = {
        attributes,
        classes,
        icon,
        title,
        click: callback,
        setAttribute: (name, value) => void attributes.set(name, value),
        getAttribute: (name) => attributes.get(name) ?? null,
        classList: { add: (name) => void classes.add(name) },
      };
      mocks.actions.push(action);
      return action;
    }
    registerEvent(): void {}
    registerDomEvent(): void {}
  }
  return { TextFileView, Notice: vi.fn() };
});

vi.mock("../editor", () => ({
  MapEditor: vi.fn().mockImplementation(function (options: { host: MapHost }) {
    mocks.host = options.host;
    return mocks.editor;
  }),
}));

vi.mock("./visibleArea", () => ({ createVisibleAreaSource: () => ({}) }));

import { MapView } from "./mapView";

function actionTitled(title: string): FakeAction {
  const action = (mocks.actions as FakeAction[]).find((candidate) => candidate.title === title);
  if (action === undefined) throw new Error(`no header action titled ${title}`);
  return action;
}

function reportHistory(canUndo: boolean, canRedo: boolean): void {
  (mocks.host as MapHost).onHistoryChanged?.(canUndo, canRedo);
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: { getItem: () => "en" } });
  mocks.actions.length = 0;
  mocks.editor.undo.mockClear();
  mocks.editor.redo.mockClear();
  new MapView({} as never, 0.5);
});

describe("MapView undo and redo header actions", () => {
  it("adds an Undo and a Redo action with their labels", () => {
    expect((mocks.actions as FakeAction[]).map((action) => action.title).sort()).toEqual(["Redo", "Undo"]);
  });

  it("starts with both actions disabled", () => {
    expect([actionTitled("Undo"), actionTitled("Redo")].map((a) => a.getAttribute("aria-disabled"))).toEqual([
      "true",
      "true",
    ]);
  });

  it("enables only Undo when there is something to undo", () => {
    reportHistory(true, false);

    expect([actionTitled("Undo"), actionTitled("Redo")].map((a) => a.getAttribute("aria-disabled"))).toEqual([
      "false",
      "true",
    ]);
  });

  it("enables only Redo when there is something to redo", () => {
    reportHistory(false, true);

    expect([actionTitled("Undo"), actionTitled("Redo")].map((a) => a.getAttribute("aria-disabled"))).toEqual([
      "true",
      "false",
    ]);
  });

  it("disables an action again when its history runs out", () => {
    reportHistory(true, true);

    reportHistory(false, false);

    expect([actionTitled("Undo"), actionTitled("Redo")].map((a) => a.getAttribute("aria-disabled"))).toEqual([
      "true",
      "true",
    ]);
  });

  it("undoes when the enabled Undo action is clicked", () => {
    reportHistory(true, false);

    actionTitled("Undo").click();

    expect(mocks.editor.undo).toHaveBeenCalledTimes(1);
  });

  it("redoes when the enabled Redo action is clicked", () => {
    reportHistory(false, true);

    actionTitled("Redo").click();

    expect(mocks.editor.redo).toHaveBeenCalledTimes(1);
  });

  it("ignores a click on a disabled Undo action", () => {
    actionTitled("Undo").click();

    expect(mocks.editor.undo).not.toHaveBeenCalled();
  });

  it("ignores a click on a disabled Redo action", () => {
    reportHistory(true, false);

    actionTitled("Redo").click();

    expect(mocks.editor.redo).not.toHaveBeenCalled();
  });

  it("marks both actions with the history style class", () => {
    expect([actionTitled("Undo"), actionTitled("Redo")].map((a) => a.classes.has("pinchmap-history-action"))).toEqual([
      true,
      true,
    ]);
  });
});
