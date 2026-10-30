export interface PinchmapSettings {
  readonly longPressSeconds: number;
}

export const MIN_LONG_PRESS_SECONDS = 0.2;
export const MAX_LONG_PRESS_SECONDS = 2.0;

export const DEFAULT_SETTINGS: PinchmapSettings = { longPressSeconds: 0.5 };

export function parseLongPressSeconds(input: string, previous: number): number {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "") return previous;
  const seconds = Number(normalized);
  return isLongPressSecondsInRange(seconds) ? seconds : previous;
}

export function readSettings(stored: unknown): PinchmapSettings {
  const storedSeconds = (stored as { longPressSeconds?: unknown } | null)?.longPressSeconds;
  const isUsable = typeof storedSeconds === "number" && isLongPressSecondsInRange(storedSeconds);
  return isUsable ? { longPressSeconds: storedSeconds } : DEFAULT_SETTINGS;
}

function isLongPressSecondsInRange(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds >= MIN_LONG_PRESS_SECONDS && seconds <= MAX_LONG_PRESS_SECONDS;
}
