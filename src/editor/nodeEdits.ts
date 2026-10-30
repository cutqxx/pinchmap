import type { BranchEditResult } from "../commands";
import { History, addChild, addSibling, deleteBranch, duplicateBranch, pasteBranch, resetMapLayout, resetNodeLayout, setNodeColor, toggleNodeCollapsed } from "../commands";
import { chooseSideForNewBranch, positionBelowRootTree } from "../layout";
import type { LayoutResult, Size } from "../layout";
import { EMPTY_MIND_MAP, generateNodeId, getNode, readRootPosition, visibleStandIn, withSidesResolved } from "../model";
import type { BranchDraft, MindMap, NodeColor, NodeId, RootPosition, Side } from "../model";
import { selectionAfterDelete, topmostNodeIds } from "./selection";
import type { Selection } from "./selection";
import type { NewNodeOrigin } from "./textEditing";

export type MapEdit = (map: MindMap) => MindMap;
export type NodeCreation = (map: MindMap, id: NodeId) => MindMap;

export interface NodeEditsDeps {
  readonly selection: Selection;
  getLayout(): LayoutResult | null;
  getSizes(): ReadonlyMap<NodeId, Size>;
  onMapChanged(): void;
  onHistoryChanged?(canUndo: boolean, canRedo: boolean): void;
  renderFrame(): void;
  scheduleFrame(): void;
  beginEditingNewNode(nodeId: NodeId, origin: NewNodeOrigin): void;
}

export class NodeEdits {
  private displayMap: MindMap = EMPTY_MIND_MAP;
  private readonly history = new History();

  constructor(private readonly deps: NodeEditsDeps) {}

  getDisplayMap(): MindMap {
    return this.displayMap;
  }

  replaceDisplayMap(map: MindMap): void {
    this.displayMap = map;
  }

  /**
   * The single entry point for committed changes to the map.
   * `undoBase` is the map one undo step returns to; it defaults to the map before the edit.
   */
  applyEdit(edit: MapEdit, undoBase?: MindMap): void {
    const settledMap = this.mapWithSettledSides();
    const updatedMap = edit(settledMap);
    if (updatedMap === settledMap) return;
    this.history.push(undoBase ?? settledMap);
    this.displayMap = updatedMap;
    this.notifyHistoryChanged();
    this.deps.onMapChanged();
  }

  undo(): void {
    const restored = this.history.undo(this.mapWithSettledSides());
    if (restored !== null) this.showRestoredMap(restored);
  }

  redo(): void {
    const restored = this.history.redo(this.mapWithSettledSides());
    if (restored !== null) this.showRestoredMap(restored);
  }

  clearHistory(): void {
    this.history.clear();
    this.notifyHistoryChanged();
  }

  addChildToSelection(): void {
    const selectedId = this.deps.selection.sole;
    if (selectedId !== null) this.addChildTo(selectedId);
  }

  addSiblingToSelection(): void {
    const selectedId = this.deps.selection.sole;
    if (selectedId !== null) this.addSiblingTo(selectedId);
  }

  addChildTo(parentId: NodeId): void {
    if (!this.hasNode(parentId)) return;
    const layout = this.deps.getLayout();
    const side = layout === null ? "right" : chooseSideForNewBranch(layout, parentId);
    this.createNode((map, id) => addChild(map, { parentId, id, text: "", side }));
  }

  addSiblingTo(anchorId: NodeId): void {
    if (!this.hasNode(anchorId)) return;
    const side: Side = this.deps.getLayout()?.sides.get(anchorId) ?? "right";
    const rootPosition = this.positionForNewRootBelow(anchorId);
    this.createNode((map, id) => addSibling(map, { anchorId, id, text: "", side, rootPosition }));
  }

  /**
   * Shows the new node right away but leaves it uncommitted: the text edit session
   * that follows either commits it through applyEdit or discards it.
   */
  createNode(creation: NodeCreation): void {
    const mapBeforeCreation = this.mapWithSettledSides();
    const nodeId = generateNodeId(new Set(mapBeforeCreation.nodes.keys()));
    const origin = { mapBeforeCreation, selectionBeforeCreation: this.deps.selection.current };
    this.displayMap = creation(mapBeforeCreation, nodeId);
    this.deps.selection.set(nodeId);
    this.deps.renderFrame();
    this.deps.beginEditingNewNode(nodeId, origin);
  }

  deleteSelection(): void {
    const { selection } = this.deps;
    if (selection.isMultiple) return this.deleteBranches(selection.ids);
    const nodeId = selection.current;
    if (nodeId !== null) this.deleteNode(nodeId);
  }

