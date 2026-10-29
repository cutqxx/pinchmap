import { TFile, WorkspaceLeaf } from "obsidian";
import type { App, ViewState } from "obsidian";
import { around } from "monkey-around";
import { hasMindmapFlag } from "../format";
import { MAP_VIEW_TYPE } from "./mapView";

const MARKDOWN_VIEW_TYPE = "markdown";

export class MapFileOpener {
  private readonly leavesShownAsMarkdown = new WeakMap<WorkspaceLeaf, string>();

  constructor(private readonly app: App) {}

  install(): () => void {
    const resolveViewState = (leaf: WorkspaceLeaf, viewState: ViewState): Promise<ViewState> =>
      this.resolveViewState(leaf, viewState);
    return around(WorkspaceLeaf.prototype, {
      setViewState(originalSetViewState) {
        return async function (this: WorkspaceLeaf, viewState: ViewState, eState?: unknown) {
          const resolved = await resolveViewState(this, viewState);
          return originalSetViewState.call(this, resolved, eState);
        };
      },
    });
  }

  async openAsMarkdown(leaf: WorkspaceLeaf, filePath: string): Promise<void> {
    this.leavesShownAsMarkdown.set(leaf, filePath);
    await leaf.setViewState({ type: MARKDOWN_VIEW_TYPE, state: { file: filePath } });
  }

  private async resolveViewState(leaf: WorkspaceLeaf, viewState: ViewState): Promise<ViewState> {
    const filePath = viewState.state?.file;
    if (viewState.type !== MARKDOWN_VIEW_TYPE || typeof filePath !== "string") return viewState;
    if (this.leavesShownAsMarkdown.get(leaf) === filePath) return viewState;
    this.leavesShownAsMarkdown.delete(leaf);
    return (await this.isMapFile(filePath)) ? { ...viewState, type: MAP_VIEW_TYPE } : viewState;
  }

  private async isMapFile(filePath: string): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile) || file.extension !== "md") return false;
    return hasMindmapFlag(await this.app.vault.cachedRead(file));
  }
}
