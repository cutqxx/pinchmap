import type { MindMap, NodeId } from "../model";
import type { JsonSource } from "./jsonBlock";
import { composeItemContent } from "./trailingId";

export interface SourceItem {
  readonly rawLines: readonly string[];
  readonly prefix: string;
  readonly lineEnding: string;
  readonly finalLineEnding: string;
  readonly continuationIndent: string;
  readonly trailingBlankLines: readonly string[];
  readonly text: string;
  readonly depth: number;
  readonly hasWrittenId: boolean;
}

export interface SourceLayout {
  readonly head: string;
  readonly tail: string;
  readonly indentUnit: string;
  readonly items: ReadonlyMap<NodeId, SourceItem>;
  readonly json: JsonSource;
  readonly loadedMap: MindMap;
}

export const DEFAULT_INDENT_UNIT = "\t";

export function rewriteItemLines(item: SourceItem, id: NodeId, text: string): string[] {
  const [firstLine = "", ...continuation] = text.split("\n");
  const content = composeItemContent(firstLine, id, item.hasWrittenId);
  const indent = chooseContinuationIndent(item, continuation);
  const textLines = [
    `${item.prefix}${content}`,
    ...continuation.map((line) => (line === "" ? "" : `${indent}${escapeBulletLikeLine(line)}`)),
  ];
  return [...terminateLines(textLines, item), ...item.trailingBlankLines];
}

const BULLET_LIKE_LINE = /^\\*[-*+][ \t]/;
const ESCAPED_BULLET_LIKE_LINE = /^\\+[-*+][ \t]/;

export function escapeBulletLikeLine(line: string): string {
  return BULLET_LIKE_LINE.test(line) ? `\\${line}` : line;
}

export function unescapeBulletLikeLine(line: string): string {
  return ESCAPED_BULLET_LIKE_LINE.test(line) ? line.slice(1) : line;
}

function chooseContinuationIndent(item: SourceItem, continuation: readonly string[]): string {
  const hasUnindentedLine = continuation.some((line) => line.trim() !== "" && !/^[ \t]/.test(line));
  const isMixed = !hasUnindentedLine && continuation.some((line) => line.trim() !== "");
  return isMixed ? deriveContinuationIndent(item.prefix) : item.continuationIndent;
}

export function renderNewItemLines(indent: string, text: string, id: NodeId): string[] {
  const prefix = `${indent}- `;
  const item: SourceItem = {
    rawLines: [],
    prefix,
    lineEnding: "\n",
    finalLineEnding: "\n",
    continuationIndent: deriveContinuationIndent(prefix),
    trailingBlankLines: [],
    text,
    depth: 0,
    hasWrittenId: true,
  };
  return rewriteItemLines(item, id, text);
}

export function deriveContinuationIndent(prefix: string): string {
  const indent = leadingWhitespace(prefix);
  return indent + " ".repeat(prefix.length - indent.length);
}

export function deriveIndentUnit(parentPrefix: string, childPrefix: string): string {
  const parentIndent = leadingWhitespace(parentPrefix);
  const childIndent = leadingWhitespace(childPrefix);
  return childIndent.startsWith(parentIndent) ? childIndent.slice(parentIndent.length) : childIndent;
}

function terminateLines(textLines: readonly string[], item: SourceItem): string[] {
  const separator = item.lineEnding === "" ? "\n" : item.lineEnding;
  const lastIndex = textLines.length - 1;
  const finalEnding = item.trailingBlankLines.length > 0 ? separator : item.finalLineEnding;
  return textLines.map((line, index) => line + (index === lastIndex ? finalEnding : separator));
}

function leadingWhitespace(text: string): string {
  return /^[ \t]*/.exec(text)?.[0] ?? "";
}
