import type { Intent } from "./gestureRecognizer";

export interface KeyChord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export type KeyMode = "navigate" | "editing";

const NAVIGATE_INTENTS: ReadonlyMap<string, Intent> = new Map<string, Intent>([
  ["Tab", { type: "addChild" }],
  ["Enter", { type: "addSibling" }],
  ["Delete", { type: "deleteSelection" }],
  ["Backspace", { type: "deleteSelection" }],
]);

export function keyToIntent(chord: KeyChord, mode: KeyMode): Intent | null {
  if (mode !== "navigate" || hasModifier(chord)) return null;
  return NAVIGATE_INTENTS.get(chord.key) ?? null;
}

function hasModifier({ ctrlKey, metaKey, altKey, shiftKey }: KeyChord): boolean {
  return ctrlKey || metaKey || altKey || shiftKey;
}
