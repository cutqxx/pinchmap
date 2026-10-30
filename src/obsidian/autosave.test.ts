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
