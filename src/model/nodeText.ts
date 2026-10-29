export function canonicalNodeText(text: string): string {
  const [firstLine = "", ...continuation] = text.replace(/\r\n?/g, "\n").trim().split("\n");
  const continuationLines = continuation.map((line) => (line.trim() === "" ? "" : line));
  const sharedIndent = longestSharedIndent(continuationLines.filter((line) => line !== ""));
  const dedented = continuationLines.map((line) => line.slice(sharedIndent.length));
  return [firstLine.trimEnd(), ...dedented].join("\n");
}

function longestSharedIndent(lines: readonly string[]): string {
  const indents = lines.map((line) => /^[ \t]*/.exec(line)?.[0] ?? "");
  return indents.reduce((shared, indent) => commonPrefix(shared, indent), indents[0] ?? "");
}

function commonPrefix(a: string, b: string): string {
  let length = 0;
  while (length < a.length && a[length] === b[length]) length++;
  return a.slice(0, length);
}
