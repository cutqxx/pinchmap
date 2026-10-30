import { buildMindMap, generateNodeId } from "../model";
import type { MindMap, NodeEntry, NodeId, NodeState } from "../model";
import { detectLineEnding, readJson } from "./jsonBlock";
import type { ReadJson } from "./jsonBlock";
import { splitLines, stripLineEnding } from "./lines";
import { LIST_LINE, findListRegion, groupIntoItemBlocks, isBlankLine } from "./listRegion";
import type { ItemBlock } from "./listRegion";
import { DEFAULT_INDENT_UNIT, deriveContinuationIndent, deriveIndentUnit, measureIndent, unescapeBulletLikeLine } from "./sourceLayout";
import type { SourceItem, SourceLayout } from "./sourceLayout";
import { TRAILING_ID } from "./trailingId";

export interface ParsedMapFile {
  readonly map: MindMap;
  readonly source: SourceLayout;
  readonly isLayoutUnreadable: boolean;
}

interface ParsedListLine {
  readonly rawLines: readonly string[];
  readonly prefix: string;
  readonly lineEnding: string;
  readonly finalLineEnding: string;
  readonly continuationIndent: string;
  readonly trailingBlankLines: readonly string[];
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

export function parseMapFile(text: string, random: () => number = Math.random): ParsedMapFile {
  const lines = splitLines(text);
  const { start: listStart, end: listEnd } = findListRegion(lines);
  const listLines = groupIntoItemBlocks(lines.slice(listStart, listEnd)).map(parseListLine);
  const head = lines.slice(0, listStart).join("");
  const tail = lines.slice(listEnd).join("");
  const { source: json, states, isLayoutUnreadable } = readServiceJson(head, tail, detectLineEnding(text));
  const ids = assignIds(listLines, new Set(states.keys()), random);
  const placements = resolvePlacements(listLines);

  const entries = listLines.map(
    (line, index): NodeEntry => ({
      id: at(ids, index).id,
      text: line.text,
      parentId: parentIdOf(at(placements, index), ids),
      ...stateEntry(states.get(at(ids, index).id)),
      ...sidePendingEntry(at(ids, index), at(placements, index)),
    }),
  );
  const items = new Map<NodeId, SourceItem>();
  listLines.forEach((line, index) => {
    const { id, isWritten } = at(ids, index);
    items.set(id, toSourceItem(line, at(placements, index).depth, isWritten));
  });

  const map = buildMindMap(entries);
  return {
    map,
    source: {
      head,
      tail,
      indentUnit: deriveIndentUnitFromItems(listLines, placements),
      items,
      json,
      loadedMap: map,
    },
    isLayoutUnreadable,
  };
}

function readServiceJson(head: string, tail: string, lineEnding: string): ReadJson & { readonly isLayoutUnreadable: boolean } {
  const fromTail = readJson(tail, lineEnding);
  if (fromTail.source.status !== "absent") return { ...fromTail, isLayoutUnreadable: fromTail.source.status === "corrupt" };
  const fromHead = readJson(head, lineEnding, "head");
  if (fromHead.source.status === "readable") return { ...fromHead, isLayoutUnreadable: false };
  return { ...fromTail, isLayoutUnreadable: fromHead.source.status === "corrupt" };
}

function stateEntry(state: NodeState | undefined): { state?: NodeState } {
  return state === undefined ? {} : { state };
}

function sidePendingEntry(id: AssignedId, placement: Placement): { isSidePending?: true } {
  const isUnwrittenFirstLevelBranch = placement.depth === 1 && !id.isWritten;
  return isUnwrittenFirstLevelBranch ? { isSidePending: true } : {};
}

function parseListLine(block: ItemBlock): ParsedListLine {
  const [, prefix = "", content = "", lineEnding = ""] = LIST_LINE.exec(block.firstLine) ?? [];
  const idMatch = TRAILING_ID.exec(content);
  const continuationIndent = detectContinuationIndent(block.continuationLines, prefix);
  const firstLineText = idMatch === null ? content : content.slice(0, idMatch.index).trimEnd();
  const continuationText = block.continuationLines.map((line) => stripContinuationIndent(line, continuationIndent));
  return {
    rawLines: [block.firstLine, ...block.continuationLines, ...block.trailingBlankLines],
    prefix,
    lineEnding,
    finalLineEnding: lastLineEnding([block.firstLine, ...block.continuationLines]),
    continuationIndent,
    trailingBlankLines: block.trailingBlankLines,
    indentWidth: measureIndent(leadingWhitespace(prefix)),
    text: [firstLineText, ...continuationText].join("\n"),
    explicitId: idMatch?.[1] ?? null,
  };
}

function detectContinuationIndent(continuationLines: readonly string[], prefix: string): string {
  const indents = continuationLines.filter((line) => !isBlankLine(line)).map(leadingWhitespace);
  const shallowest = indents.reduce((best, indent) => (indent.length < best.length ? indent : best), indents[0] ?? "");
  const isSharedByAll = indents.every((indent) => indent.startsWith(shallowest));
  return indents.length > 0 && isSharedByAll ? shallowest : deriveContinuationIndent(prefix);
}

function leadingWhitespace(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? "";
}

function stripContinuationIndent(line: string, continuationIndent: string): string {
  if (isBlankLine(line)) return "";
  const content = stripLineEnding(line);
  const stripped = content.startsWith(continuationIndent) ? content.slice(continuationIndent.length) : content.replace(/^[ \t]+/, "");
  return unescapeBulletLikeLine(stripped);
}

function lastLineEnding(textLines: readonly string[]): string {
  return /\r?\n$/.exec(textLines[textLines.length - 1] ?? "")?.[0] ?? "";
}

function assignIds(lines: readonly ParsedListLine[], jsonIds: ReadonlySet<NodeId>, random: () => number): AssignedId[] {
  const taken = new Set<NodeId>(jsonIds);
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

function deriveIndentUnitFromItems(lines: readonly ParsedListLine[], placements: readonly Placement[]): string {
  const childIndex = placements.findIndex((placement) => placement.parentIndex !== null);
  const parentIndex = placements[childIndex]?.parentIndex;
  const child = lines[childIndex];
  const parent = parentIndex === undefined || parentIndex === null ? undefined : lines[parentIndex];
  return child === undefined || parent === undefined ? DEFAULT_INDENT_UNIT : deriveIndentUnit(parent.prefix, child.prefix);
}

function parentIdOf(placement: Placement, ids: readonly AssignedId[]): NodeId | null {
  return placement.parentIndex === null ? null : at(ids, placement.parentIndex).id;
}

function toSourceItem(line: ParsedListLine, depth: number, hasWrittenId: boolean): SourceItem {
  return {
    rawLines: line.rawLines,
    prefix: line.prefix,
    lineEnding: line.lineEnding,
    finalLineEnding: line.finalLineEnding,
    continuationIndent: line.continuationIndent,
    trailingBlankLines: line.trailingBlankLines,
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
