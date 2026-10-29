import { Plugin } from "obsidian";
import { t } from "./i18n";
import { MapNotes } from "./mapNotes";
import { MapView, MAP_VIEW_TYPE } from "./mapView";
import { OpenAsMapActions } from "./openAsMapAction";
import { MapFileOpener } from "./openMapFiles";
import { reportFailure } from "./reportFailure";

const NEW_MAP_ICON = "network";

export default class PinchmapPlugin extends Plugin {
  onload(): void {
    const opener = new MapFileOpener(this.app);
    const notes = new MapNotes(this.app, opener);
    this.registerView(MAP_VIEW_TYPE, (leaf) => new MapView(leaf));
    this.register(opener.install());
    this.addOpenAsMarkdownCommand(opener);
    this.addNewMapEntryPoints(notes);
    this.addConvertAndOpenAsMapEntryPoints(notes);
  }

  private addOpenAsMarkdownCommand(opener: MapFileOpener): void {
    this.addCommand({
      id: "open-as-markdown",
      name: t("openAsMarkdown"),
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MapView);
        if (view?.file == null) return false;
        if (!checking) void opener.openAsMarkdown(view.leaf, view.file.path);
        return true;
      },
    });
  }

  private addNewMapEntryPoints(notes: MapNotes): void {
    this.addCommand({ id: "new-map", name: t("newMap"), callback: () => reportFailure(notes.createNewMap()) });
    this.addRibbonIcon(NEW_MAP_ICON, t("newMap"), () => reportFailure(notes.createNewMap()));
  }

  private addConvertAndOpenAsMapEntryPoints(notes: MapNotes): void {
    this.addCommand({
      id: "convert-note-to-map",
      name: t("convertToMap"),
      checkCallback: (checking) => {
        const view = notes.findConvertibleView();
        if (view !== null && !checking) reportFailure(notes.convertToMap(view));
        return view !== null;
      },
    });
    this.addCommand({
      id: "open-as-map",
      name: t("openAsMap"),
      checkCallback: (checking) => {
        const view = notes.findMapNoteView();
        if (view !== null && !checking) reportFailure(notes.openAsMap(view));
        return view !== null;
      },
    });
    this.addOpenAsMapHeaderButton(notes);
  }

  private addOpenAsMapHeaderButton(notes: MapNotes): void {
    const actions = new OpenAsMapActions(this.app, (view) => reportFailure(notes.openAsMap(view)));
    const refresh = (): void => actions.refresh();
    this.register(() => actions.removeAll());
    this.registerEvent(this.app.workspace.on("layout-change", refresh));
    this.registerEvent(this.app.workspace.on("file-open", refresh));
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.app.workspace.onLayoutReady(refresh);
  }
}
