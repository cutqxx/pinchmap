import { vi } from "vitest";

/** What a header action returned by the fake addAction must offer to MapView. */
export interface FakeHeaderAction {
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  classList: { add(name: string): void };
}

/** Per-test behaviour of the fake view; every hook is optional and has an inert default. */
export interface FakeTextFileViewHooks {
  readonly ownerDocument?: object;
  scope?(): unknown;
  addAction?(icon: string, title: string, callback: () => void): FakeHeaderAction;
  registerDomEvent?(target: unknown, type: string, callback: () => void): void;
  save?(): Promise<void>;
}

const INERT_ACTION: FakeHeaderAction = { setAttribute() {}, getAttribute: () => null, classList: { add() {} } };

/** A stand-in for Obsidian's TextFileView with just what MapView touches. */
function fakeTextFileViewClass(hooks: FakeTextFileViewHooks = {}) {
  return class TextFileView {
    contentEl = { classList: { add: vi.fn() }, ownerDocument: hooks.ownerDocument ?? { defaultView: {} } };
    file = null;
    app = { vault: { on: vi.fn(), read: vi.fn() } };
    scope: unknown = hooks.scope?.();
    constructor(public leaf: unknown) {}
    addAction(icon: string, title: string, callback: () => void): FakeHeaderAction {
      return hooks.addAction?.(icon, title, callback) ?? INERT_ACTION;
    }
    registerEvent(): void {}
    registerDomEvent(target: unknown, type: string, callback: () => void): void {
      hooks.registerDomEvent?.(target, type, callback);
    }
    save(): Promise<void> {
      return hooks.save?.() ?? Promise.resolve();
    }
  };
}

/**
 * The "obsidian" module surface MapView needs: the fake view and a Notice spy. Use it inside vi.mock:
 * `vi.mock("obsidian", async () => (await import("./testSupport/fakeTextFileView")).fakeObsidian({ ... }))`.
 */
export function fakeObsidian(hooks: FakeTextFileViewHooks = {}, notice: unknown = vi.fn()) {
  return { TextFileView: fakeTextFileViewClass(hooks), Notice: notice };
}
