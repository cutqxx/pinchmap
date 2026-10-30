import type { Intent } from "./gestureRecognizer";

export interface KeyChord {
  readonly key: string;
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const LATIN_LETTER = /^[a-z]$/;
const PHYSICAL_LETTER = /^Key([A-Z])$/;

export type KeyMode = "navigate" | "editing";

const NAVIGATE_INTENTS: ReadonlyMap<string, Intent> = new Map<string, Intent>([
  ["Tab", { type: "addChild" }],
  ["Enter", { type: "addSibling" }],
  ["Delete", { type: "deleteSelection" }],
  ["Backspace", { type: "deleteSelection" }],
  ["F2", { type: "editSelection" }],
  ["Escape", { type: "clearSelection" }],
]);

export function keyToIntent(chord: KeyChord, mode: KeyMode): Intent | null {
  if (mode !== "navigate") return null;
  if (isCommandChord(chord)) return commandIntent(chord);
  if (hasModifier(chord)) return null;
  return NAVIGATE_INTENTS.get(chord.key) ?? null;
}

function hasModifier({
  ctrlKey,
  metaKey,
  altKey,
  shiftKey,
}: KeyChord): boolean {
  return ctrlKey || metaKey || altKey || shiftKey;
}

function isCommandChord({ ctrlKey, metaKey, altKey }: KeyChord): boolean {
  return (ctrlKey || metaKey) && !altKey;
}

function commandIntent(chord: KeyChord): Intent | null {
  const letter = commandLetter(chord);
  if (letter === "z")
    return chord.shiftKey ? { type: "redo" } : { type: "undo" };
  if (letter === "y" && !chord.shiftKey) return { type: "redo" };
  return null;
}

function commandLetter({ key, code }: KeyChord): string {
  const typedLetter = key.toLowerCase();
  if (LATIN_LETTER.test(typedLetter)) return typedLetter;
  const physicalLetter = code ? PHYSICAL_LETTER.exec(code)?.[1] : undefined;
  return (physicalLetter ?? key).toLowerCase();
}
