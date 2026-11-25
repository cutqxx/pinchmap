import type { LayoutResult, Size } from "../layout";
import type { NodeId } from "../model";
import type { MapRenderer } from "../render";
import { BranchTransfer } from "./branchTransfer";
import type { BranchClipboard } from "./branchTransfer";
import type { CameraController } from "./cameraController";
import { EmptySpaceMenu } from "./emptySpaceMenu";
import type { MapHost } from "./mapHost";
import { MarqueeSelection } from "./marqueeSelection";
import { NodeDrag } from "./nodeDrag";
import { NodeEdits } from "./nodeEdits";
import { NodeMenu } from "./nodeMenu";
import type { NodeMenuLabels } from "./nodeMenu";
import { Selection } from "./selection";
import { TextEditing } from "./textEditing";

/** The editor collaborators that hold editing state and act on the map. */
export interface EditorParts {
  readonly selection: Selection;
  readonly nodeEdits: NodeEdits;
  readonly textEditing: TextEditing;
  readonly branchTransfer: BranchTransfer;
  readonly emptySpaceMenu: EmptySpaceMenu;
  readonly nodeMenu: NodeMenu;
  readonly nodeDrag: NodeDrag;
  readonly marqueeSelection: MarqueeSelection;
}

export interface EditorPartsLabels {
  readonly addNode: string;
  readonly resetMapLayout: string;
  readonly nodeMenu: NodeMenuLabels;
}

export interface EditorPartsContext {
  readonly host: MapHost;
  readonly renderer: MapRenderer;
  readonly camera: CameraController;
  readonly clipboard: BranchClipboard;
  readonly labels: EditorPartsLabels;
  getLayout(): LayoutResult | null;
  getSizes(): ReadonlyMap<NodeId, Size>;
  renderFrame(): void;
  scheduleFrame(): void;
  resetMapLayout(): void;
  isActive(): boolean;
  mapSession(): number;
}

/**
 * Builds the collaborators and wires them to each other. They reference each other only
 * through callbacks, which run after every part exists.
 */
export function createEditorParts(context: EditorPartsContext): EditorParts {
  const { host, renderer, camera } = context;
  const canvasElement = renderer.canvasElement;
  const getMap = () => nodeEdits.getDisplayMap();
  const commitPendingEdit = () => textEditing.commit();

  const selection = new Selection({
    focusCanvas: () => renderer.focusCanvas(),
    scheduleFrame: () => context.scheduleFrame(),
  });

  const nodeEdits = new NodeEdits({
    selection,
    getLayout: () => context.getLayout(),
    getSizes: () => context.getSizes(),
    onMapChanged: () => host.onMapChanged(),
    onHistoryChanged: (canUndo, canRedo) => host.onHistoryChanged?.(canUndo, canRedo),
    renderFrame: () => context.renderFrame(),
    scheduleFrame: () => context.scheduleFrame(),
    beginEditingNewNode: (nodeId, origin) => textEditing.beginEditing(nodeId, origin),
  });

  const textEditing = new TextEditing({
    selection,
    canvasElement,
    getNodeElement: (nodeId) => renderer.getNodeElement(nodeId),
    getDisplayMap: getMap,
    replaceDisplayMap: (map) => nodeEdits.replaceDisplayMap(map),
    applyEdit: (edit, undoBase) => nodeEdits.applyEdit(edit, undoBase),
    focusCanvas: () => renderer.focusCanvas(),
    scheduleFrame: () => context.scheduleFrame(),
    onTextEditEnded: () => host.onTextEditEnded(),
    followUp: (followUp, nodeId) => {
      // The layout must include the committed text, so the new node gets the right side and position.
      context.renderFrame();
      if (followUp === "addChild") nodeEdits.addChildTo(nodeId);
      else nodeEdits.addSiblingTo(nodeId);
    },
  });

  const branchTransfer = new BranchTransfer({
    clipboard: context.clipboard,
    getMap,
    pasteDrafts: (drafts, targetId) => {
      // A drag started while the clipboard was read would otherwise overwrite the paste with its preview map.
      nodeDrag.cancel();
      nodeEdits.pasteDrafts(drafts, targetId);
    },
    duplicateBranch: (nodeId) => nodeEdits.duplicateBranchOf(nodeId),
    commitPendingEdit,
    isActive: () => context.isActive(),
    mapSession: () => context.mapSession(),
  });

  const emptySpaceMenu = new EmptySpaceMenu({
    canvasElement,
    addNodeLabel: context.labels.addNode,
    resetMapLayoutLabel: context.labels.resetMapLayout,
    getCamera: () => camera.getCamera(),
    showMenu: (items, at) => host.showMenu(items, at),
    commitPendingEdit,
    createNode: (creation) => nodeEdits.createNode(creation),
    resetMapLayout: () => context.resetMapLayout(),
  });

  const nodeMenu = new NodeMenu({
    canvasElement,
    labels: context.labels.nodeMenu,
    actions: {
      addChildTo: (nodeId) => nodeEdits.addChildTo(nodeId),
      addSiblingTo: (nodeId) => nodeEdits.addSiblingTo(nodeId),
      setColor: (nodeId, color) => nodeEdits.setColorOf(nodeId, color),
      copyBranch: (nodeId) => branchTransfer.copy(nodeId),
      pasteInto: (nodeId) => branchTransfer.paste(nodeId),
      duplicateBranch: (nodeId) => branchTransfer.duplicate(nodeId),
      toggleCollapse: (nodeId) => nodeEdits.toggleCollapseOf(nodeId),
      resetNodeLayout: (nodeId) => nodeEdits.resetNodeLayoutOf(nodeId),
      deleteNode: (nodeId) => {
        nodeEdits.deleteNode(nodeId);
        renderer.focusCanvas();
      },
    },
    getMap,
    showMenu: (items, at) => host.showMenu(items, at),
    commitPendingEdit,
    selectNode: (nodeId) => selection.select(nodeId),
  });

  const nodeDrag = new NodeDrag({
    getMap,
    getLayout: () => context.getLayout(),
    getSizes: () => context.getSizes(),
    getCamera: () => camera.getCamera(),
    replaceDisplayMap: (map) => nodeEdits.replaceDisplayMap(map),
    applyEdit: (edit) => nodeEdits.applyEdit(edit),
    getSelectedIds: () => selection.ids,
    selectNode: (nodeId) => selection.select(nodeId),
    scheduleFrame: () => context.scheduleFrame(),
  });

  const marqueeSelection = new MarqueeSelection({
    getMap,
    getLayout: () => context.getLayout(),
    getSizes: () => context.getSizes(),
    getCamera: () => camera.getCamera(),
    showMarquee: (rect) => renderer.setMarquee(rect),
    selectNodes: (nodeIds) => selection.selectMany(nodeIds),
    closeMenu: () => emptySpaceMenu.close(),
  });

  return { selection, nodeEdits, textEditing, branchTransfer, emptySpaceMenu, nodeMenu, nodeDrag, marqueeSelection };
}
