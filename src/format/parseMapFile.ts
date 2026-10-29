import { buildMindMap, generateNodeId } from "../model";
import type { MindMap, NodeEntry, NodeId } from "../model";
import { countFrontmatterLines } from "./frontmatter";
import { splitLines } from "./lines";
import type { SourceItem, SourceLayout } from "./sourceLayout";
import { TRAILING_ID } from "./trailingId";

export interface ParsedMapFile {
  readonly map: MindMap;
  readonly source: SourceLayout;
}

interface ParsedListLine {
  readonly rawLine: string;
  readonly prefix: string;
  readonly lineEnding: string;
  readonly indentWidth: number;
  readonly text: string;
  readonly explicitId: string | null;
}

interface AssignedId {
  readonly id: NodeId;
  readonly isWritten: boolean;
}

interface Placement {
  readonly parentIndex: number | null;
  readonly depth: number;
}

const LIST_LINE = /^([ \t]*[-*+][ \t]+)([^\r\n]*?)(\r?\n)?$/;
const TAB_WIDTH = 4;

export function parseMapFile(text: string, random: () => number = Math.random): ParsedMapFile {
  const lines = splitLines(text);
  const listStart = findListStart(lines);
  const listEnd = findListEnd(lines, listStart);
  const listLines = lines.slice(listStart, listEnd).map(parseListLine);
  const ids = assignIds(listLines, random);
  const placements = resolvePlacements(listLines);

  const entries = listLines.map(
    (line, index): NodeEntry => ({
      id: at(ids, index).id,
      text: line.text,
      parentId: parentIdOf(at(placements, index), ids),
    }),
  );
  const items = new Map<NodeId, SourceItem>();
  listLines.forEach((line, index) => {
    const { id, isWritten } = at(ids, index);
    items.set(id, toSourceItem(line, at(placements, index).depth, isWritten));
  });

  return {
    map: buildMindMap(entries),
    source: {
      head: lines.slice(0, listStart).join(""),
      tail: lines.slice(listEnd).join(""),
      items,
    },
  };
}

function isListLine(line: string): boolean {
  return LIST_LINE.test(line);
}

function findListStart(lines: readonly string[]): number {
  const firstLineAfterFrontmatter = countFrontmatterLines(lines);
  const start = lines.findIndex((line, index) => index >= firstLineAfterFrontmatter && isListLine(line));
  return start === -1 ? lines.length : start;
}

function findListEnd(lines: readonly string[], listStart: number): number {
  let end = listStart;
  while (end < lines.length && isListLine(at(lines, end))) {
    end++;
  }
  return end;
}

function parseListLine(rawLine: string): ParsedListLine {
  const [, prefix = "", content = "", lineEnding = ""] = LIST_LINE.exec(rawLine) ?? [];
  const idMatch = TRAILING_ID.exec(content);
  return {
    rawLine,
    prefix,
    lineEnding,
    indentWidth: measureIndent(prefix),
    text: idMatch === null ? content : content.slice(0, idMatch.index).trimEnd(),
    explicitId: idMatch?.[1] ?? null,
  };
}

function measureIndent(prefix: string): number {
  const indent = /^[ \t]*/.exec(prefix)?.[0] ?? "";
  return [...indent].reduce((width, char) => width + (char === "\t" ? TAB_WIDTH : 1), 0);
}

function assignIds(lines: readonly ParsedListLine[], random: () => number): AssignedId[] {
  const taken = new Set<NodeId>();
  lines.forEach((line) => line.explicitId !== null && taken.add(line.explicitId));
  const claimed = new Set<NodeId>();
  return lines.map((line): AssignedId => {
    if (line.explicitId !== null && !claimed.has(line.explicitId)) {
      claimed.add(line.explicitId);
      return { id: line.explicitId, isWritten: true };
    }
    const generated = generateNodeId(taken, random);
    taken.add(generated);
    return { id: generated, isWritten: false };
  });
}

function resolvePlacements(lines: readonly ParsedListLine[]): Placement[] {
  const ancestors: { index: number; indentWidth: number }[] = [];
  return lines.map((line, index): Placement => {
    while ((ancestors[ancestors.length - 1]?.indentWidth ?? -1) >= line.indentWidth) {
      ancestors.pop();
    }
    const placement = {
      parentIndex: ancestors[ancestors.length - 1]?.index ?? null,
      depth: ancestors.length,
    };
    ancestors.push({ index, indentWidth: line.indentWidth });
    return placement;
  });
}

function parentIdOf(placement: Placement, ids: readonly AssignedId[]): NodeId | null {
  return placement.parentIndex === null ? null : at(ids, placement.parentIndex).id;
}

function toSourceItem(line: ParsedListLine, depth: number, hasWrittenId: boolean): SourceItem {
  return {
    rawLines: [line.rawLine],
    prefix: line.prefix,
    lineEnding: line.lineEnding,
    text: line.text,
    depth,
    hasWrittenId,
  };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`Index out of range: ${index}`);
  }
  return item;
}