  /** One undo step removes all the branches; nothing stays selected afterwards. */
  deleteBranches(nodeIds: readonly NodeId[]): void {
    const branchRootIds = topmostNodeIds(this.displayMap, nodeIds.filter((id) => this.hasNode(id)));
    this.deps.selection.set(null);
    this.applyEdit((map) => branchRootIds.reduce((current, nodeId) => deleteBranch(current, { nodeId }), map));
    this.deps.scheduleFrame();
  }

  deleteNode(nodeId: NodeId): void {
    if (!this.hasNode(nodeId)) return;
    this.deps.selection.set(selectionAfterDelete(this.displayMap, nodeId));
    this.applyEdit((map) => deleteBranch(map, { nodeId }));
    this.deps.scheduleFrame();
  }

  pasteDrafts(drafts: readonly BranchDraft[], targetId: NodeId | null): void {
    if (targetId !== null && !this.hasNode(targetId)) return;
    const layout = this.deps.getLayout();
    const side = layout === null || targetId === null ? "right" : chooseSideForNewBranch(layout, targetId);
    this.applyBranchEdit((map) => pasteBranch(map, { drafts, targetId, side }));
  }

  duplicateBranchOf(nodeId: NodeId): void {
    if (this.hasNode(nodeId)) this.applyBranchEdit((map) => duplicateBranch(map, { nodeId }));
  }

  resetNodeLayoutOf(nodeId: NodeId): void {
    if (this.hasNode(nodeId)) this.applyEdit((map) => resetNodeLayout(map, { nodeId }));
    this.deps.scheduleFrame();
  }

  setColorOf(nodeId: NodeId, color: NodeColor | undefined): void {
    if (!this.hasNode(nodeId)) return;
    this.applyEdit((map) => setNodeColor(map, { nodeId, color }));
    this.deps.scheduleFrame();
  }

  resetMapLayout(): void {
    this.applyEdit((map) => resetMapLayout(map));
    this.deps.scheduleFrame();
  }

  toggleCollapseOfSelection(): void {
    const selectedId = this.deps.selection.sole;
    if (selectedId !== null) this.toggleCollapseOf(selectedId);
  }

  toggleCollapseOf(nodeId: NodeId): void {
    if (!this.hasNode(nodeId)) return;
    this.applyEdit((map) => toggleNodeCollapsed(map, { nodeId }));
    this.moveSelectionOutOfHiddenBranch();
    this.deps.scheduleFrame();
  }

  private applyBranchEdit(edit: (map: MindMap) => BranchEditResult): void {
    const created: { firstNodeId: NodeId | null } = { firstNodeId: null };
    this.applyEdit((map) => {
      const result = edit(map);
      created.firstNodeId = result.firstNodeId;
      return result.map;
    });
    if (created.firstNodeId !== null) this.deps.selection.select(created.firstNodeId);
    this.deps.scheduleFrame();
  }

  private moveSelectionOutOfHiddenBranch(): void {
    const standIns = this.deps.selection.ids.map((id) => visibleStandIn(this.displayMap, id));
    this.deps.selection.setMany(standIns);
  }

  private showRestoredMap(restored: MindMap): void {
    const selectedIds = this.deps.selection.ids;
    this.displayMap = restored;
    const survivors = selectedIds.filter((id) => restored.nodes.has(id));
    this.deps.selection.selectMany(survivors.map((id) => visibleStandIn(restored, id)));
    this.notifyHistoryChanged();
    this.deps.onMapChanged();
  }

  private notifyHistoryChanged(): void {
    this.deps.onHistoryChanged?.(this.history.canUndo, this.history.canRedo);
  }

  private hasNode(nodeId: NodeId): boolean {
    return this.displayMap.nodes.has(nodeId);
  }

  private positionForNewRootBelow(anchorId: NodeId): RootPosition | undefined {
    const layout = this.deps.getLayout();
    const rootSize = this.deps.getSizes().get(anchorId);
    const anchor = getNode(this.displayMap, anchorId);
    const isPinnedRoot = anchor.parentId === null && readRootPosition(anchor.state) !== undefined;
    if (!isPinnedRoot || layout === null || rootSize === undefined) return undefined;
    return positionBelowRootTree(layout, anchorId, rootSize) ?? undefined;
  }

  private mapWithSettledSides(): MindMap {
    const layout = this.deps.getLayout();
    return layout === null ? this.displayMap : withSidesResolved(this.displayMap, layout.sides);
  }
}
