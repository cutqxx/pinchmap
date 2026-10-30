import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedSave } from "./autosave";

const DELAY_MS = 1000;

describe("createDebouncedSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not save before the delay has passed", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);

    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS - 1);

    expect(save).not.toHaveBeenCalled();
  });

  it("saves once after the delay", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);

    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("turns several edits less than a second apart into one save", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);

    autosave.schedule();
    vi.advanceTimersByTime(400);
    autosave.schedule();
    vi.advanceTimersByTime(400);
    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("waits a full delay after the last edit", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    vi.advanceTimersByTime(900);
    autosave.schedule();

    vi.advanceTimersByTime(DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves separately for edits more than a second apart", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);

    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS);
    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS);

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not save when nothing was scheduled", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    createDebouncedSave(save, DELAY_MS);

    vi.advanceTimersByTime(10 * DELAY_MS);

    expect(save).not.toHaveBeenCalled();
  });

  it("flush saves a pending edit immediately", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();

    await autosave.flush();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush does not cause a second save when the timer would have fired later", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    await autosave.flush();

    vi.advanceTimersByTime(5 * DELAY_MS);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush does nothing when no edit is pending", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);

    await autosave.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("flush does nothing after the pending save already ran", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS);

    await autosave.flush();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush waits until the save has finished", async () => {
    let finishSave: () => void = () => undefined;
    const save = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    let flushed = false;

    const flushing = autosave.flush().then(() => { flushed = true; });
    await Promise.resolve();
    expect(flushed).toBe(false);

    finishSave();
    await flushing;
    expect(flushed).toBe(true);
  });

  it("flush rejects when the save fails", async () => {
    const autosave = createDebouncedSave(() => Promise.reject(new Error("disk full")), DELAY_MS);
    autosave.schedule();

    await expect(autosave.flush()).rejects.toThrow("disk full");
  });

  it("can schedule again after a flush", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    await autosave.flush();

    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS);

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports a failing timer-fired save to onError", async () => {
    const error = new Error("disk full");
    const onError = vi.fn();
    const autosave = createDebouncedSave(() => Promise.reject(error), DELAY_MS, onError);
    autosave.schedule();

    await vi.advanceTimersByTimeAsync(DELAY_MS);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("produces no unhandled rejection when a timer-fired save fails", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const autosave = createDebouncedSave(() => Promise.reject(new Error("boom")), DELAY_MS);
      autosave.schedule();

      await vi.advanceTimersByTimeAsync(DELAY_MS);
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("flush rejects to the caller and does not call onError", async () => {
    const onError = vi.fn();
    const autosave = createDebouncedSave(() => Promise.reject(new Error("disk full")), DELAY_MS, onError);
    autosave.schedule();

    await expect(autosave.flush()).rejects.toThrow("disk full");
    expect(onError).not.toHaveBeenCalled();
  });

  it("has nothing pending before the first schedule", () => {
    expect(createDebouncedSave(() => Promise.resolve(), DELAY_MS).hasPending()).toBe(false);
  });

  it("has a pending save after schedule", () => {
    const autosave = createDebouncedSave(() => Promise.resolve(), DELAY_MS);

    autosave.schedule();

    expect(autosave.hasPending()).toBe(true);
  });

  it("has nothing pending once the timer has fired", () => {
    const autosave = createDebouncedSave(() => Promise.resolve(), DELAY_MS);
    autosave.schedule();

    vi.advanceTimersByTime(DELAY_MS);

    expect(autosave.hasPending()).toBe(false);
  });

  it("has nothing pending after flush", async () => {
    const autosave = createDebouncedSave(() => Promise.resolve(), DELAY_MS);
    autosave.schedule();

    await autosave.flush();

    expect(autosave.hasPending()).toBe(false);
  });

  it("cancel drops the scheduled save", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();

    autosave.cancel();
    vi.advanceTimersByTime(DELAY_MS * 3);

    expect(save).not.toHaveBeenCalled();
    expect(autosave.hasPending()).toBe(false);
  });

  it("flush after cancel does not save", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    autosave.cancel();

    await autosave.flush();

    expect(save).not.toHaveBeenCalled();
  });

  it("cancel without a scheduled save does nothing", () => {
    const autosave = createDebouncedSave(() => Promise.resolve(), DELAY_MS);

    expect(() => autosave.cancel()).not.toThrow();
    expect(autosave.hasPending()).toBe(false);
  });

  it("can be scheduled again after cancel", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    autosave.cancel();

    autosave.schedule();
    vi.advanceTimersByTime(DELAY_MS);

    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("createDebouncedSave retrying after a failed save", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function failingThenSucceeding(failures: number) {
    let remaining = failures;
    return vi.fn(() => (remaining-- > 0 ? Promise.reject(new Error("offline")) : Promise.resolve()));
  }

  it("tries again one delay after a failed save", async () => {
    const save = failingThenSucceeding(1);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(DELAY_MS);

    await vi.advanceTimersByTimeAsync(DELAY_MS - 1);
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("stops retrying once a save succeeds", async () => {
    const save = failingThenSucceeding(2);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();

    await vi.advanceTimersByTimeAsync(10 * DELAY_MS);

    expect(save).toHaveBeenCalledTimes(3);
    expect(autosave.hasPending()).toBe(false);
  });

  it("keeps retrying every delay while saving keeps failing", async () => {
    const save = vi.fn(() => Promise.reject(new Error("offline")));
    const autosave = createDebouncedSave(save, DELAY_MS, () => undefined);
    autosave.schedule();

    await vi.advanceTimersByTimeAsync(5 * DELAY_MS);

    expect(save).toHaveBeenCalledTimes(5);
    expect(autosave.hasPending()).toBe(true);
  });

  it("reports a streak of failures to onError only once", async () => {
    const onError = vi.fn();
    const autosave = createDebouncedSave(() => Promise.reject(new Error("offline")), DELAY_MS, onError);
    autosave.schedule();

    await vi.advanceTimersByTimeAsync(6 * DELAY_MS);

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("reports the error of the first failure of the streak", async () => {
    const first = new Error("first");
    const errors = [first, new Error("second")];
    const onError = vi.fn();
    const autosave = createDebouncedSave(() => Promise.reject(errors.shift() ?? new Error("later")), DELAY_MS, onError);
    autosave.schedule();

    await vi.advanceTimersByTimeAsync(4 * DELAY_MS);

    expect(onError).toHaveBeenCalledExactlyOnceWith(first);
  });

  it("reports again when saving fails anew after a success", async () => {
    const outcomes = ["fail", "ok", "fail"];
    const save = vi.fn(() => (outcomes.shift() === "fail" ? Promise.reject(new Error("offline")) : Promise.resolve()));
    const onError = vi.fn();
    const autosave = createDebouncedSave(save, DELAY_MS, onError);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(2 * DELAY_MS);
    expect(onError).toHaveBeenCalledTimes(1);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(DELAY_MS);

    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("starts a full delay from a new edit made while a retry is waiting", async () => {
    const save = failingThenSucceeding(1);
    const autosave = createDebouncedSave(save, DELAY_MS);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(DELAY_MS);
    await vi.advanceTimersByTimeAsync(600);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(DELAY_MS - 1);
    expect(save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("does not retry a failed save that was cancelled while it ran", async () => {
    let rejectSave: (error: Error) => void = () => undefined;
    const save = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const autosave = createDebouncedSave(save, DELAY_MS, () => undefined);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(DELAY_MS);

    autosave.cancel();
    rejectSave(new Error("offline"));
    await vi.advanceTimersByTimeAsync(5 * DELAY_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.hasPending()).toBe(false);
  });

  it("lets a failed flush be retried by the caller scheduling again", async () => {
    const save = failingThenSucceeding(1);
    const onError = vi.fn();
    const autosave = createDebouncedSave(save, DELAY_MS, onError);
    autosave.schedule();
    await expect(autosave.flush()).rejects.toThrow("offline");

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(DELAY_MS);

    expect(save).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not leave an unhandled rejection while retrying", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const autosave = createDebouncedSave(() => Promise.reject(new Error("boom")), DELAY_MS, () => undefined);
      autosave.schedule();
      await vi.advanceTimersByTimeAsync(3 * DELAY_MS);
      autosave.cancel();
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
