const HARD_BREAK = "  ";
const FENCE_PATTERN = /^\s*(```|~~~)/;

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === "";
}

function canTakeHardBreak(line: string, nextLine: string | undefined): boolean {
  return !isBlank(line) && !isBlank(nextLine) && !line.endsWith("\\") && !line.endsWith(HARD_BREAK);
}

/**
 * Makes every line break of the source a hard break in the rendered output, whatever the
 * "Strict line breaks" setting says. Fenced code is left untouched.
 */
export function withHardLineBreaks(markdown: string): string {
  const lines = markdown.split("\n");
  let isInsideFence = false;
  return lines
    .map((line, index) => {
      const isFence = FENCE_PATTERN.test(line);
      if (isFence) isInsideFence = !isInsideFence;
      if (isFence || isInsideFence || !canTakeHardBreak(line, lines[index + 1])) return line;
      return line + HARD_BREAK;
    })
    .join("\n");
}
