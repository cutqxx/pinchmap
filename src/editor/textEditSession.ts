export interface TextEditOptions {
  readonly nodeElement: HTMLElement;
  readonly initialText: string;
  readonly onDraftChanged: (text: string) => void;
  readonly onCommitted: (text: string) => void;
}

export interface TextEditSession {
  commit(): void;
  cancel(): void;
}

const COMMIT_KEYS = ["Escape", "Enter"];

export function beginTextEdit(options: TextEditOptions): TextEditSession {
  const { nodeElement, initialText, onDraftChanged, onCommitted } = options;
  const textarea = nodeElement.ownerDocument.createElement("textarea");
  textarea.className = "pinchmap-node-input";
  textarea.rows = 1;
  textarea.value = initialText;
  let isFinished = false;

  const readDraft = (): string => collapseLineBreaks(textarea.value);
  const finish = (): boolean => {
    if (isFinished) return false;
    isFinished = true;
    textarea.remove();
    return true;
  };
  const session: TextEditSession = {
    commit: () => {
      const finalText = readDraft().trim();
      if (finish()) onCommitted(finalText);
    },
    cancel: () => void finish(),
  };

  textarea.addEventListener("input", () => onDraftChanged(readDraft()));
  textarea.addEventListener("blur", session.commit);
  textarea.addEventListener("keydown", (event) => {
    if (!COMMIT_KEYS.includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    session.commit();
  });

  nodeElement.appendChild(textarea);
  textarea.focus();
  textarea.setSelectionRange(initialText.length, initialText.length);
  return session;
}

function collapseLineBreaks(text: string): string {
  return text.replace(/\r?\n/g, " ");
}
