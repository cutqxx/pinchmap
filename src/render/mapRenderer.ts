import type { LayoutResult, Point, Size } from "../layout";
import type { MapNode, MindMap, NodeId } from "../model";
import type { Camera } from "../viewport";
import { edgePath } from "./edgePath";

export interface RenderUi {
  readonly editing: { readonly nodeId: NodeId; readonly draftText: string } | null;
  readonly selectedId: NodeId | null;
}

export interface AddButtonLabels {
  readonly addChild: string;
  readonly addSibling: string;
}

export interface MapRendererOptions {
  readonly labels?: AddButtonLabels;
}

const DEFAULT_LABELS: AddButtonLabels = { addChild: "Add child", addSibling: "Add sibling" };

const ADD_BUTTON_CLASS = "pinchmap-add-button";
const ADD_BUTTON_KINDS = ["add-child", "add-sibling"] as const;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export class MapRenderer {
  readonly canvasElement: HTMLElement;
  private readonly worldElement: HTMLElement;
  private readonly edgesElement: SVGSVGElement;
  private readonly nodeElements = new Map<NodeId, HTMLElement>();
  private readonly edgeElements = new Map<NodeId, SVGPathElement>();
  private readonly sizes = new Map<NodeId, Size>();
  private readonly dirtyIds = new Set<NodeId>();

  private readonly labels: AddButtonLabels;

  constructor(container: HTMLElement, { labels = DEFAULT_LABELS }: MapRendererOptions = {}) {
    this.labels = labels;
    const doc = container.ownerDocument;
    this.canvasElement = doc.createElement("div");
    this.canvasElement.className = "pinchmap-canvas";
    this.canvasElement.setAttribute("data-pinchmap-hit", "canvas");
    this.worldElement = doc.createElement("div");
    this.worldElement.className = "pinchmap-world";
    this.canvasElement.tabIndex = 0;
    this.edgesElement = doc.createElementNS(SVG_NAMESPACE, "svg");
    this.edgesElement.setAttribute("class", "pinchmap-edges");
    this.worldElement.appendChild(this.edgesElement);
    this.canvasElement.appendChild(this.worldElement);
    container.appendChild(this.canvasElement);
  }

  getNodeElement(id: NodeId): HTMLElement | undefined {
    return this.nodeElements.get(id);
  }

  focusCanvas(): void {
    this.canvasElement.focus({ preventScroll: true });
  }

  setCamera(camera: Camera): void {
    this.worldElement.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    this.worldElement.style.setProperty("--pinchmap-zoom", String(camera.zoom));
  }

  setGestureActive(isActive: boolean): void {
    this.worldElement.style.willChange = isActive ? "transform" : "";
  }

  syncContent(map: MindMap, ui: RenderUi): void {
    this.removeStaleElements(map);
    for (const node of map.nodes.values()) {
      this.syncNodeElement(node, ui);
      this.ensureEdgeElement(node);
    }
  }

  measure(): ReadonlyMap<NodeId, Size> {
    for (const id of [...this.dirtyIds]) {
      this.measureNode(id);
    }
    return this.sizes;
  }

  place(map: MindMap, layout: LayoutResult): void {
    for (const [id, position] of layout.positions) {
      const element = this.nodeElements.get(id);
      if (element === undefined) continue;
      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
    }
    for (const node of map.nodes.values()) {
      this.placeEdge(node, layout);
    }
  }

  destroy(): void {
    this.canvasElement.remove();
    this.nodeElements.clear();
    this.edgeElements.clear();
  }

  private removeStaleElements(map: MindMap): void {
    for (const [id, element] of this.nodeElements) {
      if (map.nodes.has(id)) continue;
      element.remove();
      this.edgeElements.get(id)?.remove();
      this.nodeElements.delete(id);
      this.edgeElements.delete(id);
      this.sizes.delete(id);
      this.dirtyIds.delete(id);
    }
  }

  private syncNodeElement(node: MapNode, ui: RenderUi): void {
    const element = this.nodeElements.get(node.id) ?? this.createNodeElement(node.id);
    const isEditing = ui.editing?.nodeId === node.id;
    const displayedText = isEditing ? (ui.editing?.draftText ?? node.text) : node.text;
    const textElement = element.firstElementChild;
    if (textElement !== null && textElement.textContent !== displayedText) {
      textElement.textContent = displayedText;
      this.dirtyIds.add(node.id);
    }
    element.classList.toggle("is-editing", isEditing);
    element.classList.toggle("is-root", node.parentId === null);
    const isSelected = ui.selectedId === node.id;
    element.classList.toggle("is-selected", isSelected);
    this.syncAddButtons(element, node.id, isSelected && !isEditing);
  }

  private syncAddButtons(element: HTMLElement, id: NodeId, shouldShow: boolean): void {
    const existing = element.querySelectorAll(`.${ADD_BUTTON_CLASS}`);
    if (shouldShow === (existing.length > 0)) return;
    existing.forEach((button) => button.remove());
    if (!shouldShow) return;
    ADD_BUTTON_KINDS.forEach((kind) => element.appendChild(this.createAddButton(kind, id)));
  }

  private createAddButton(kind: (typeof ADD_BUTTON_KINDS)[number], id: NodeId): HTMLElement {
    const button = this.canvasElement.ownerDocument.createElement("div");
    button.className = `${ADD_BUTTON_CLASS} is-${kind === "add-child" ? "child" : "sibling"}`;
    button.setAttribute("data-pinchmap-hit", kind);
    button.setAttribute("data-node-id", id);
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", kind === "add-child" ? this.labels.addChild : this.labels.addSibling);
    return button;
  }

  private createNodeElement(id: NodeId): HTMLElement {
    const doc = this.canvasElement.ownerDocument;
    const element = doc.createElement("div");
    element.className = "pinchmap-node";
    element.setAttribute("data-pinchmap-hit", "node");
    element.setAttribute("data-node-id", id);
    element.appendChild(doc.createElement("span")).className = "pinchmap-node-text";
    this.worldElement.appendChild(element);
    this.nodeElements.set(id, element);
    this.dirtyIds.add(id);
    return element;
  }

  private ensureEdgeElement(node: MapNode): void {
    if (node.parentId === null || this.edgeElements.has(node.id)) return;
    const path = this.canvasElement.ownerDocument.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("class", "pinchmap-edge");
    this.edgesElement.appendChild(path);
    this.edgeElements.set(node.id, path);
  }

  private measureNode(id: NodeId): void {
    const element = this.nodeElements.get(id);
    if (element === undefined) return;
    const size = { width: element.offsetWidth, height: element.offsetHeight };
    if (size.width === 0 && size.height === 0) return;
    this.sizes.set(id, size);
    this.dirtyIds.delete(id);
  }

  private placeEdge(node: MapNode, layout: LayoutResult): void {
    const path = this.edgeElements.get(node.id);
    if (path === undefined || node.parentId === null) return;
    const isLeftOfParent = this.isLeftOfParent(node.id, node.parentId, layout);
    const start = this.edgeAnchor(node.parentId, layout, isLeftOfParent ? 0 : 1);
    const end = this.edgeAnchor(node.id, layout, isLeftOfParent ? 1 : 0);
    if (start === null || end === null) return;
    path.setAttribute("d", edgePath(start, end));
  }

  private isLeftOfParent(id: NodeId, parentId: NodeId, layout: LayoutResult): boolean {
    const position = layout.positions.get(id);
    const parentPosition = layout.positions.get(parentId);
    if (position === undefined || parentPosition === undefined) return false;
    return position.x < parentPosition.x;
  }

  private edgeAnchor(id: NodeId, layout: LayoutResult, widthFraction: 0 | 1): Point | null {
    const position = layout.positions.get(id);
    const size = this.sizes.get(id);
    if (position === undefined || size === undefined) return null;
    return { x: position.x + size.width * widthFraction, y: position.y + size.height / 2 };
  }
}
