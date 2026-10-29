import { describe, expect, it } from "vitest";
import { keyToIntent } from "./keymap";
import type { KeyChord } from "./keymap";

function chord(key: string, modifiers: Partial<KeyChord> = {}): KeyChord {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers };
}

describe("keyToIntent in navigate mode", () => {
  it.each([
    ["Tab", "addChild"],
    ["Enter", "addSibling"],
    ["Delete", "deleteSelection"],
    ["Backspace", "deleteSelection"],
    ["F2", "editSelection"],
    ["Escape", "clearSelection"],
  ])("maps %s to %s", (key, type) => {
    expect(keyToIntent(chord(key), "navigate")).toEqual({ type });
  });

  it.each(["a", " ", "ArrowDown"])("ignores the unmapped key %s", (key) => {
    expect(keyToIntent(chord(key), "navigate")).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"] as const)("ignores a mapped key held with %s", (modifier) => {
    for (const key of ["Tab", "Enter", "Delete", "Backspace", "F2", "Escape"]) {
      expect(keyToIntent(chord(key, { [modifier]: true }), "navigate")).toBeNull();
    }
  });
});

describe("keyToIntent in editing mode", () => {
  it.each(["Tab", "Enter", "Delete", "Backspace", "F2", "Escape"])("does not turn %s into an intent so the text is edited", (key) => {
    expect(keyToIntent(chord(key), "editing")).toBeNull();
  });
});
