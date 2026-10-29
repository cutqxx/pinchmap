import { Menu } from "obsidian";
import type { MenuItem } from "../editor";
import type { ScreenPoint } from "../input";

export function showObsidianMenu(items: readonly MenuItem[], at: ScreenPoint): void {
  const menu = new Menu();
  items.forEach((entry) => menu.addItem((item) => item.setTitle(entry.label).onClick(() => entry.onSelect())));
  menu.showAtPosition(at);
}
