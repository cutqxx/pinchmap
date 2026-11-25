import { canonicalNodeText } from "../model";

/** What the user asked for after the text: a new child (Tab) or a new sibling (Ctrl/Cmd+Enter). */
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

/**
 * Escape ends the input, Tab ends it and asks for a new child, Ctrl/Cmd+Enter ends it
 * and asks for a new sibling. Plain Enter and Shift+Enter are left to the browser (new line).
 */
function keyAction(event: KeyboardEvent): TextEditEnd | null {
  if (event.key === "Escape") return { kind: "keyboard" };
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    return { kind: "keyboard", followUp: "addSibling" };
  }
  const isPlainTab = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
  if (event.key === "Tab" && isPlainTab) return { kind: "keyboard", followUp: "addChild" };
  return null;
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
    const end = keyAction(event);
    if (end === null) return;
    event.preventDefault();
    event.stopPropagation();
    commitEndedBy(end);
  });

  nodeElement.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(initialText.length, initialText.length);
  return session;
}
