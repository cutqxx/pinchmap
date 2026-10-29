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

function pressKey(key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
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

  it.each(["Enter", "Escape"])("ends with a keyboard end on %s and removes the input", (key) => {
    open();
    input().value = "Typed";
    const textarea = input();

    const event = pressKey(key);

    expect(onCommitted).toHaveBeenCalledExactlyOnceWith("Typed", { kind: "keyboard" });
    expect(textarea.isConnected).toBe(false);
    expect(event.defaultPrevented).toBe(true);
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

  it("reports the end only once when a blur follows an Enter", () => {
    open();
    const textarea = input();

    pressKey("Enter");
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
