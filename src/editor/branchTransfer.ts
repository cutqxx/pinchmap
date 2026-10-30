import type { BranchDraft, MindMap, NodeId } from "../model";

/** Moves branches in and out of the system clipboard; the host decides how text is stored and read. */
export interface BranchClipboard {
  writeBranch(map: MindMap, nodeId: NodeId): Promise<void>;
  /** Resolves to no drafts when the clipboard is empty, holds no text, or cannot be read. */
  readBranches(): Promise<readonly BranchDraft[]>;
}

export const UNAVAILABLE_BRANCH_CLIPBOARD: BranchClipboard = {
  writeBranch: () => Promise.resolve(),
  readBranches: () => Promise.resolve([]),
};

export interface BranchTransferDeps {
  readonly clipboard: BranchClipboard;
  getMap(): MindMap;
  pasteDrafts(drafts: readonly BranchDraft[], targetId: NodeId | null): void;
  duplicateBranch(nodeId: NodeId): void;
  commitPendingEdit(): void;
  isActive(): boolean;
  /** Changes whenever a different map is opened in the editor; a sync reload of the same map keeps it. */
  mapSession(): number;
}

export class BranchTransfer {
  constructor(private readonly deps: BranchTransferDeps) {}

  copy(nodeId: NodeId | null): void {
    if (nodeId === null || !this.deps.getMap().nodes.has(nodeId)) return;
    void this.deps.clipboard.writeBranch(this.deps.getMap(), nodeId);
  }

  /**
   * The clipboard is read asynchronously; the target is fixed now, so a selection change meanwhile does not redirect
   * the paste, and a paste started on one map never lands in another map opened meanwhile.
   */
  paste(targetId: NodeId | null): void {
    const session = this.deps.mapSession();
    void this.deps.clipboard.readBranches().then((drafts) => this.pasteWhenStillActive(drafts, targetId, session));
  }

  duplicate(nodeId: NodeId | null): void {
    if (nodeId !== null) this.deps.duplicateBranch(nodeId);
  }

  private pasteWhenStillActive(drafts: readonly BranchDraft[], targetId: NodeId | null, session: number): void {
    if (!this.deps.isActive() || this.deps.mapSession() !== session) return;
    this.deps.commitPendingEdit();
    this.deps.pasteDrafts(drafts, targetId);
  }
}
