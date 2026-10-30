import { describe, expect, it, vi } from "vitest";
import type { Modifier, Scope } from "obsidian";

vi.mock("obsidian", () => ({}));

import { registerViewBranchHotkeys } from "./viewBranchHotkeys";

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
  const actions = { duplicateSelectedBranch: vi.fn() };
  registerViewBranchHotkeys(scope, actions);
  return { registrations, actions };
}

describe("registerViewBranchHotkeys", () => {
  it("registers only Mod+D", () => {
    const { registrations } = setup();

    expect(registrations.map((r) => `${r.modifiers.join("+")}+${r.key}`)).toEqual(["Mod+d"]);
  });

  it("duplicates the selected branch when the chord fires", () => {
    const { registrations, actions } = setup();

    registrations[0]?.handler();

    expect(actions.duplicateSelectedBranch).toHaveBeenCalledTimes(1);
  });

  it("returns false so Obsidian does not also run its own Mod+D", () => {
    const { registrations } = setup();

    expect(registrations[0]?.handler()).toBe(false);
  });
});
