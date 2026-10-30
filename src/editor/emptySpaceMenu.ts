import { addRoot } from "../commands";
import type { HitTarget, ScreenPoint } from "../input";
import type { MindMap, NodeId, RootPosition } from "../model";
import { screenToMap } from "../viewport";
import type { Camera } from "../viewport";

export interface MenuItem {
  readonly label: string;
  readonly isChecked?: boolean;
  readonly submenu?: readonly MenuItem[];
  onSelect(): void;
}

export interface MenuHandle {
  close(): void;
}

export interface EmptySpaceMenuDeps {
  readonly canvasElement: HTMLElement;
  readonly addNodeLabel: string;
  readonly resetMapLayoutLabel: string;
  getCamera(): Camera;
  showMenu(items: readonly MenuItem[], at: ScreenPoint): MenuHandle | void;
  commitPendingEdit(): void;
  createNode(command: (map: MindMap, id: NodeId) => MindMap): void;
  resetMapLayout(): void;
}

export class EmptySpaceMenu {
  private openMenu: MenuHandle | null = null;

  constructor(private readonly deps: EmptySpaceMenuDeps) {}

  requestMenu(target: HitTarget, point: ScreenPoint): void {
    if (target.kind !== "canvas") return;
    const mapPoint = this.mapPointAt(point);
    this.openMenu = this.deps.showMenu(
      [
        { label: this.deps.addNodeLabel, onSelect: () => this.addRootAtMapPoint(mapPoint) },
        { label: this.deps.resetMapLayoutLabel, onSelect: () => this.resetMapLayout() },
      ],
      this.clientPointOf(point),
    ) ?? null;
  }

  close(): void {
    this.openMenu?.close();
    this.openMenu = null;
  }

  addRootAt(point: ScreenPoint): void {
    this.addRootAtMapPoint(this.mapPointAt(point));
  }

  private addRootAtMapPoint(position: RootPosition): void {
    this.deps.commitPendingEdit();
    this.deps.createNode((map, id) => addRoot(map, { id, text: "", position }));
  }

  private resetMapLayout(): void {
    this.deps.commitPendingEdit();
    this.deps.resetMapLayout();
  }

  private mapPointAt(point: ScreenPoint): RootPosition {
    const { x, y } = screenToMap(this.deps.getCamera(), point);
    return { x: Math.round(x), y: Math.round(y) };
  }

  private clientPointOf(point: ScreenPoint): ScreenPoint {
    const bounds = this.deps.canvasElement.getBoundingClientRect();
    return { x: point.x + bounds.left, y: point.y + bounds.top };
  }
}
