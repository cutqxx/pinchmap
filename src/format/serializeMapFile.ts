import { listNodesInDocumentOrder } from "../model";
import type { MapNode, MindMap } from "../model";
import { withJsonBlock, withJsonBlockInHead } from "./jsonBlock";
import { renderNewItemLines, rewriteItemLines } from "./sourceLayout";
import type { SourceLayout } from "./sourceLayout";

export function serializeMapFile(map: MindMap, source: SourceLayout): string {
  const isEdited = map !== source.loadedMap;
  const itemLines = listNodesInDocumentOrder(map).flatMap(({ node, depth }) =>
    linesForNode(node, depth, source, isEdited),
  );
  const items = itemLines.join("");
  if (!isEdited) return source.head + items + source.tail;
  if (source.json.location === "head") return withJsonBlockInHead(source.head, items + source.tail, map, source.json);
  return withJsonBlock(source.head + items, source.tail, map, source.json);
}

function linesForNode(node: MapNode, depth: number, source: SourceLayout, isEdited: boolean): readonly string[] {
  const item = source.items.get(node.id);
  if (item === undefined) {
    return renderNewItemLines(source.indentUnit.repeat(depth), node.text, node.id);
  }
  const needsId = isEdited && !item.hasWrittenId;
  const isUnchanged = item.text === node.text && item.depth === depth && !needsId;
  return isUnchanged ? item.rawLines : rewriteItemLines({ ...item, hasWrittenId: item.hasWrittenId || isEdited }, node.id, node.text);
}
