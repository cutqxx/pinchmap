import { splitLines, stripLineEnding } from "./lines";

const COMMENT_MARK = "%%";
const FENCE_OPEN = "```json";
const FENCE_CLOSE = "```";

export interface BlockRange {
  readonly start: number;
  readonly end: number;
}

export interface LocatedJsonBlock {
  readonly range: BlockRange;
  readonly body: string;
}

export function findLastJsonBlock(text: string): LocatedJsonBlock | null {
  const lines = splitLines(text);
  const offsets = lineOffsets(lines);
  let lastBlock: LocatedJsonBlock | null = null;
  let index = 0;
  while (index < lines.length) {
    const lastLine = findBlockLastLine(lines, index);
    if (lastLine === -1) {
      index++;
      continue;
    }
    lastBlock = {
      range: { start: offsets[index] ?? 0, end: offsets[lastLine + 1] ?? text.length },
      body: lines.slice(index + 2, lastLine - 1).join(""),
    };
    index = lastLine + 1;
  }
  return lastBlock;
}

function findBlockLastLine(lines: readonly string[], start: number): number {
  if (!isLineEqualTo(lines[start], COMMENT_MARK) || !isLineEqualTo(lines[start + 1], FENCE_OPEN)) {
    return -1;
  }
  const fenceClose = findFenceClose(lines, start + 2);
  return fenceClose !== -1 && isLineEqualTo(lines[fenceClose + 1], COMMENT_MARK) ? fenceClose + 1 : -1;
}

function findFenceClose(lines: readonly string[], from: number): number {
  for (let index = from; index < lines.length; index++) {
    if (isLineEqualTo(lines[index], FENCE_CLOSE)) return index;
    if (isLineEqualTo(lines[index], COMMENT_MARK)) return -1;
  }
  return -1;
}

function isLineEqualTo(line: string | undefined, expected: string): boolean {
  return line !== undefined && stripLineEnding(line).trim() === expected;
}

function lineOffsets(lines: readonly string[]): number[] {
  const offsets = [0];
  for (const line of lines) {
    offsets.push((offsets[offsets.length - 1] ?? 0) + line.length);
  }
  return offsets;
}
