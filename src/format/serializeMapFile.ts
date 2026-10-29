import { listNodesInDocumentOrder } from "../model";
import type { MapNode, MindMap } from "../model";
import { rewriteItemLines } from "./sourceLayout";
import type { SourceItem, SourceLayout } from "./sourceLayout";
import { composeItemContent } from "./trailingId";

const NEW_ITEM_INDENT = "\t";

export function serializeMapFile(map: MindMap, source: SourceLayout): string {
  const itemLines = listNodesInDocumentOrder(map).flatMap(({ node, depth }) =>
    linesForNode(node, depth, source.items.get(node.id)),
  );
  return source.head + itemLines.join("") + source.tail;
}

function linesForNode(node: MapNode, depth: number, item: SourceItem | undefined): readonly string[] {
  if (item === undefined) {
    return [`${NEW_ITEM_INDENT.repeat(depth)}- ${composeItemContent(node.text, node.id, false)}\n`];
  }
  const isUnchanged = item.text === node.text && item.depth === depth;
  return isUnchanged ? item.rawLines : rewriteItemLines(item, node.id, node.text);
}
