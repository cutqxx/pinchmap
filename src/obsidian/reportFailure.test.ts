// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const notices = vi.hoisted(() => ({ shown: [] as string[] }));

vi.mock("obsidian", () => ({
  Notice: class {
    constructor(message: string) {
      notices.shown.push(message);
    }
  },
}));

import { reportFailure } from "./reportFailure";

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("reportFailure", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    notices.shown.length = 0;
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    window.localStorage.removeItem("language");
  });

  it("shows the failure notice when the action rejects", async () => {
    reportFailure(Promise.reject(new Error("boom")));
    await flushMicrotasks();

    expect(notices.shown).toEqual(["Pinchmap: the action failed. See the developer console for details."]);
  });

  it("shows the notice in Russian when Obsidian runs in Russian", async () => {
    window.localStorage.setItem("language", "ru");

    reportFailure(Promise.reject(new Error("boom")));
    await flushMicrotasks();

    expect(notices.shown).toEqual(["Pinchmap: действие не удалось. Подробности в консоли разработчика."]);
  });

  it("logs the rejection reason to the console", async () => {
    const failure = new Error("boom");

    reportFailure(Promise.reject(failure));
    await flushMicrotasks();

    expect(consoleError).toHaveBeenCalledWith(failure);
  });

  it("shows no notice and logs nothing when the action resolves", async () => {
    reportFailure(Promise.resolve());
    await flushMicrotasks();

    expect(notices.shown).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not throw synchronously for a rejected action", () => {
    expect(() => reportFailure(Promise.reject(new Error("boom")))).not.toThrow();
  });
});
