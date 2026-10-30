import { escapeBulletLikeLine, unescapeBulletLikeLine } from "./sourceLayout";

const ORDERED_LIKE_LINE = /^([ \t]*\d+)(\\*[.)][ \t])/;
const ESCAPED_ORDERED_LIKE_LINE = /^([ \t]*\d+)\\(\\*[.)][ \t])/;
const BARE_BULLET_LINE = /^([ \t]*)(\\*[-*+])$/;
const ESCAPED_BARE_BULLET_LINE = /^([ \t]*)\\(\\*[-*+])$/;

/**
 * A continuation line that the clipboard parser would read as a list item gets a backslash, like the file format does.
 * The backslash goes after any leading whitespace, since the parser also reads indented list lines as items.
 */
export function escapeContinuationLine(line: string): string {
  return escapeBulletLikeLine(line).replace(ORDERED_LIKE_LINE, "$1\\$2").replace(BARE_BULLET_LINE, "$1\\$2");
}

export function unescapeContinuationLine(line: string): string {
  return unescapeBulletLikeLine(line).replace(ESCAPED_ORDERED_LIKE_LINE, "$1$2").replace(ESCAPED_BARE_BULLET_LINE, "$1$2");
}

const ID_LIKE_ENDING = /(^|[ \t])(\\*\^[A-Za-z0-9_-]+[ \t]*)$/;
const ESCAPED_ID_LIKE_ENDING = /(^|[ \t])\\(\\*\^[A-Za-z0-9_-]+[ \t]*)$/;

/**
 * A line that ends like a `^id` gets a backslash before the caret: the parser does not strip it as an id, and a
 * normal note shows it as the plain `^word` (Obsidian does not read `\^word` as a block id). No real ID leaks out.
 */
export function escapeIdLikeEnding(line: string): string {
  return line.replace(ID_LIKE_ENDING, "$1\\$2");
}

export function unescapeIdLikeEnding(line: string): string {
  return line.replace(ESCAPED_ID_LIKE_ENDING, "$1$2");
}

const CHECKBOX_LIKE_START = /^\\*\[[ xX]\](?:[ \t]|$)/;
const ESCAPED_CHECKBOX_LIKE_START = /^\\+\[[ xX]\](?:[ \t]|$)/;

/** An item's first line that starts like a task checkbox gets a backslash, since the parser strips real checkboxes. */
export function escapeCheckboxLikeStart(line: string): string {
  return CHECKBOX_LIKE_START.test(line) ? `\\${line}` : line;
}

export function unescapeCheckboxLikeStart(line: string): string {
  return ESCAPED_CHECKBOX_LIKE_START.test(line) ? line.slice(1) : line;
}
