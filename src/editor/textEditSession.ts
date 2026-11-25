import { canonicalNodeText } from "../model";

/** What the user asked for after the text: a new child (Tab) or a new sibling (Enter). */
export type TextEditFollowUp = "addChild" | "addSibling";

export type TextEditEnd =
  | { readonly kind: "keyboard"; readonly followUp?: TextEditFollowUp }
  | { readonly kind: "programmatic" }
  | { readonly kind: "blur"; readonly focusTarget: EventTarget | null };

export interface TextEditOptions {
  readonly nodeElement: HTMLElement;
  readonly initialText: string;
  readonly onDraftChanged: (text: string) => void;
  readonly onCommitted: (text: string, end: TextEditEnd) => void;
}

export interface TextEditSession {
  commit(end?: TextEditEnd): void;
  cancel(): void;
}

function isImeComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

type KeyAction = { readonly kind: "commit"; readonly end: TextEditEnd } | { readonly kind: "newline" } | null;

/**
 * Enter and Tab end the input and ask for a new sibling or child, like outside
 * text input. A line break is Shift+Enter (left to the browser) or Ctrl/Cmd+Enter.
 */
function keyAction(event: KeyboardEvent): KeyAction {
  const hasCommandModifier = event.ctrlKey || event.metaKey;
  if (event.key === "Escape") return { kind: "commit", end: { kind: "keyboard" } };
  if (event.key === "Enter") {
    if (hasCommandModifier) return { kind: "newline" };
    if (event.shiftKey || event.altKey) return null;
    return { kind: "commit", end: { kind: "keyboard", followUp: "addSibling" } };
  }
  if (event.key === "Tab" && !event.shiftKey && !event.altKey && !hasCommandModifier) {
    return { kind: "commit", end: { kind: "keyboard", followUp: "addChild" } };
  }
  return null;
}

function insertLineBreak(textarea: HTMLTextAreaElement): void {
  // execCommand keeps the browser's own undo for the input; setRangeText is the fallback.
  const doc = textarea.ownerDocument;
  const isInserted = typeof doc.execCommand === "function" && doc.execCommand("insertText", false, "\n");
  if (isInserted) return;
  textarea.setRangeText("\n", textarea.selectionStart, textarea.selectionEnd, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function beginTextEdit(options: TextEditOptions): TextEditSession {
  const { nodeElement, initialText, onDraftChanged, onCommitted } = options;
  const textarea = nodeElement.ownerDocument.createElement("textarea");
  textarea.className = "pinchmap-node-input";
  textarea.rows = 1;
  textarea.value = initialText;
  let isFinished = false;

  const readDraft = (): string => textarea.value;
  const finish = (): boolean => {
    if (isFinished) return false;
    isFinished = true;
    textarea.remove();
    return true;
  };
  const commitEndedBy = (end: TextEditEnd): void => {
    const finalText = canonicalNodeText(readDraft());
    if (finish()) onCommitted(finalText, end);
  };
  const session: TextEditSession = {
    commit: (end = { kind: "programmatic" }) => commitEndedBy(end),
    cancel: () => void finish(),
  };

  textarea.addEventListener("input", () => onDraftChanged(readDraft()));
  textarea.addEventListener("blur", (event) =>
    commitEndedBy({ kind: "blur", focusTarget: event.relatedTarget }),
  );
  textarea.addEventListener("keydown", (event) => {
    if (isImeComposing(event)) return;
    const action = keyAction(event);
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.kind === "newline") insertLineBreak(textarea);
    else commitEndedBy(action.end);
  });

  nodeElement.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(initialText.length, initialText.length);
  return session;
}
