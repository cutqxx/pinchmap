import { generateNodeId } from "../model";
import { detectLineEnding } from "./jsonBlock";
import { withMindmapFlag } from "./frontmatter";
import { renderNewItemLines } from "./sourceLayout";

export function buildNewMapText(random: () => number = Math.random): string {
  return appendRootItem(withMindmapFlag(""), "", random);
}

export function appendRootItem(text: string, rootText: string, random: () => number = Math.random): string {
  const id = generateNodeId(new Set(), random);
  const lineEnding = detectLineEnding(text);
  const terminated = text === "" || text.endsWith("\n") ? text : `${text}${lineEnding}`;
  const needsBlankLine = terminated !== "" && !/\n\r?\n$/.test(terminated);
  const separator = needsBlankLine ? lineEnding : "";
  return terminated + separator + renderNewItemLines("", rootText, id, lineEnding).join("");
}
