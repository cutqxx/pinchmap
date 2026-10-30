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

export interface EmptySpaceMenuDeps {
  readonly canvasElement: HTMLElement;
  readonly addNodeLabel: string;
  getCamera(): Camera;
  showMenu(items: readonly MenuItem[], at: ScreenPoint): void;
  commitPendingEdit(): void;
  createNode(command: (map: MindMap, id: NodeId) => MindMap): void;
}

export class EmptySpaceMenu {
  constructor(private readonly deps: EmptySpaceMenuDeps) {}

  requestMenu(target: HitTarget, point: ScreenPoint): void {
    if (target.kind !== "canvas") return;
    const mapPoint = this.mapPointAt(point);
    this.deps.showMenu(
      [{ label: this.deps.addNodeLabel, onSelect: () => this.addRootAtMapPoint(mapPoint) }],
      this.clientPointOf(point),
    );
  }

  addRootAt(point: ScreenPoint): void {
    this.addRootAtMapPoint(this.mapPointAt(point));
  }

  private addRootAtMapPoint(position: RootPosition): void {
    this.deps.commitPendingEdit();
    this.deps.createNode((map, id) => addRoot(map, { id, text: "", position }));
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
