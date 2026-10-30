import type { NodeId } from "../model";

export const TRAILING_ID = /(?:^|[ \t])\^([A-Za-z0-9_-]+)[ \t]*$/;

export function composeItemContent(text: string, id: NodeId, hasWrittenId: boolean): string {
  const mustWriteId = hasWrittenId || TRAILING_ID.test(text);
  return mustWriteId ? [text, `^${id}`].filter((part) => part !== "").join(" ") : text;
}
