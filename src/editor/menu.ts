export interface MenuItem {
  readonly label: string;
  readonly isChecked?: boolean;
  readonly submenu?: readonly MenuItem[];
  onSelect(): void;
}

export interface MenuHandle {
  close(): void;
}
