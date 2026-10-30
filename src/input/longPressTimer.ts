export class LongPressTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;

  start(delayMs: number, onElapsed: () => void): void {
    this.cancel();
    this.handle = setTimeout(() => {
      this.handle = null;
      onElapsed();
    }, delayMs);
  }

  cancel(): void {
    if (this.handle === null) return;
    clearTimeout(this.handle);
    this.handle = null;
  }
}
