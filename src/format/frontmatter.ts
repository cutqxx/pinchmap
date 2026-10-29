import { splitLines, stripLineEnding } from "./lines";

const FRONTMATTER_FENCE = "---";
const FRONTMATTER_CLOSERS = [FRONTMATTER_FENCE, "..."];
const MINDMAP_FLAG = /^mindmap:\s*true\s*$/i;

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
