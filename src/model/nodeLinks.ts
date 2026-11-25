export type NodeLinkKind = "wiki" | "external";

export interface NodeLink {
  readonly kind: NodeLinkKind;
  /** What opens the link: a note path with an optional `#heading`, or a URL. */
  readonly target: string;
  /** What the link says: its alias or text, falling back to the target. */
  readonly label: string;
}

export const IMAGE_EXTENSIONS: readonly string[] = ["png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "avif"];

const LINK_PATTERN = new RegExp(
  [
    String.raw`(?<wikiBang>!?)\[\[(?<wikiInner>[^\[\]\n]+)\]\]`,
    String.raw`(?<markdownBang>!?)\[(?<markdownText>[^\[\]\n]*)\]\((?<markdownUrl>https?://[^\s)]+)(?:\s+"[^"\n]*")?\)`,
    String.raw`(?<bareUrl>https?://[^\s<>\[\]()]+)`,
  ].join("|"),
  "g",
);

const FENCE_PATTERN = /^\s*(```|~~~)/;
const INLINE_CODE_PATTERN = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
const TRAILING_URL_PUNCTUATION = /[.,;:!?'"]+$/;

/** The links of a node's text in reading order, without duplicates. Code and image embeds are not links. */
export function findNodeLinks(text: string): NodeLink[] {
  const links = [...blankOutCode(text).matchAll(LINK_PATTERN)].flatMap((match) => linkOf(match.groups ?? {}));
  return withoutDuplicates(links);
}

function blankOutCode(text: string): string {
  let isInsideFence = false;
  const lines = text.split("\n").map((line) => {
    const isFenceLine = FENCE_PATTERN.test(line);
    const isCode = isInsideFence || isFenceLine;
    if (isFenceLine) isInsideFence = !isInsideFence;
    return isCode ? "" : line.replace(INLINE_CODE_PATTERN, " ");
  });
  return lines.join("\n");
}

function linkOf(groups: Readonly<Record<string, string | undefined>>): NodeLink[] {
  if (groups.wikiInner !== undefined) return wikiLinkOf(groups.wikiInner, groups.wikiBang === "!");
  if (groups.markdownUrl !== undefined && groups.markdownBang !== "!") {
    return [externalLink(groups.markdownUrl, groups.markdownText?.trim() ?? "")];
  }
  if (groups.bareUrl !== undefined) return [externalLink(groups.bareUrl.replace(TRAILING_URL_PUNCTUATION, ""), "")];
  return [];
}

function wikiLinkOf(inner: string, isEmbed: boolean): NodeLink[] {
  const [rawTarget = "", ...aliasParts] = inner.split("|");
  const target = rawTarget.trim();
  if (target === "" || (isEmbed && isImagePath(target))) return [];
  return [{ kind: "wiki", target, label: aliasParts.join("|").trim() || target }];
}

function externalLink(url: string, text: string): NodeLink {
  return { kind: "external", target: url, label: text || url };
}

function isImagePath(target: string): boolean {
  const path = target.split("#")[0] ?? "";
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return path.includes(".") && IMAGE_EXTENSIONS.includes(extension);
}

function withoutDuplicates(links: readonly NodeLink[]): NodeLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = `${link.kind} ${link.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
