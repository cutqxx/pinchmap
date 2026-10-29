// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginTextEdit } from "./textEditSession";
import type { TextEditEnd } from "./textEditSession";

let nodeElement: HTMLElement;
let onDraftChanged: ReturnType<typeof vi.fn<(text: string) => void>>;
let onCommitted: ReturnType<typeof vi.fn<(text: string, end: TextEditEnd) => void>>;

beforeEach(() => {
  nodeElement = document.createElement("div");
  document.body.appendChild(nodeElement);
  onDraftChanged = vi.fn();
  onCommitted = vi.fn();
});

afterEach(() => {
  nodeElement.remove();
});

function open(initialText = "Start") {
  return beginTextEdit({ nodeElement, initialText, onDraftChanged, onCommitted });
}

function input(): HTMLTextAreaElement {
  const element = nodeElement.querySelector("textarea");
  if (element === null) throw new Error("no text input is open");
  return element;
}

function pressKey(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
  input().dispatchEvent(event);
  return event;
}

describe("beginTextEdit", () => {
  it("opens a focused text input holding the initial text", () => {
    open("Hello");

    expect(input().value).toBe("Hello");
    expect(document.activeElement).toBe(input());
  });

  it("reports the draft while the user types", () => {
    open();
    input().value = "Draft";

    input().dispatchEvent(new Event("input", { bubbles: true }));

    expect(onDraftChanged).toHaveBeenCalledWith("Draft");
    expect(onCommitted).not.toHaveBeenCalled();
  });

  it.each([
    ["Escape", {}],
    ["Enter", { ctrlKey: true }],
    ["Enter", { metaKey: true }],
  ])("ends with a keyboard end on %s %o and removes the input", (key, modifiers) => {
    open();
    input().value = "Typed";
    const textarea = input();

    const event = pressKey(key, modifiers);

    expect(onCommitted).toHaveBeenCalledExactlyOnceWith("Typed", { kind: "keyboard" });
    expect(textarea.isConnected).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  describe("while an IME composition is in progress", () => {
    const composing: [string, KeyboardEventInit][] = [
      ["isComposing", { isComposing: true }],
      ["keyCode 229", { keyCode: 229 }],
    ];
    const chords: [string, string, KeyboardEventInit][] = [
      ["Escape", "Escape", {}],
      ["Ctrl+Enter", "Enter", { ctrlKey: true }],
      ["Cmd+Enter", "Enter", { metaKey: true }],
    ];

    describe.each(composing)("signalled by %s", (_label, compositionState) => {
      it.each(chords)("ignores %s: no commit, input stays, default not prevented", (_chord, key, modifiers) => {
        open();
        const textarea = input();

        const event = pressKey(key, { ...modifiers, ...compositionState });

        expect(onCommitted).not.toHaveBeenCalled();
        expect(textarea.isConnected).toBe(true);
        expect(event.defaultPrevented).toBe(false);
      });
    });

    it.each(chords)("commits once on %s after the composition is over", (_chord, key, modifiers) => {
      open();
      input().value = "Composed";
      pressKey(key, { ...modifiers, isComposing: true });

      pressKey(key, modifiers);

      expect(onCommitted).toHaveBeenCalledExactlyOnceWith("Composed", { kind: "keyboard" });
      expect(nodeElement.querySelector("textarea")).toBeNull();
    });
  });

  it.each([{}, { shiftKey: true }])(
    "leaves the newline to the browser on Enter %o: no commit, no preventDefault",
    (modifiers) => {
      open();

      const event = pressKey("Enter", modifiers);

      expect(onCommitted).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
      expect(input().isConnected).toBe(true);
    },
  );

  it("passes the given end through when committed through the session", () => {
    const session = open();
    input().value = "Done tapped";

    session.commit({ kind: "keyboard" });

    expect(onCommitted).toHaveBeenCalledExactlyOnceWith("Done tapped", { kind: "keyboard" });
  });

  it("does not end on other keys", () => {
    open();

    pressKey("a");

    expect(onCommitted).not.toHaveBeenCalled();
    expect(input().isConnected).toBe(true);
  });

  it("ends with a blur end carrying the element that received focus", () => {
    open();
    const outside = document.createElement("input");
    document.body.appendChild(outside);

    input().dispatchEvent(new FocusEvent("blur", { relatedTarget: outside }));

    expect(onCommitted).toHaveBeenCalledExactlyOnceWith("Start", { kind: "blur", focusTarget: outside });
    outside.remove();
  });

  it("ends with a blur end without a target when focus goes nowhere", () => {
    open();

    input().dispatchEvent(new FocusEvent("blur"));

    expect(onCommitted).toHaveBeenCalledExactlyOnceWith("Start", { kind: "blur", focusTarget: null });
  });

  it("ends with a programmatic end when committed through the session", () => {
    const session = open();
    input().value = "Via session";

    session.commit();

    expect(onCommitted).toHaveBeenCalledExactlyOnceWith("Via session", { kind: "programmatic" });
    expect(nodeElement.querySelector("textarea")).toBeNull();
  });

  it("commits the canonical text, trimming surrounding whitespace", () => {
    const session = open();
    input().value = "  padded  ";

    session.commit();

    expect(onCommitted.mock.calls[0]?.[0]).toBe("padded");
  });

  it("reports the end only once when a blur follows a Ctrl+Enter", () => {
    open();
    const textarea = input();

    pressKey("Enter", { ctrlKey: true });
    textarea.dispatchEvent(new FocusEvent("blur"));

    expect(onCommitted).toHaveBeenCalledTimes(1);
  });

  it("reports nothing when cancelled, and removes the input", () => {
    const session = open();
    const textarea = input();

    session.cancel();
    textarea.dispatchEvent(new FocusEvent("blur"));

    expect(onCommitted).not.toHaveBeenCalled();
    expect(textarea.isConnected).toBe(false);
  });
});
