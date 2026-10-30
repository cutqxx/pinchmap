import { canonicalNodeText } from "../model";
import type { BranchDraft } from "../model";
import { unescapeCheckboxLikeStart, unescapeContinuationLine, unescapeIdLikeEnding } from "./clipboardLines";
import { measureIndent } from "./sourceLayout";
import { TRAILING_ID } from "./trailingId";

const LIST_ITEM = /^([ \t]*)(?:(?:[-*+]|\d+[.)])[ \t]+|[-*+]$)(.*)$/;
const CHECKBOX = /^\[[ xX]\](?:[ \t]+|$)/;

interface FlatItem {
  readonly indentWidth: number;
  readonly lines: string[];
}

interface DraftBuilder {
  readonly indentWidth: number;
  readonly lines: readonly string[];
  readonly children: DraftBuilder[];
}

/**
 * Turns clipboard text into branches. A nested list keeps its structure (`-`, `*`, `+`, `1.`, tabs or spaces,
 * checkboxes and `^id` are stripped); text without any list becomes one flat node per non-empty line.
 */
export function parsePastedBranches(text: string): BranchDraft[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (!lines.some((line) => LIST_ITEM.test(line))) return plainTextDrafts(lines);
  return nestItems(collectItems(lines)).map(toDraft);
}

function plainTextDrafts(lines: readonly string[]): BranchDraft[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => ({ text: line, children: [] }));
}

function collectItems(lines: readonly string[]): FlatItem[] {
  const items: FlatItem[] = [];
  let pendingBlankLines = 0;
  for (const line of lines) {
    if (line.trim() === "") {
      pendingBlankLines++;
      continue;
    }
    const current = items[items.length - 1];
    const listMatch = LIST_ITEM.exec(line);
    if (listMatch !== null) {
      items.push({ indentWidth: measureIndent(listMatch[1] ?? ""), lines: [stripCheckbox(listMatch[2] ?? "")] });
    } else if (current !== undefined && isContinuationOf(current, line)) {
      current.lines.push(...Array<string>(pendingBlankLines).fill(""), unescapeAfterIndent(line));
    } else {
      items.push({ indentWidth: measureIndent(leadingWhitespace(line)), lines: [line.trim()] });
    }
    pendingBlankLines = 0;
  }
  return items;
}

function isContinuationOf(item: FlatItem, line: string): boolean {
  return measureIndent(leadingWhitespace(line)) > item.indentWidth;
}

function unescapeAfterIndent(line: string): string {
  const indent = leadingWhitespace(line);
  return indent + unescapeContinuationLine(line.slice(indent.length));
}

function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? "";
}

function stripCheckbox(content: string): string {
  return CHECKBOX.test(content) ? content.replace(CHECKBOX, "") : unescapeCheckboxLikeStart(content);
}

function nestItems(items: readonly FlatItem[]): DraftBuilder[] {
  const topLevel: DraftBuilder[] = [];
  const ancestors: DraftBuilder[] = [];
  for (const item of items) {
    const builder: DraftBuilder = { indentWidth: item.indentWidth, lines: item.lines, children: [] };
    while ((ancestors[ancestors.length - 1]?.indentWidth ?? -1) >= builder.indentWidth) ancestors.pop();
    (ancestors[ancestors.length - 1]?.children ?? topLevel).push(builder);
    ancestors.push(builder);
  }
  return topLevel;
}

function toDraft({ lines, children }: DraftBuilder): BranchDraft {
  return { text: canonicalNodeText(lines.map(stripTrailingId).join("\n")), children: children.map(toDraft) };
}

function stripTrailingId(line: string): string {
  const idMatch = TRAILING_ID.exec(line);
  return idMatch === null ? unescapeIdLikeEnding(line) : line.slice(0, idMatch.index).trimEnd();
}
