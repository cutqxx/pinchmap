import { getNode } from "../model";
import type { MindMap, NodeId } from "../model";
import { escapeCheckboxLikeStart, escapeContinuationLine, escapeIdLikeEnding } from "./clipboardLines";

const INDENT = "\t";
const BULLET = "- ";

/** The branch as a nested Markdown list without `^id`; extra lines of a node are indented under its bullet. */
export function branchToMarkdown(map: MindMap, nodeId: NodeId): string {
  return branchLines(map, nodeId, 0).join("\n");
}

function branchLines(map: MindMap, nodeId: NodeId, depth: number): string[] {
  const node = getNode(map, nodeId);
  return [...itemLines(node.text, INDENT.repeat(depth)), ...node.childIds.flatMap((childId) => branchLines(map, childId, depth + 1))];
}

function itemLines(text: string, indent: string): string[] {
  const [firstLine = "", ...continuation] = text.split("\n");
  const continuationIndent = indent + " ".repeat(BULLET.length);
  return [
    `${indent}${BULLET}${escapeIdLikeEnding(escapeCheckboxLikeStart(firstLine))}`.trimEnd(),
    ...continuation.map((line) => (line === "" ? "" : `${continuationIndent}${escapeIdLikeEnding(escapeContinuationLine(line))}`)),
  ];
}
