import type { MindMap } from "../model";

export const DEFAULT_HISTORY_DEPTH = 200;

export class History {
  private undoStack: MindMap[] = [];
  private redoStack: MindMap[] = [];

  constructor(private readonly depth: number = DEFAULT_HISTORY_DEPTH) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  push(previous: MindMap): void {
    this.undoStack.push(previous);
    if (this.undoStack.length > this.depth) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(current: MindMap): MindMap | null {
    const restored = this.undoStack.pop();
    if (restored === undefined) return null;
    this.redoStack.push(current);
    return restored;
  }

  redo(current: MindMap): MindMap | null {
    const restored = this.redoStack.pop();
    if (restored === undefined) return null;
    this.undoStack.push(current);
    return restored;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
