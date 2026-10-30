import { MarkdownView } from "obsidian";
import type { App } from "obsidian";
import { t } from "./i18n";
import { isMapNote } from "./mapNotes";

const ACTION_ICON = "network";

export class OpenAsMapActions {
  private readonly buttons = new WeakMap<MarkdownView, HTMLElement>();

  constructor(
    private readonly app: App,
    private readonly openAsMap: (view: MarkdownView) => void,
  ) {}

  refresh(): void {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      if (leaf.view instanceof MarkdownView) this.syncButton(leaf.view);
    });
  }

  removeAll(): void {
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      if (leaf.view instanceof MarkdownView) this.removeButton(leaf.view);
    });
  }

  private syncButton(view: MarkdownView): void {
    const shouldShow = view.file !== null && isMapNote(this.app, view.file);
    const hasButton = this.buttons.has(view);
    if (shouldShow && !hasButton) this.buttons.set(view, view.addAction(ACTION_ICON, t("openAsMap"), () => this.openAsMap(view)));
    if (!shouldShow && hasButton) this.removeButton(view);
  }

  private removeButton(view: MarkdownView): void {
    this.buttons.get(view)?.remove();
    this.buttons.delete(view);
  }
}
