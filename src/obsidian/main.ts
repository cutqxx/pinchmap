import { Plugin } from "obsidian";
import { t } from "./i18n";
import { MapView, MAP_VIEW_TYPE } from "./mapView";
import { MapFileOpener } from "./openMapFiles";

export default class PinchmapPlugin extends Plugin {
  onload(): void {
    const opener = new MapFileOpener(this.app);
    this.registerView(MAP_VIEW_TYPE, (leaf) => new MapView(leaf));
    this.register(opener.install());
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
}
