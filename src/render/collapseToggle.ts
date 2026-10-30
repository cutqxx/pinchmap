import { countDescendants, isNodeCollapsed } from "../model";
import type { MapNode, MindMap } from "../model";

export interface CollapseToggleLabels {
  readonly collapse: string;
  readonly expand: string;
}

export const DEFAULT_COLLAPSE_TOGGLE_LABELS: CollapseToggleLabels = { collapse: "Collapse", expand: "Expand" };

const TOGGLE_CLASS = "pinchmap-collapse-toggle";
const MARK_CLASS = "pinchmap-collapse-mark";
const EXPANDED_MARK = "−";

/** Keeps the indicator in step with the node: present only for nodes with children, showing the hidden count when collapsed. */
export function syncCollapseToggle(
  element: HTMLElement,
  node: MapNode,
  map: MindMap,
  labels: CollapseToggleLabels,
): void {
  const existing = element.querySelector(`:scope > .${TOGGLE_CLASS}`);
  const hasChildren = node.childIds.length > 0;
  element.classList.toggle("has-collapse-toggle", hasChildren);
  if (!hasChildren) return existing?.remove();
  const toggle = existing ?? appendToggle(element, node);
  const isCollapsed = isNodeCollapsed(node);
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  toggle.setAttribute("aria-label", isCollapsed ? labels.expand : labels.collapse);
  const mark = toggle.firstElementChild;
  if (mark !== null) mark.textContent = isCollapsed ? String(countDescendants(map, node.id)) : EXPANDED_MARK;
}

function appendToggle(element: HTMLElement, node: MapNode): Element {
  const doc = element.ownerDocument;
  const toggle = doc.createElement("div");
  toggle.className = TOGGLE_CLASS;
  toggle.setAttribute("data-pinchmap-hit", "collapse-toggle");
  toggle.setAttribute("data-node-id", node.id);
  toggle.setAttribute("role", "button");
  toggle.appendChild(doc.createElement("span")).className = MARK_CLASS;
  element.appendChild(toggle);
  return toggle;
}
