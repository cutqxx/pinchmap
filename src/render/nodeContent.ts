import type { NodeId } from "../model";

/** Draws Markdown into an element; implemented outside render/ (by the Obsidian adapter). */
export interface NodeContentRenderer {
  render(target: HTMLElement, markdown: string): RenderedNodeContent;
}

export interface RenderedNodeContent {
  /** Resolves once the content is drawn; never rejects (the renderer falls back to raw text). */
  readonly settled: Promise<void>;
  unload(): void;
}

const MARKDOWN_CLASS = "pinchmap-node-markdown markdown-rendered";
const READY_CLASS = "is-ready";
const HAS_MARKDOWN_CLASS = "has-rendered-markdown";

interface ContentState {
  readonly id: NodeId;
  readonly source: string;
  readonly element: HTMLElement;
  readonly container: HTMLElement;
  readonly rendered: RenderedNodeContent;
}

/**
 * Keeps a rendered Markdown layer next to each node's raw text. The raw text stays visible
 * while a new render is pending; the layers are swapped once, when the render has settled.
 */
export class NodeContentLayer {
  private readonly states = new Map<NodeId, ContentState>();

  constructor(
    private readonly renderer: NodeContentRenderer,
    private readonly onSettled: (id: NodeId) => void,
  ) {}

  /** Re-renders only when the source differs from the one last rendered for this node. */
  sync(id: NodeId, element: HTMLElement, source: string): void {
    if (this.states.get(id)?.source === source) return;
    this.remove(id);
    if (source.trim() !== "") this.start(id, element, source);
  }

  remove(id: NodeId): void {
    const state = this.states.get(id);
    if (state === undefined) return;
    this.states.delete(id);
    state.rendered.unload();
    state.container.remove();
    state.element.classList.remove(HAS_MARKDOWN_CLASS);
  }

  destroy(): void {
    for (const id of [...this.states.keys()]) this.remove(id);
  }

  private start(id: NodeId, element: HTMLElement, source: string): void {
    const container = element.ownerDocument.createElement("div");
    container.className = MARKDOWN_CLASS;
    element.appendChild(container);
    const rendered = this.renderer.render(container, source);
    const state: ContentState = { id, source, element, container, rendered };
    this.states.set(id, state);
    void rendered.settled.then(() => this.show(state));
  }

  private show(state: ContentState): void {
    if (this.states.get(state.id) !== state) return;
    state.container.classList.add(READY_CLASS);
    state.element.classList.add(HAS_MARKDOWN_CLASS);
    this.onSettled(state.id);
  }
}
