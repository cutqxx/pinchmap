import { getNode, listNodesInDocumentOrder } from "../model";
import type { MapNode, MindMap, NodeId } from "../model";
import { detectLineEnding, withJsonBlock, withJsonBlockInHead } from "./jsonBlock";
import { leadingWhitespace, measureIndent, reindentItem, renderNewItemLines, rewriteItemLines } from "./sourceLayout";
import type { SourceLayout } from "./sourceLayout";

export function serializeMapFile(map: MindMap, source: SourceLayout): string {
  const isEdited = map !== source.loadedMap;
  const items = serializeItems(map, source, isEdited);
  if (!isEdited) return source.head + items + source.tail;
  if (source.json.location === "head") return withJsonBlockInHead(source.head, items + source.tail, map, source.json);
  return withJsonBlock(source.head + items, source.tail, map, source.json);
}

/** The indent an item was written with, and whether it is the indent it had in the loaded file. */
interface WrittenIndent {
  readonly indent: string;
  readonly isFromSource: boolean;
}

function serializeItems(map: MindMap, source: SourceLayout, isEdited: boolean): string {
  const written = new Map<NodeId, WrittenIndent>();
  const chunks = listNodesInDocumentOrder(map).map(({ node }) => {
    const indent = indentFor(node, map, source, written);
    written.set(node.id, indent);
    return linesForNode(node, indent, source, isEdited).join("");
  });
  return terminateAllButLast(chunks).join("");
}

/**
 * An item keeps its indent from the file while it stays under the same, unmoved parent and is not
 * indented deeper than its previous sibling (which would nest it under that sibling). Any other item
 * lines up with its previous sibling, or sits one indent unit deeper than its parent, so the written
 * list parses back to the same tree even when the file's indentation is uneven.
 */
function indentFor(node: MapNode, map: MindMap, source: SourceLayout, written: ReadonlyMap<NodeId, WrittenIndent>): WrittenIndent {
  const siblings = node.parentId === null ? map.rootIds : getNode(map, node.parentId).childIds;
  const previousSiblingId = siblings[siblings.indexOf(node.id) - 1];
  const previousSibling = previousSiblingId === undefined ? undefined : written.get(previousSiblingId);
  const sourceIndent = indentFromSource(node, source, written);
  const fitsAfterPreviousSibling =
    sourceIndent !== null && (previousSibling === undefined || measureIndent(previousSibling.indent) >= measureIndent(sourceIndent));
  if (sourceIndent !== null && fitsAfterPreviousSibling) return { indent: sourceIndent, isFromSource: true };
  const parent = node.parentId === null ? undefined : written.get(node.parentId);
  const indent = previousSibling?.indent ?? (parent === undefined ? "" : parent.indent + source.indentUnit);
  return { indent, isFromSource: false };
}

function indentFromSource(node: MapNode, source: SourceLayout, written: ReadonlyMap<NodeId, WrittenIndent>): string | null {
  const loadedItem = source.items.get(node.id);
  const loadedParentId = source.loadedMap.nodes.get(node.id)?.parentId;
  const isParentFromSource = node.parentId === null || written.get(node.parentId)?.isFromSource === true;
  const isUnderSameParent = loadedItem !== undefined && loadedParentId === node.parentId && isParentFromSource;
  return isUnderSameParent ? leadingWhitespace(loadedItem.prefix) : null;
}

function linesForNode(node: MapNode, { indent, isFromSource }: WrittenIndent, source: SourceLayout, isEdited: boolean): readonly string[] {
  const loadedItem = source.items.get(node.id);
  if (loadedItem === undefined) {
    return renderNewItemLines(indent, node.text, node.id);
  }
  const item = isFromSource ? loadedItem : reindentItem(loadedItem, indent);
  const needsId = isEdited && !item.hasWrittenId;
  const isUnchanged = item.text === node.text && isFromSource && !needsId;
  return isUnchanged ? item.rawLines : rewriteItemLines({ ...item, hasWrittenId: item.hasWrittenId || isEdited }, node.id, node.text);
}

/** The file's last item may lack a final newline; once another item follows it, its line must be ended. */
function terminateAllButLast(chunks: readonly string[]): string[] {
  const lineEnding = detectLineEnding(chunks.join(""));
  return chunks.map((chunk, index) =>
    index === chunks.length - 1 || chunk.endsWith("\n") ? chunk : chunk + lineEnding,
  );
}
