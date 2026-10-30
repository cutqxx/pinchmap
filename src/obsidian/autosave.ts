export interface DebouncedSave {
  schedule(): void;
  flush(): Promise<void>;
  cancel(): void;
  hasPending(): boolean;
}

/**
 * A save that fails is retried after the same delay until it succeeds, and `onError` hears about it
 * once per streak of failures. A failed `flush` just rejects: its caller decides what happens next.
 */
export function createDebouncedSave(
  save: () => Promise<void>,
  delayMs: number,
  onError: (error: unknown) => void = () => {},
): DebouncedSave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isFailing = false;
  let cancellations = 0;

  const runPendingSave = async (): Promise<void> => {
    timer = null;
    await save();
    isFailing = false;
  };

  /** A save cancelled while it ran (view closed, file reloaded) is not retried when it then fails. */
  const runTimerSave = (): void => {
    const cancellationsAtStart = cancellations;
    runPendingSave().catch((error: unknown) => {
      if (!isFailing) onError(error);
      isFailing = true;
      if (cancellations === cancellationsAtStart) schedule();
    });
  };

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(runTimerSave, delayMs);
  };

  return {
    schedule,
    cancel() {
      cancellations++;
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
