import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  interface FakeItem {
    title: string;
    click: () => void;
  }
  const shown: { items: FakeItem[]; at: { x: number; y: number } }[] = [];
  class FakeMenu {
    items: FakeItem[] = [];
    addItem(configure: (item: unknown) => void): this {
      const entry: FakeItem = { title: "", click: () => undefined };
      const item = {
        setTitle(title: string) {
          entry.title = title;
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
