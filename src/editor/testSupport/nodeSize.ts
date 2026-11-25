import { vi } from "vitest";

/** Makes every element report the given size, so rendered nodes get measured. Returns a restore callback. */
export function giveEveryElementSize(size: { readonly width: number; readonly height: number }): () => void {
  const spies = [
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(size.width),
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(size.height),
  ];
  return () => spies.forEach((spy) => spy.mockRestore());
}
