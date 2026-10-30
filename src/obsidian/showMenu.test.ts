import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  interface FakeItem {
    title: string;
    checked: boolean | undefined;
    click: () => void;
  }
  const shown: { items: FakeItem[]; at: { x: number; y: number } }[] = [];
  class FakeMenu {
    items: FakeItem[] = [];
    addItem(configure: (item: unknown) => void): this {
      const entry: FakeItem = { title: "", checked: undefined, click: () => undefined };
      const item = {
        setTitle(title: string) {
          entry.title = title;
          return item;
        },
        setChecked(checked: boolean) {
          entry.checked = checked;
          return item;
        },
        onClick(handler: () => void) {
          entry.click = handler;
          return item;
        },
      };
      configure(item);
      this.items.push(entry);
      return this;
    }
    showAtPosition(at: { x: number; y: number }): void {
      shown.push({ items: this.items, at });
    }
  }
  return { FakeMenu, shown };
});

vi.mock("obsidian", () => ({ Menu: fakes.FakeMenu }));

import { showObsidianMenu } from "./showMenu";

beforeEach(() => {
  fakes.shown.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("showObsidianMenu", () => {
  it("shows one menu at the given screen point", () => {
    showObsidianMenu([{ label: "Add node", onSelect: () => undefined }], { x: 150, y: 260 });

    expect(fakes.shown).toHaveLength(1);
    expect(fakes.shown[0]?.at).toEqual({ x: 150, y: 260 });
  });

  it("lists every entry under its label in order", () => {
    showObsidianMenu(
      [
        { label: "First", onSelect: () => undefined },
        { label: "Second", onSelect: () => undefined },
      ],
      { x: 0, y: 0 },
    );

    expect(fakes.shown[0]?.items.map((item) => item.title)).toEqual(["First", "Second"]);
  });

  it("runs the entry's onSelect only for the chosen item", () => {
    const first = vi.fn();
    const second = vi.fn();
    showObsidianMenu(
      [
        { label: "First", onSelect: first },
        { label: "Second", onSelect: second },
      ],
      { x: 0, y: 0 },
    );

    fakes.shown[0]?.items[1]?.click();

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe("showObsidianMenu checked state", () => {
  it("marks entries by their isChecked value", () => {
    showObsidianMenu(
      [
        { label: "On", isChecked: true, onSelect: () => undefined },
        { label: "Off", isChecked: false, onSelect: () => undefined },
      ],
      { x: 0, y: 0 },
    );

    expect(fakes.shown[0]?.items.map((item) => item.checked)).toEqual([true, false]);
  });

  it("leaves entries without isChecked unmarked", () => {
    showObsidianMenu([{ label: "Plain", onSelect: () => undefined }], { x: 0, y: 0 });

    expect(fakes.shown[0]?.items[0]?.checked).toBeUndefined();
  });
});

describe("showObsidianMenu submenu", () => {
  const SUBMENU = [
    { label: "Red", isChecked: true, onSelect: vi.fn() },
    { label: "None", isChecked: false, onSelect: vi.fn() },
  ];
  const WITH_SUBMENU = [{ label: "Color", onSelect: vi.fn(), submenu: SUBMENU }];

  it("opens the submenu as a second menu at the same position after the click handler returns", () => {
    showObsidianMenu(WITH_SUBMENU, { x: 40, y: 50 });

    fakes.shown[0]?.items[0]?.click();
    expect(fakes.shown).toHaveLength(1);
    vi.runAllTimers();

    expect(fakes.shown).toHaveLength(2);
    expect(fakes.shown[1]?.at).toEqual({ x: 40, y: 50 });
    expect(fakes.shown[1]?.items.map((item) => item.title)).toEqual(["Red", "None"]);
  });

  it("does not run the parent entry's onSelect when opening the submenu", () => {
    showObsidianMenu(WITH_SUBMENU, { x: 0, y: 0 });

    fakes.shown[0]?.items[0]?.click();
    vi.runAllTimers();

    expect(WITH_SUBMENU[0]?.onSelect).not.toHaveBeenCalled();
  });

  it("runs the chosen submenu entry's onSelect", () => {
    showObsidianMenu(WITH_SUBMENU, { x: 0, y: 0 });
    fakes.shown[0]?.items[0]?.click();
    vi.runAllTimers();

    fakes.shown[1]?.items[1]?.click();

    expect(SUBMENU[1]?.onSelect).toHaveBeenCalledTimes(1);
  });
});
