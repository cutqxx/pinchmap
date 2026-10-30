import type { Rect } from "../viewport";

export interface VisibleAreaSource {
  read(): Rect;
  subscribe(onChange: () => void): () => void;
}
