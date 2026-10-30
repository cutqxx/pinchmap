import { MarkdownView, TFile } from "obsidian";
import type { App, TFolder, WorkspaceLeaf } from "obsidian";
import { buildNewMapText, convertNoteToMap, pickFreeName } from "../format";
import { t } from "./i18n";
import { MapView } from "./mapView";
import type { MapFileOpener } from "./openMapFiles";

export function isMapNote(app: App, file: TFile): boolean {
  return app.metadataCache.getFileCache(file)?.frontmatter?.mindmap === true;
}

export class MapNotes {
  constructor(
    private readonly app: App,
    private readonly opener: MapFileOpener,
  ) {}

  async createNewMap(): Promise<void> {
    const folder = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path ?? "");
    const name = pickFreeName(t("untitledName"), listMarkdownBaseNames(folder));
    const file = await this.app.vault.create(pathInFolder(folder, `${name}.md`), buildNewMapText());
    await this.openAsMapAndEditFirstRoot(this.app.workspace.getLeaf(false), file);
  }

  findConvertibleView(): MarkdownView | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file != null && !isMapNote(this.app, view.file) ? view : null;
  }

  findMapNoteView(): MarkdownView | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file != null && isMapNote(this.app, view.file) ? view : null;
  }

  async convertToMap(view: MarkdownView): Promise<void> {
    const file = view.file;
    if (file === null) return;
    await view.save();
    await this.app.vault.process(file, (text) => convertNoteToMap(text, file.basename));
    await this.opener.openAsMap(view.leaf, file.path);
  }

  async openAsMap(view: MarkdownView): Promise<void> {
    if (view.file !== null) await this.opener.openAsMap(view.leaf, view.file.path);
  }

  private async openAsMapAndEditFirstRoot(leaf: WorkspaceLeaf, file: TFile): Promise<void> {
    await this.opener.openAsMap(leaf, file.path);
    if (leaf.view instanceof MapView) leaf.view.beginEditingFirstRoot();
  }
}

function listMarkdownBaseNames(folder: TFolder): string[] {
  return folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === "md").map((file) => file.basename);
}

function pathInFolder(folder: TFolder, fileName: string): string {
  return folder.isRoot() ? fileName : `${folder.path}/${fileName}`;
}
