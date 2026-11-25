import type { ScreenPoint } from "../input";
import type { NodeLink } from "../model";
import type { MenuHandle, MenuItem } from "./menu";

export interface MapHost {
  onMapChanged(): void;
  onHistoryChanged?(canUndo: boolean, canRedo: boolean): void;
  showMenu(items: readonly MenuItem[], at: ScreenPoint): MenuHandle | void;
  onTextEditEnded(): void;
  notify(message: string): void;
  openLink?(link: NodeLink): void;
}
