import { describe, expect, it, vi } from "vitest";
import type { Modifier, Scope } from "obsidian";

vi.mock("obsidian", () => ({}));

import { registerViewZoomHotkeys } from "./viewZoomHotkeys";

interface Registration {
  modifiers: Modifier[];
  key: string;
  handler: () => unknown;
}

function setup() {
  const registrations: Registration[] = [];
  const scope = {
    register: (modifiers: Modifier[], key: string, handler: () => unknown) => {
      registrations.push({ modifiers, key, handler });
    },
  } as unknown as Scope;
  const actions = { fitToScreen: vi.fn(), zoomStep: vi.fn() };
  registerViewZoomHotkeys(scope, actions);
  const find = (modifiers: Modifier[], key: string): Registration => {
    const found = registrations.find(
      (r) => r.key === key && r.modifiers.length === modifiers.length && modifiers.every((m) => r.modifiers.includes(m)),
    );
    if (found === undefined) throw new Error(`not registered: ${modifiers.join("+")}+${key}`);
    return found;
  };
  return { registrations, actions, find };
}

describe("registerViewZoomHotkeys", () => {
  it("registers exactly the five zoom chords", () => {
    const { registrations } = setup();

    expect(registrations.map((r) => `${[...r.modifiers].sort().join("+")}+${r.key}`).sort()).toEqual(
      ["Mod+0", "Mod+=", "Mod++", "Mod+Shift++", "Mod+-"].sort(),
    );
  });

  it("fits to screen on Mod+0 and swallows the key", () => {
    const { actions, find } = setup();

    const result = find(["Mod"], "0").handler();

    expect(actions.fitToScreen).toHaveBeenCalledTimes(1);
    expect(actions.zoomStep).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it.each([
    [["Mod"], "="],
    [["Mod"], "+"],
    [["Mod", "Shift"], "+"],
  ] as [Modifier[], string][])("zooms in on %s+%s and swallows the key", (modifiers, key) => {
    const { actions, find } = setup();

    const result = find(modifiers, key).handler();

    expect(actions.zoomStep).toHaveBeenCalledExactlyOnceWith("in");
    expect(actions.fitToScreen).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("zooms out on Mod+- and swallows the key", () => {
    const { actions, find } = setup();

    const result = find(["Mod"], "-").handler();

    expect(actions.zoomStep).toHaveBeenCalledExactlyOnceWith("out");
    expect(result).toBe(false);
  });
});
