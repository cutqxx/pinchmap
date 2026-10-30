import { detectLineEnding } from "./jsonBlock";
import { splitLines, stripLineEnding } from "./lines";

const FRONTMATTER_FENCE = "---";
const FRONTMATTER_CLOSERS = [FRONTMATTER_FENCE, "..."];
/** What YAML reads as boolean true here (and so what Obsidian's metadata cache reports), with an optional trailing comment. */
const MINDMAP_FLAG = /^mindmap:[ \t]*(true|True|TRUE)([ \t]+#.*|[ \t]*)$/;
const MINDMAP_KEY = /^mindmap\s*:/;
const MINDMAP_FLAG_LINE = "mindmap: true";

export function countFrontmatterLines(lines: readonly string[]): number {
  const firstLine = lines[0];
  if (firstLine === undefined || stripLineEnding(firstLine) !== FRONTMATTER_FENCE) {
    return 0;
  }
  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && FRONTMATTER_CLOSERS.includes(stripLineEnding(line)),
  );
  return closingIndex === -1 ? 0 : closingIndex + 1;
}

export function hasMindmapFlag(text: string): boolean {
  const lines = splitLines(text);
  const frontmatterLength = countFrontmatterLines(lines);
  return lines
    .slice(1, Math.max(frontmatterLength - 1, 0))
    .some((line) => MINDMAP_FLAG.test(stripLineEnding(line)));
}

export function withMindmapFlag(text: string): string {
  const lineEnding = detectLineEnding(text);
  const lines = splitLines(text);
  const frontmatterLength = countFrontmatterLines(lines);
  if (frontmatterLength === 0) {
    return [FRONTMATTER_FENCE, MINDMAP_FLAG_LINE, FRONTMATTER_FENCE].join(lineEnding) + lineEnding + text;
  }
  const closingIndex = frontmatterLength - 1;
  const keyIndex = lines.findIndex((line, index) => index > 0 && index < closingIndex && MINDMAP_KEY.test(line));
  if (keyIndex !== -1) {
    return lines.map((line, index) => (index === keyIndex ? MINDMAP_FLAG_LINE + lineEndingOf(line) : line)).join("");
  }
  return [...lines.slice(0, closingIndex), MINDMAP_FLAG_LINE + lineEnding, ...lines.slice(closingIndex)].join("");
}

function lineEndingOf(line: string): string {
  return /\r?\n$/.exec(line)?.[0] ?? "";
}
