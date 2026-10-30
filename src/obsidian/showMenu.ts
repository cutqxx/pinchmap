import { Menu } from "obsidian";
import type { MenuItem } from "../editor";
import type { ScreenPoint } from "../input";

export function showObsidianMenu(items: readonly MenuItem[], at: ScreenPoint): void {
  const menu = new Menu();
  items.forEach((entry) => menu.addItem((item) => describeItem(item, entry, at)));
  menu.showAtPosition(at);
}

/**
 * A submenu opens as a second menu at the same position, which works the same for mouse and touch.
 * It opens after the click handler returns, so Obsidian closing the first menu on click cannot swallow it.
 */
function describeItem(item: ObsidianMenuItem, entry: MenuItem, at: ScreenPoint): void {
  item.setTitle(entry.label);
  if (entry.isChecked !== undefined) item.setChecked(entry.isChecked);
  const { submenu } = entry;
  item.onClick(() => (submenu === undefined ? entry.onSelect() : setTimeout(() => showObsidianMenu(submenu, at), 0)));
}

type ObsidianMenuItem = Parameters<Parameters<Menu["addItem"]>[0]>[0];
