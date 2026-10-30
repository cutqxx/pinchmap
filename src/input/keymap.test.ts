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

  it.each(["a", " "])("ignores the unmapped key %s", (key) => {
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

describe("keyToIntent arrow navigation", () => {
  it.each([
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
  ])("maps %s to navigate %s", (key, direction) => {
    expect(keyToIntent(chord(key), "navigate")).toEqual({ type: "navigate", direction });
  });

  it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"] as const)("ignores an arrow held with %s", (modifier) => {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(keyToIntent(chord(key, { [modifier]: true }), "navigate")).toBeNull();
    }
  });

  it("does not navigate while editing", () => {
    expect(keyToIntent(chord("ArrowLeft"), "editing")).toBeNull();
  });
});

describe("keyToIntent zoom shortcuts", () => {
  const FIT = { type: "fitToScreen" };
  const ZOOM_IN = { type: "zoomStep", direction: "in" };
  const ZOOM_OUT = { type: "zoomStep", direction: "out" };

  it.each(["ctrlKey", "metaKey"] as const)("maps %s+0 to fit to screen", (modifier) => {
    expect(keyToIntent(chord("0", { [modifier]: true }), "navigate")).toEqual(FIT);
  });

  it.each(["ctrlKey", "metaKey"] as const)("maps %s+= to zoom in", (modifier) => {
    expect(keyToIntent(chord("=", { [modifier]: true }), "navigate")).toEqual(ZOOM_IN);
  });

  it.each(["ctrlKey", "metaKey"] as const)("maps %s+Shift+= typed as + to zoom in", (modifier) => {
    expect(keyToIntent(chord("+", { [modifier]: true, shiftKey: true }), "navigate")).toEqual(ZOOM_IN);
  });

  it("maps Ctrl+ plain + to zoom in", () => {
    expect(keyToIntent(chord("+", { ctrlKey: true }), "navigate")).toEqual(ZOOM_IN);
  });

  it.each(["ctrlKey", "metaKey"] as const)("maps %s+- to zoom out", (modifier) => {
    expect(keyToIntent(chord("-", { [modifier]: true }), "navigate")).toEqual(ZOOM_OUT);
  });

  it.each([
    ["Numpad0", FIT],
    ["NumpadAdd", ZOOM_IN],
    ["NumpadSubtract", ZOOM_OUT],
    ["Digit0", FIT],
    ["Equal", ZOOM_IN],
    ["Minus", ZOOM_OUT],
  ])("falls back to code %s when the key is not printable", (code, intent) => {
    expect(keyToIntent(chord("Unidentified", { ctrlKey: true, code }), "navigate")).toEqual(intent);
  });

  it("maps AZERTY Ctrl+0 (key a-grave on Digit0) to fit to screen", () => {
    expect(keyToIntent(chord("à", { ctrlKey: true, code: "Digit0" }), "navigate")).toEqual(FIT);
  });

  it("does not zoom out for the AZERTY key that types ) on the Minus code", () => {
    expect(keyToIntent(chord(")", { ctrlKey: true, code: "Minus" }), "navigate")).toBeNull();
  });

  it.each(["0", "=", "-"])("ignores %s without Ctrl or Cmd", (key) => {
    expect(keyToIntent(chord(key), "navigate")).toBeNull();
  });

  it.each(["0", "=", "-"])("ignores Ctrl+Alt+%s", (key) => {
    expect(keyToIntent(chord(key, { ctrlKey: true, altKey: true }), "navigate")).toBeNull();
  });

  it.each(["0", "=", "-"])("does not zoom while editing with Ctrl+%s", (key) => {
    expect(keyToIntent(chord(key, { ctrlKey: true }), "editing")).toBeNull();
  });
});

describe("keyToIntent collapse shortcut", () => {
  const TOGGLE = { type: "toggleCollapse" };

  it.each(["ctrlKey", "metaKey"] as const)("maps %s with / to toggle collapse", (modifier) => {
    expect(keyToIntent(chord("/", { [modifier]: true }), "navigate")).toEqual(TOGGLE);
  });

  it.each(["Slash", "NumpadDivide"])("falls back to code %s when the key is not printable", (code) => {
    expect(keyToIntent(chord("Unidentified", { ctrlKey: true, code }), "navigate")).toEqual(TOGGLE);
  });

  it("maps a Russian-layout Ctrl+Shift+7 which types / to toggle collapse", () => {
    expect(keyToIntent(chord("/", { ctrlKey: true, shiftKey: true, code: "Digit7" }), "navigate")).toEqual(TOGGLE);
  });

  it("does not toggle for / without Ctrl or Cmd", () => {
    expect(keyToIntent(chord("/"), "navigate")).toBeNull();
  });

  it("does not toggle for Ctrl+Alt+/", () => {
    expect(keyToIntent(chord("/", { ctrlKey: true, altKey: true }), "navigate")).toBeNull();
  });

  it("does not toggle for the ? typed by Ctrl+Shift+/ on a US layout", () => {
    expect(keyToIntent(chord("?", { ctrlKey: true, shiftKey: true, code: "Slash" }), "navigate")).toBeNull();
  });

  it("does not toggle while editing so the text keeps the keystroke", () => {
    expect(keyToIntent(chord("/", { ctrlKey: true }), "editing")).toBeNull();
  });
});
