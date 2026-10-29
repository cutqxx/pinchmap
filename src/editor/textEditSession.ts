import { canonicalNodeText } from "../model";

export type TextEditEnd =
  | { readonly kind: "keyboard" }
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

function isCommitChord(event: KeyboardEvent): boolean {
  if (event.key === "Escape") return true;
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
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
    if (!isCommitChord(event)) return;
    event.preventDefault();
    event.stopPropagation();
    commitEndedBy({ kind: "keyboard" });
  });

  nodeElement.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(initialText.length, initialText.length);
  return session;
}
