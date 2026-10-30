// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => {
  const notices: string[] = [];
  class FakeMapView {
    longPressSeconds: number | null = null;
    setLongPressSeconds(seconds: number): void {
      this.longPressSeconds = seconds;
    }
  }
  class FakePlugin {
    app = { workspace: { getLeavesOfType: (): { view: unknown }[] => [] } };
    saveData: (data: unknown) => Promise<void> = () => Promise.resolve();
  }
  return { notices, FakeMapView, FakePlugin };
});

vi.mock("obsidian", () => ({
  Plugin: fakes.FakePlugin,
  Notice: class {
    constructor(message: string) {
      fakes.notices.push(message);
    }
  },
}));
vi.mock("./mapView", () => ({ MapView: fakes.FakeMapView, MAP_VIEW_TYPE: "pinchmap-view" }));
vi.mock("./settingTab", () => ({ PinchmapSettingTab: class {} }));
vi.mock("./mapNotes", () => ({ MapNotes: class {} }));
vi.mock("./openAsMapAction", () => ({ OpenAsMapActions: class {} }));
vi.mock("./openMapFiles", () => ({ MapFileOpener: class {} }));

import PinchmapPlugin from "./main";

let view: InstanceType<typeof fakes.FakeMapView>;
let plugin: PinchmapPlugin;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fakes.notices.length = 0;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  view = new fakes.FakeMapView();
  plugin = new PinchmapPlugin({} as never, {} as never);
  (plugin as unknown as InstanceType<typeof fakes.FakePlugin>).app = {
    workspace: { getLeavesOfType: () => [{ view }] },
  };
});

afterEach(() => {
  consoleError.mockRestore();
});

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PinchmapPlugin.setLongPressSeconds", () => {
  it("updates the value and pushes it to open map views", async () => {
    plugin.saveData = vi.fn(() => Promise.resolve());

    await plugin.setLongPressSeconds(1.5);

    expect(plugin.getLongPressSeconds()).toBe(1.5);
    expect(view.longPressSeconds).toBe(1.5);
  });

  it("persists the new settings", async () => {
    const saveData = vi.fn(() => Promise.resolve());
    plugin.saveData = saveData;

    await plugin.setLongPressSeconds(1.5);

    expect(saveData).toHaveBeenCalledWith(expect.objectContaining({ longPressSeconds: 1.5 }));
  });

  it("still updates the views and shows a failure notice when saving rejects", async () => {
    plugin.saveData = () => Promise.reject(new Error("disk full"));

    await expect(plugin.setLongPressSeconds(2)).resolves.toBeUndefined();
    await flushMicrotasks();

    expect(plugin.getLongPressSeconds()).toBe(2);
    expect(view.longPressSeconds).toBe(2);
    expect(fakes.notices).toEqual(["Pinchmap: the action failed. See the developer console for details."]);
  });

  it("shows no notice when saving succeeds", async () => {
    plugin.saveData = () => Promise.resolve();

    await plugin.setLongPressSeconds(2);
    await flushMicrotasks();

    expect(fakes.notices).toEqual([]);
  });
});
