export interface LayoutSpacing {
  readonly levelGap: number;
  readonly siblingGap: number;
  readonly rootGap: number;
}

export const DEFAULT_SPACING: LayoutSpacing = { levelGap: 48, siblingGap: 12, rootGap: 48 };
