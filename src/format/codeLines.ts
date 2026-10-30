import { stripLineEnding } from "./lines";
import { leadingWhitespace, measureIndent } from "./sourceLayout";
import { TRAILING_ID } from "./trailingId";

const FENCE_OPENING = /^[ \t]*(`{3,}|~{3,})(.*)$/;
const LIST_ITEM_PREFIX = /^[ \t]*[-*+][ \t]+/;
const COMMENT_DELIMITER = "%%";

/** Lines `start` (inclusive) to `end` (exclusive) are code or a `%%` comment. */
export interface CodeBlock {
  readonly start: number;
  readonly end: number;
}

interface Opening {
  /** Column a line must reach to stay inside the block: the block ends with the list item it was opened in. */
  readonly indent: number;
  readonly isClosing: (line: string) => boolean;
  /** A block opened on a list item's own line (`- ```js`, `- %%`): the item line stays a list line, the block starts below. */
  readonly isOnItemLine: boolean;
}

/**
 * Finds the fenced code blocks (``` or ~~~, closed by a fence of the same character that is at least
 * as long) and the `%%` comment blocks, delimiters included. A block that is never closed is not a
 * block: a stray fence must not turn the rest of the note into "code" and hide the map list.
 * A block opened inside a list item (on an indented line, or right after the item's bullet, which is
 * how a node text starting with a fence or `%%` is written) is closed
 * by the end of that item, so a line indented less than the block before its closing fence also
 * makes it "never closed": one node's stray fence must not swallow the following nodes, the note
 * text or the JSON block.
 */
export function findCodeBlocks(lines: readonly string[], from = 0): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let index = from;
  while (index < lines.length) {
    const block = findBlockAt(lines, index);
    if (block !== null) blocks.push(block);
    index = Math.max(block?.end ?? 0, index + 1);
  }
  return blocks;
}

export function findCodeLines(lines: readonly string[], from = 0): boolean[] {
  const isCode: boolean[] = lines.map(() => false);
  for (const { start, end } of findCodeBlocks(lines, from)) isCode.fill(true, start, end);
  return isCode;
}

function findBlockAt(lines: readonly string[], index: number): CodeBlock | null {
  const opening = readOpening(stripLineEnding(lines[index] ?? ""));
  if (opening === null) return null;
  const end = endAfterClosing(lines, index, opening);
  if (end === null) return null;
  return { start: opening.isOnItemLine ? index + 1 : index, end };
}

function readOpening(line: string): Opening | null {
  const itemPrefix = LIST_ITEM_PREFIX.exec(line)?.[0] ?? "";
  const isOnItemLine = itemPrefix !== "";
  const indent = isOnItemLine ? measureIndent(itemPrefix) : indentWidth(line);
  const content = line.slice(itemPrefix.length);
  if (isCommentDelimiter(isOnItemLine ? content.replace(TRAILING_ID, "") : content)) {
    return { indent, isClosing: isCommentDelimiter, isOnItemLine };
  }
  const marker = readFenceMarker(content);
  if (marker === null) return null;
  return { indent, isClosing: (candidate) => isClosingFence(candidate, marker), isOnItemLine };
}

function isCommentDelimiter(line: string): boolean {
  return line.trim() === COMMENT_DELIMITER;
}

function readFenceMarker(text: string): string | null {
  const fence = FENCE_OPENING.exec(text);
  const marker = fence?.[1];
  if (marker === undefined) return null;
  const hasBacktickInInfo = marker.startsWith("`") && (fence?.[2] ?? "").includes("`");
  return hasBacktickInInfo ? null : marker;
}

/** Index after the closing line, or null when the block never closes within its list item. */
function endAfterClosing(lines: readonly string[], openingIndex: number, opening: Opening): number | null {
  const isInItem = opening.indent > 0;
  for (let index = openingIndex + 1; index < lines.length; index++) {
    const line = stripLineEnding(lines[index] ?? "");
    if (line.trim() !== "" && indentWidth(line) < opening.indent) return null;
    if (isInItem && isWrittenNode(line)) return null;
    if (opening.isClosing(line)) return index + 1;
  }
  return null;
}

/**
 * A list line with a `^id` inside an item's block is a node the plugin wrote: it escapes every
 * bullet-like line of a node's own text, so a stray fence in a parent node can't have produced it.
 * Such a line ends the block as unclosed rather than being swallowed into the parent's text.
 */
function isWrittenNode(line: string): boolean {
  const itemPrefix = LIST_ITEM_PREFIX.exec(line)?.[0];
  return itemPrefix !== undefined && TRAILING_ID.test(line.slice(itemPrefix.length));
}

function isClosingFence(line: string, opening: string): boolean {
  const trimmed = line.trim();
  const character = opening.charAt(0);
  return trimmed.length >= opening.length && [...trimmed].every((char) => char === character);
}

function indentWidth(line: string): number {
  return measureIndent(leadingWhitespace(line));
}
