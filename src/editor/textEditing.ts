import { setNodeText } from "../commands";
import { getNode } from "../model";
import type { MindMap, NodeId } from "../model";
import type { Selection } from "./selection";
import { beginTextEdit } from "./textEditSession";
import type { TextEditEnd, TextEditSession } from "./textEditSession";

export interface EditingState {
  readonly nodeId: NodeId;
  readonly session: TextEditSession;
  draftText: string;
  readonly newNode: NewNodeOrigin | null;
}

export interface NewNodeOrigin {
  readonly mapBeforeCreation: MindMap;
  readonly selectionBeforeCreation: NodeId | null;
}

export interface EditingDraft {
  readonly nodeId: NodeId;
  readonly draftText: string;
}

export interface TextEditingDeps {
  readonly selection: Selection;
  readonly canvasElement: HTMLElement;
  getNodeElement(nodeId: NodeId): HTMLElement | undefined;
  getDisplayMap(): MindMap;
  replaceDisplayMap(map: MindMap): void;
  applyEdit(command: (map: MindMap) => MindMap): void;
  focusCanvas(): void;
  scheduleFrame(): void;
  onTextEditEnded(): void;
}

/**
 * One edit session = one change: the map is only edited when the session ends,
 * either by committing the final text or by discarding a new node left empty.
 */
export class TextEditing {
  private editing: EditingState | null = null;

  constructor(private readonly deps: TextEditingDeps) {}

  /**
   * The map as it should be persisted. While a newly created node is still being
   * typed into, the display map already contains it but the persisted map does not.
   */
  persistedMap(): MindMap {
    return this.editing?.newNode?.mapBeforeCreation ?? this.deps.getDisplayMap();
  }

  isEditing(): boolean {
    return this.editing !== null;
  }

  currentDraft(): EditingDraft | null {
    const editing = this.editing;
    return editing && { nodeId: editing.nodeId, draftText: editing.draftText };
  }

  commit(end?: TextEditEnd): void {
    this.editing?.session.commit(end);
  }

  cancel(): void {
    this.editing?.session.cancel();
    this.editing = null;
  }

  beginEditing(nodeId: NodeId, newNode: NewNodeOrigin | null): void {
    const nodeElement = this.deps.getNodeElement(nodeId);
    if (nodeElement === undefined) return;
    const text = getNode(this.deps.getDisplayMap(), nodeId).text;
    this.editing = {
      nodeId,
      draftText: text,
      newNode,
      session: beginTextEdit({
        nodeElement,
        initialText: text,
        onDraftChanged: (draft) => this.updateDraft(draft),
        onCommitted: (finalText, end) => this.finishEditing(nodeId, finalText, end),
      }),
    };
    this.deps.scheduleFrame();
  }

  private updateDraft(draftText: string): void {
    if (this.editing === null) return;
    this.editing.draftText = draftText;
    this.deps.scheduleFrame();
  }

  private finishEditing(nodeId: NodeId, finalText: string, end: TextEditEnd): void {
    const newNode = this.editing?.newNode ?? null;
    this.editing = null;
    if (newNode !== null && finalText === "") {
      this.discardNewNode(newNode);
    } else {
      this.commitText(nodeId, finalText);
    }
    if (this.shouldRefocusCanvas(end)) this.deps.focusCanvas();
    this.deps.scheduleFrame();
    this.deps.onTextEditEnded();
  }

  private shouldRefocusCanvas(end: TextEditEnd): boolean {
    if (end.kind === "keyboard") return true;
    if (end.kind === "programmatic") return false;
    const target = end.focusTarget;
    return target instanceof Node && this.deps.canvasElement.contains(target);
  }

  private discardNewNode({ mapBeforeCreation, selectionBeforeCreation }: NewNodeOrigin): void {
    this.deps.replaceDisplayMap(mapBeforeCreation);
    this.deps.selection.set(selectionBeforeCreation);
  }

  private commitText(nodeId: NodeId, finalText: string): void {
    this.deps.applyEdit((map) => setNodeText(map, { nodeId, text: finalText }));
  }
}
