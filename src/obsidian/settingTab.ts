import { PluginSettingTab, Setting } from "obsidian";
import type { App, Plugin } from "obsidian";
import { t } from "./i18n";
import { parseLongPressSeconds } from "./settings";

export interface LongPressSettingStore {
  getLongPressSeconds(): number;
  setLongPressSeconds(seconds: number): Promise<void>;
}

export class PinchmapSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    plugin: Plugin,
    private readonly store: LongPressSettingStore,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName(t("longPressSettingName"))
      .setDesc(t("longPressSettingDescription"))
      .addText((text) =>
        text.setValue(String(this.store.getLongPressSeconds())).onChange(async (input) => {
          const previous = this.store.getLongPressSeconds();
          const seconds = parseLongPressSeconds(input, previous);
          if (seconds !== previous) await this.store.setLongPressSeconds(seconds);
        }),
      );
  }
}
