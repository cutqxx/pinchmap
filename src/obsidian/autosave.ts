export interface DebouncedSave {
  schedule(): void;
  flush(): Promise<void>;
  cancel(): void;
  hasPending(): boolean;
}

export function createDebouncedSave(
  save: () => Promise<void>,
  delayMs: number,
  onError: (error: unknown) => void = () => {},
): DebouncedSave {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runPendingSave = (): Promise<void> => {
    timer = null;
    return save();
  };

  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => runPendingSave().catch(onError), delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    hasPending() {
      return timer !== null;
    },
    async flush() {
      if (timer === null) return;
      clearTimeout(timer);
      await runPendingSave();
    },
  };
}
