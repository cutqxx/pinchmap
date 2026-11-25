const ICON_CLASS = "pinchmap-link-icon";
const MARK_CLASS = "pinchmap-link-mark";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LUCIDE_LINK_PATHS = [
  "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
  "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
];

export const DEFAULT_LINK_ICON_LABEL = "Link";

/** Keeps the link icon in step with the node: present only for nodes that have a link. */
export function syncLinkIcon(element: HTMLElement, nodeId: string, hasLinks: boolean, label: string): void {
  const existing = element.querySelector(`:scope > .${ICON_CLASS}`);
  if (!hasLinks) return existing?.remove();
  if (existing === null) element.appendChild(createLinkIcon(element.ownerDocument, nodeId, label));
}

function createLinkIcon(doc: Document, nodeId: string, label: string): HTMLElement {
  const icon = doc.createElement("div");
  icon.className = ICON_CLASS;
  icon.setAttribute("data-pinchmap-hit", "link-icon");
  icon.setAttribute("data-node-id", nodeId);
  icon.setAttribute("role", "button");
  icon.setAttribute("aria-label", label);
  const mark = icon.appendChild(doc.createElement("span"));
  mark.className = MARK_CLASS;
  mark.appendChild(createLinkSvg(doc));
  return icon;
}

function createLinkSvg(doc: Document): SVGElement {
  const svg = doc.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const definition of LUCIDE_LINK_PATHS) {
    const path = doc.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", definition);
    svg.appendChild(path);
  }
  return svg;
}
