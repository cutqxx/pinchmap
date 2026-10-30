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

describe("keyToIntent undo and redo shortcuts", () => {
  it.each([
    ["ctrlKey", "z"],
    ["metaKey", "z"],
    ["ctrlKey", "Z"],
  ] as const)("maps %s with key %s to undo", (modifier, key) => {
    expect(keyToIntent(chord(key, { [modifier]: true }), "navigate")).toEqual({ type: "undo" });
  });

  it.each(["ctrlKey", "metaKey"] as const)("maps %s with Shift+Z to redo", (modifier) => {
    expect(keyToIntent(chord("Z", { [modifier]: true, shiftKey: true }), "navigate")).toEqual({ type: "redo" });
  });

  it("maps Ctrl+Y to redo", () => {
    expect(keyToIntent(chord("y", { ctrlKey: true }), "navigate")).toEqual({ type: "redo" });
  });

  it("does not map Ctrl+Shift+Y", () => {
    expect(keyToIntent(chord("Y", { ctrlKey: true, shiftKey: true }), "navigate")).toBeNull();
  });

  it("does not map Z without Ctrl or Meta", () => {
    expect(keyToIntent(chord("z"), "navigate")).toBeNull();
  });

  it("does not map Shift+Z without Ctrl or Meta", () => {
    expect(keyToIntent(chord("Z", { shiftKey: true }), "navigate")).toBeNull();
  });

  it("does not map other Ctrl letters", () => {
    expect(keyToIntent(chord("x", { ctrlKey: true }), "navigate")).toBeNull();
  });

  it("undoes on a Russian layout where key is я and the physical key is KeyZ", () => {
    expect(keyToIntent(chord("я", { ctrlKey: true, code: "KeyZ" }), "navigate")).toEqual({ type: "undo" });
  });

  it("redoes on a Russian layout with Shift where the physical key is KeyZ", () => {
    expect(keyToIntent(chord("Я", { ctrlKey: true, shiftKey: true, code: "KeyZ" }), "navigate")).toEqual({
      type: "redo",
    });
  });

  it("redoes on a Russian layout where key is н and the physical key is KeyY", () => {
    expect(keyToIntent(chord("н", { ctrlKey: true, code: "KeyY" }), "navigate")).toEqual({ type: "redo" });
  });

  it("trusts the typed Latin letter over the physical key on QWERTZ", () => {
    expect(keyToIntent(chord("z", { ctrlKey: true, code: "KeyY" }), "navigate")).toEqual({ type: "undo" });
    expect(keyToIntent(chord("y", { ctrlKey: true, code: "KeyZ" }), "navigate")).toEqual({ type: "redo" });
  });

  it("trusts the typed Latin letter on AZERTY where Z sits on the physical W key", () => {
    expect(keyToIntent(chord("z", { ctrlKey: true, code: "KeyW" }), "navigate")).toEqual({ type: "undo" });
    expect(keyToIntent(chord("w", { ctrlKey: true, code: "KeyZ" }), "navigate")).toBeNull();
  });

  it("does not undo for a Russian letter on another physical key", () => {
    expect(keyToIntent(chord("я", { ctrlKey: true, code: "KeyQ" }), "navigate")).toBeNull();
  });

  it.each([undefined, ""])("falls back to key when code is %j", (code) => {
    expect(keyToIntent(chord("z", { ctrlKey: true, code }), "navigate")).toEqual({ type: "undo" });
  });

  it("falls back to key when code is not a letter code", () => {
    expect(keyToIntent(chord("z", { ctrlKey: true, code: "Unidentified" }), "navigate")).toEqual({ type: "undo" });
  });

  it.each([
    ["z", {}],
    ["Z", { shiftKey: true }],
    ["y", {}],
  ] as const)("ignores Ctrl+%s when Alt is held", (key, extra) => {
    expect(keyToIntent(chord(key, { ctrlKey: true, altKey: true, ...extra }), "navigate")).toBeNull();
  });

  it("ignores Meta+Z when Alt is held", () => {
    expect(keyToIntent(chord("z", { metaKey: true, altKey: true }), "navigate")).toBeNull();
  });

  it.each([
    ["z", {}],
    ["Z", { shiftKey: true }],
    ["y", {}],
  ] as const)("leaves Ctrl+%s to the text input in editing mode", (key, extra) => {
    expect(keyToIntent(chord(key, { ctrlKey: true, ...extra }), "editing")).toBeNull();
  });

  it("leaves a Russian-layout Ctrl+Z to the text input in editing mode", () => {
    expect(keyToIntent(chord("я", { ctrlKey: true, code: "KeyZ" }), "editing")).toBeNull();
  });

  it("keeps non-letter keys unchanged when a code is present", () => {
    expect(keyToIntent(chord("Tab", { code: "Tab" }), "navigate")).toEqual({ type: "addChild" });
  });

  it("keeps a modified non-letter key unmapped when a code is present", () => {
    expect(keyToIntent(chord("Tab", { ctrlKey: true, code: "Tab" }), "navigate")).toBeNull();
  });
});
