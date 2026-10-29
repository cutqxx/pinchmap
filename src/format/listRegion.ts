import { countFrontmatterLines } from "./frontmatter";
import { stripLineEnding } from "./lines";

export const LIST_LINE = /^([ \t]*[-*+][ \t]+)([^\r\n]*?)(\r?\n)?$/;
const CONTINUATION_LINE = /^[ \t]+[^ \t\r\n]/;

export interface ListRegion {
  readonly start: number;
  readonly end: number;
}

export interface ItemBlock {
  readonly firstLine: string;
  readonly continuationLines: readonly string[];
  readonly trailingBlankLines: readonly string[];
}

export function findListRegion(lines: readonly string[]): ListRegion {
  const start = findListStart(lines);
  return { start, end: findListEnd(lines, start) };
}

export function groupIntoItemBlocks(listLines: readonly string[]): ItemBlock[] {
  const bodies: { firstLine: string; body: string[] }[] = [];
  for (const line of listLines) {
    if (isListLine(line)) {
      bodies.push({ firstLine: line, body: [] });
    } else {
      bodies[bodies.length - 1]?.body.push(line);
    }
  }
  return bodies.map(({ firstLine, body }) => toItemBlock(firstLine, body));
}

export function isBlankLine(line: string): boolean {
  return stripLineEnding(line).trim() === "";
}

function toItemBlock(firstLine: string, body: readonly string[]): ItemBlock {
  let contentEnd = body.length;
  while (contentEnd > 0 && isBlankLine(body[contentEnd - 1] ?? "")) {
    contentEnd--;
  }
  return {
    firstLine,
    continuationLines: body.slice(0, contentEnd),
    trailingBlankLines: body.slice(contentEnd),
  };
}

function isListLine(line: string): boolean {
  return LIST_LINE.test(line);
}

function isContinuationLine(line: string): boolean {
  return CONTINUATION_LINE.test(line) && !isListLine(line);
}

function findListStart(lines: readonly string[]): number {
  const firstLineAfterFrontmatter = countFrontmatterLines(lines);
  const start = lines.findIndex((line, index) => index >= firstLineAfterFrontmatter && isListLine(line));
  return start === -1 ? lines.length : start;
}

function findListEnd(lines: readonly string[], listStart: number): number {
  let end = listStart;
  for (let index = listStart; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (isListLine(line) || isContinuationLine(line)) {
      end = index + 1;
    } else if (!isBlankLine(line)) {
      break;
    }
  }
  return end;
}
