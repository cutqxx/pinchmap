import type { NodeId } from "../model";
import { composeItemContent } from "./trailingId";

export interface SourceItem {
  readonly rawLines: readonly string[];
  readonly prefix: string;
  readonly lineEnding: string;
  readonly text: string;
  readonly depth: number;
  readonly hasWrittenId: boolean;
}

export interface SourceLayout {
  readonly head: string;
  readonly tail: string;
  readonly items: ReadonlyMap<NodeId, SourceItem>;
}

export function rewriteItemLines(item: SourceItem, id: NodeId, text: string): string[] {
  const content = composeItemContent(text, id, item.hasWrittenId);
  return [`${item.prefix}${content}${item.lineEnding}`];
}
