import { TextFileView } from "obsidian";
import type { TFile, WorkspaceLeaf } from "obsidian";
import { MapEditor } from "../editor";
import { parseMapFile, serializeMapFile } from "../format";
import type { ParsedMapFile } from "../format";
import { createDebouncedSave } from "./autosave";
import { t } from "./i18n";

export const MAP_VIEW_TYPE = "pinchmap-view";

const AUTOSAVE_DELAY_MS = 1000;
const VIEW_ICON = "network";

export class MapView extends TextFileView {
  private readonly editor: MapEditor;
  private readonly autosave = createDebouncedSave(
    () => this.save(),
    AUTOSAVE_DELAY_MS,
    (error) => console.error("Pinchmap: autosave failed", error),
  );
  private parsedFile: ParsedMapFile = parseMapFile("");
  private lastKnownText: string | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl.classList.add("pinchmap-view");
    this.editor = new MapEditor({
      container: this.contentEl,
      host: { onMapChanged: () => this.autosave.schedule() },
    });
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
    this.lastKnownText = text;
    return text;
  }

  setViewData(data: string, clear: boolean): void {
    if (!clear && data === this.lastKnownText) return;
    this.parsedFile = parseMapFile(data);
    this.lastKnownText = data;
    this.editor.loadMap(this.parsedFile.map);
  }

  clear(): void {
    this.setViewData("", true);
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.editor.commitPendingEdit();
    await this.autosave.flush();
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    this.editor.destroy();
    await this.autosave.flush();
  }
}
