import { Notice, TextFileView } from "obsidian";
import type { TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { MapEditor } from "../editor";
import { parseMapFile, serializeMapFile } from "../format";
import type { ParsedMapFile } from "../format";
import { createDebouncedSave } from "./autosave";
import { createVisibleAreaSource } from "./visibleArea";
import { showObsidianMenu } from "./showMenu";
import { ExternalChangeGate } from "./externalChangeGate";
import { t } from "./i18n";

export const MAP_VIEW_TYPE = "pinchmap-view";

const AUTOSAVE_DELAY_MS = 1000;
const VIEW_ICON = "network";
const HISTORY_ACTION_CLASS = "pinchmap-history-action";

function setActionEnabled(action: HTMLElement, isEnabled: boolean): void {
  action.setAttribute("aria-disabled", String(!isEnabled));
}

export class MapView extends TextFileView {
  private readonly editor: MapEditor;
  private readonly autosave = createDebouncedSave(
    () => this.saveUnlessReloadDeferred(),
    AUTOSAVE_DELAY_MS,
    (error) => console.error("Pinchmap: autosave failed", error),
  );
  private parsedFile: ParsedMapFile = parseMapFile("");
  private readonly externalChanges = new ExternalChangeGate({
    isEditingText: () => this.editor.isEditingText(),
    reload: (text) => this.reloadFromExternalChange(text),
    onReloadDeferred: () => this.holdUnsavedEditsForDeferredReload(),
  });
  private hasUnsavedEditsHeldBack = false;
  private readonly undoAction: HTMLElement;
  private readonly redoAction: HTMLElement;

  private readonly notify = (message: string): void => {
    new Notice(message);
  };

  constructor(leaf: WorkspaceLeaf, longPressSeconds: number) {
    super(leaf);
    this.contentEl.classList.add("pinchmap-view");
    this.editor = new MapEditor({
      container: this.contentEl,
      visibleArea: createVisibleAreaSource(this.contentEl.ownerDocument.defaultView ?? window),
      doneLabel: t("done"),
      addNodeLabel: t("addNode"),
      nodeMenuLabels: { addChild: t("addChild"), addSibling: t("addSibling"), delete: t("delete") },
      longPressSeconds,
      labels: { addChild: t("addChild"), addSibling: t("addSibling") },
      host: {
        onMapChanged: () => this.autosave.schedule(),
        onHistoryChanged: (canUndo, canRedo) => this.showHistoryAvailability(canUndo, canRedo),
        onTextEditEnded: () => this.externalChanges.resumeAfterTextEdit(),
        showMenu: showObsidianMenu,
        notify: this.notify,
      },
    });
    this.redoAction = this.addHistoryAction("redo-2", t("redo"), () => this.editor.redo());
    this.undoAction = this.addHistoryAction("undo-2", t("undo"), () => this.editor.undo());
    this.showHistoryAvailability(false, false);
    this.registerEvent(this.app.vault.on("modify", (file) => void this.handleVaultModify(file)));
  }

  getViewType(): string {
    return MAP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? t("viewName");
  }

  getIcon(): string {
    return VIEW_ICON;
  }

  getViewData(): string {
    const text = serializeMapFile(this.editor.getMap(), this.parsedFile.source);
    this.externalChanges.noteKnownText(text);
    return text;
  }

  setViewData(data: string, clear: boolean): void {
    if (clear) {
      this.externalChanges.startFrom(data);
      this.loadText(data);
    } else {
      this.externalChanges.receive(data);
    }
  }

  setLongPressSeconds(seconds: number): void {
    this.editor.setLongPressSeconds(seconds);
  }

  beginEditingFirstRoot(): void {
    const [firstRootId] = this.editor.getMap().rootIds;
    if (firstRootId !== undefined) this.editor.beginEditingNode(firstRootId);
  }

  clear(): void {
    this.setViewData("", true);
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.editor.commitPendingEdit();
    await this.autosave.flush();
    await super.onUnloadFile(file);
  }

  private addHistoryAction(icon: string, label: string, run: () => void): HTMLElement {
    const action = this.addAction(icon, label, () => {
      if (action.getAttribute("aria-disabled") !== "true") run();
    });
    action.classList.add(HISTORY_ACTION_CLASS);
    return action;
  }

  private showHistoryAvailability(canUndo: boolean, canRedo: boolean): void {
    setActionEnabled(this.undoAction, canUndo);
    setActionEnabled(this.redoAction, canRedo);
  }

  private async handleVaultModify(file: TAbstractFile): Promise<void> {
    if (this.file === null || file.path !== this.file.path) return;
    const text = await this.app.vault.read(this.file);
    this.externalChanges.receive(text);
  }

  private async saveUnlessReloadDeferred(): Promise<void> {
    if (this.externalChanges.hasDeferredReload()) {
      this.hasUnsavedEditsHeldBack = true;
      return;
    }
    await this.save();
  }

  private holdUnsavedEditsForDeferredReload(): void {
    if (this.autosave.hasPending()) this.hasUnsavedEditsHeldBack = true;
    this.autosave.cancel();
  }

  private reloadFromExternalChange(text: string): void {
    const hadUnsavedChanges = this.autosave.hasPending() || this.hasUnsavedEditsHeldBack;
    this.autosave.cancel();
    this.loadText(text);
    if (hadUnsavedChanges) this.notify(t("mapUpdatedExternally"));
  }

  private loadText(data: string): void {
    this.hasUnsavedEditsHeldBack = false;
    this.parsedFile = parseMapFile(data);
    this.editor.loadMap(this.parsedFile.map);
    if (this.parsedFile.isLayoutUnreadable) this.notify(t("layoutUnreadable"));
  }

  async onClose(): Promise<void> {
    this.editor.destroy();
    await this.autosave.flush();
  }
}
