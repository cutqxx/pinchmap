import { listNodesInDocumentOrder } from "../model";
import type { MapNode, MindMap } from "../model";
import { renderNewItemLines, rewriteItemLines } from "./sourceLayout";
import type { SourceLayout } from "./sourceLayout";

export function serializeMapFile(map: MindMap, source: SourceLayout): string {
  const itemLines = listNodesInDocumentOrder(map).flatMap(({ node, depth }) =>
    linesForNode(node, depth, source),
  );
  return source.head + itemLines.join("") + source.tail;
}

function linesForNode(node: MapNode, depth: number, source: SourceLayout): readonly string[] {
  const item = source.items.get(node.id);
  if (item === undefined) {
    return renderNewItemLines(source.indentUnit.repeat(depth), node.text, node.id);
  }
  const isUnchanged = item.text === node.text && item.depth === depth;
  return isUnchanged ? item.rawLines : rewriteItemLines(item, node.id, node.text);
}
