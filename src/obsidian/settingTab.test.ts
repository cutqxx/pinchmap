// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  interface Captured {
    name: string;
    desc: string;
    initialValue: string;
    change: (input: string) => Promise<void> | void;
  }
  const settings: Captured[] = [];
  class FakePluginSettingTab {
    containerEl = { empty: vi.fn() };
    constructor(
      public app: unknown,
      public plugin: unknown,
    ) {}
  }
  class FakeSetting {
    private readonly captured: Captured = { name: "", desc: "", initialValue: "", change: () => undefined };
    constructor(public containerEl: unknown) {
      settings.push(this.captured);
    }
    setName(name: string): this {
      this.captured.name = name;
      return this;
    }
    setDesc(desc: string): this {
      this.captured.desc = desc;
      return this;
    }
    addText(configure: (text: unknown) => void): this {
      const text = {
        setValue: (value: string) => {
          this.captured.initialValue = value;
          return text;
        },
        onChange: (handler: (input: string) => Promise<void> | void) => {
          this.captured.change = handler;
          return text;
        },
      };
      configure(text);
      return this;
    }
  }
  return { FakePluginSettingTab, FakeSetting, settings };
});

vi.mock("obsidian", () => ({ PluginSettingTab: fakes.FakePluginSettingTab, Setting: fakes.FakeSetting }));

import type { App, Plugin } from "obsidian";
import { PinchmapSettingTab } from "./settingTab";

let seconds: number;
let setLongPressSeconds: ReturnType<typeof vi.fn<(value: number) => Promise<void>>>;

beforeEach(() => {
  fakes.settings.length = 0;
  window.localStorage.setItem("language", "ru");
  seconds = 0.5;
  setLongPressSeconds = vi.fn(async (value: number) => {
    seconds = value;
  });
});

function displayTab(): (typeof fakes.settings)[number] {
  const store = { getLongPressSeconds: () => seconds, setLongPressSeconds };
  new PinchmapSettingTab({} as App, {} as Plugin, store).display();
  const [setting] = fakes.settings;
  if (setting === undefined) throw new Error("no setting rendered");
  return setting;
}

describe("PinchmapSettingTab", () => {
  it("renders one localized long press setting showing the current value", () => {
    const setting = displayTab();

    expect(fakes.settings).toHaveLength(1);
    expect(setting.name).toBe("Длительность долгого нажатия");
    expect(setting.desc).toContain("0,2 до 2,0");
    expect(setting.initialValue).toBe("0.5");
  });

  it("shows the stored value rather than the default", () => {
    seconds = 1.2;

    expect(displayTab().initialValue).toBe("1.2");
  });

  it("stores a valid typed duration", async () => {
    await displayTab().change("1,5");

    expect(setLongPressSeconds).toHaveBeenCalledWith(1.5);
  });

  it.each(["0.19", "2.01", "", "abc", "-1"])("stores nothing for the out-of-range or invalid input %j", async (input) => {
    await displayTab().change(input);

    expect(setLongPressSeconds).not.toHaveBeenCalled();
  });

  it("stores nothing when the typed value equals the current one", async () => {
    await displayTab().change("0.5");

    expect(setLongPressSeconds).not.toHaveBeenCalled();
  });
});
