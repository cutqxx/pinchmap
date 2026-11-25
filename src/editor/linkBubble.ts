import type { Intent } from "../input";
import { findNodeLinks, getNode } from "../model";
import type { MindMap, NodeId, NodeLink } from "../model";
import type { Rect } from "../viewport";
import { describeLinkTarget, placeBubble } from "./linkBubbleLayout";

export interface LinkBubbleLabels {
  readonly openLink: string;
}

export const DEFAULT_LINK_BUBBLE_LABELS: LinkBubbleLabels = { openLink: "Open link" };

export interface LinkBubbleDeps {
  /** The view container the bubble is placed in, right after the canvas. */
  readonly container: HTMLElement;
  readonly canvasElement: HTMLElement;
  readonly labels: LinkBubbleLabels;
  getMap(): MindMap;
  getNodeElement(nodeId: NodeId): HTMLElement | undefined;
  selectNode(nodeId: NodeId): void;
  openLink(link: NodeLink): void;
  /** Draws a named icon into the element; implemented outside editor/ (by the Obsidian adapter). */
  drawIcon(target: HTMLElement, iconName: string): void;
}

interface OpenBubble {
  readonly nodeId: NodeId;
  readonly element: HTMLElement;
}

const ICON_NAMES: Readonly<Record<NodeLink["kind"], string>> = { wiki: "file-text", external: "external-link" };
const ICON_CLASS = "pinchmap-link-bubble-icon";
const BUBBLE_CLASS = "pinchmap-link-bubble";
const BUTTON_CLASS = "pinchmap-link-bubble-button";
const TEXT_CLASS = "pinchmap-link-bubble-text";
const TARGET_CLASS = "pinchmap-link-bubble-target";

/** The popup that opens a node's link, shown over the node when its link icon is tapped. */
export class LinkBubble {
  private current: OpenBubble | null = null;

  constructor(private readonly deps: LinkBubbleDeps) {}

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** Opens the bubble of the node (selecting it), or closes it when it is already open for that node. */
  toggleFor(nodeId: NodeId): void {
    const wasOpenForNode = this.current?.nodeId === nodeId;
    this.close();
    if (wasOpenForNode) return;
    this.deps.selectNode(nodeId);
    this.open(nodeId);
  }

  close(): void {
    if (this.current === null) return;
    this.current.element.remove();
    this.current = null;
    this.doc.removeEventListener("pointerdown", this.closeOnPressOutside, true);
  }

  /** Any intent on the map dismisses the bubble, except taps on a link icon, which toggle it. */
  dismissOnIntent(intent: Intent): void {
    const isLinkIconIntent =
      (intent.type === "tap" || intent.type === "doubleTap") && intent.target.kind === "link-icon";
    if (!isLinkIconIntent) this.close();
  }

  destroy(): void {
    this.close();
  }

  private get doc(): Document {
    return this.deps.container.ownerDocument;
  }

  private open(nodeId: NodeId): void {
    const nodeElement = this.deps.getNodeElement(nodeId);
    const link = this.firstLinkOf(nodeId);
    if (nodeElement === undefined || link === undefined) return;
    const element = this.createElement(link);
    this.deps.container.appendChild(element);
    this.placeNextTo(element, nodeElement);
    this.current = { nodeId, element };
    this.doc.addEventListener("pointerdown", this.closeOnPressOutside, true);
  }

  private firstLinkOf(nodeId: NodeId): NodeLink | undefined {
    const map = this.deps.getMap();
    return map.nodes.has(nodeId) ? findNodeLinks(getNode(map, nodeId).text)[0] : undefined;
  }

  private createElement(link: NodeLink): HTMLElement {
    const bubble = this.doc.createElement("div");
    bubble.className = BUBBLE_CLASS;
    bubble.appendChild(this.createButton(link));
    return bubble;
  }

  private createButton(link: NodeLink): HTMLElement {
    const button = this.doc.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    const icon = button.appendChild(this.doc.createElement("span"));
    icon.className = ICON_CLASS;
    this.deps.drawIcon(icon, ICON_NAMES[link.kind]);
    const text = button.appendChild(this.doc.createElement("span"));
    text.className = TEXT_CLASS;
    text.appendChild(this.doc.createElement("span")).textContent = this.deps.labels.openLink;
    const target = text.appendChild(this.doc.createElement("span"));
    target.className = TARGET_CLASS;
    target.textContent = describeLinkTarget(link);
    button.addEventListener("click", () => this.openAndClose(link));
    return button;
  }

  private openAndClose(link: NodeLink): void {
    this.close();
    this.deps.openLink(link);
  }

  private placeNextTo(bubble: HTMLElement, nodeElement: HTMLElement): void {
    const at = placeBubble(
      rectOf(nodeElement),
      { width: bubble.offsetWidth, height: bubble.offsetHeight },
      rectOf(this.deps.canvasElement),
    );
    bubble.style.left = `${at.x}px`;
    bubble.style.top = `${at.y}px`;
  }

  /** Presses on the canvas reach the bubble as intents; this only covers presses elsewhere on the page. */
  private readonly closeOnPressOutside = (event: Event): void => {
    const target = event.target as Node | null;
    if (target === null) return;
    const isInsideBubble = this.current?.element.contains(target) === true;
    if (!isInsideBubble && !this.deps.canvasElement.contains(target)) this.close();
  };
}

function rectOf(element: HTMLElement): Rect {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
}
