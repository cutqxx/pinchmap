export function splitLines(text: string): string[] {
  const lines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === "\n") {
      lines.push(text.slice(lineStart, i + 1));
      lineStart = i + 1;
    }
  }
  if (lineStart < text.length) {
    lines.push(text.slice(lineStart));
  }
  return lines;
}

export function stripLineEnding(line: string): string {
  return line.replace(/\r?\n$/, "");
}
