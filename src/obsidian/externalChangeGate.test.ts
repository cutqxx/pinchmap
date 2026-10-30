import { describe, expect, it, vi } from "vitest";
import { ExternalChangeGate } from "./externalChangeGate";

function createGate(initialText = "initial") {
  let isEditing = false;
  const reload = vi.fn<(text: string) => void>();
  const onReloadDeferred = vi.fn<() => void>();
  const gate = new ExternalChangeGate({ isEditingText: () => isEditing, reload, onReloadDeferred });
  gate.startFrom(initialText);
  return {
    gate,
    reload,
    onReloadDeferred,
    startEditing: () => {
      isEditing = true;
    },
    stopEditing: () => {
      isEditing = false;
    },
  };
}

describe("ExternalChangeGate when no text is being edited", () => {
  it("reloads at once with the changed text", () => {
    const { gate, reload } = createGate();

    gate.receive("from sync");

    expect(reload).toHaveBeenCalledExactlyOnceWith("from sync");
  });

  it("ignores the text the map started from", () => {
    const { gate, reload } = createGate("start");

    gate.receive("start");

    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores a text the map itself saved", () => {
    const { gate, reload } = createGate();
    gate.noteKnownText("saved by us");

    gate.receive("saved by us");

    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores an echo of an older own save when a newer save was made since", () => {
    const { gate, reload } = createGate();
    gate.noteKnownText("save 1");
    gate.noteKnownText("save 2");

    gate.receive("save 1");

    expect(reload).not.toHaveBeenCalled();
  });

  it("remembers the last five known texts", () => {
    const { gate, reload } = createGate("t0");
    ["t1", "t2", "t3", "t4"].forEach((text) => gate.noteKnownText(text));

    ["t0", "t1", "t2", "t3", "t4"].forEach((text) => gate.receive(text));

    expect(reload).not.toHaveBeenCalled();
  });

  it("forgets a known text after five newer ones", () => {
    const { gate, reload } = createGate("t0");
    ["t1", "t2", "t3", "t4", "t5"].forEach((text) => gate.noteKnownText(text));

    gate.receive("t0");

    expect(reload).toHaveBeenCalledExactlyOnceWith("t0");
  });

  it("does not let a repeated known text push older ones out", () => {
    const { gate, reload } = createGate("t0");
    ["t1", "t2", "t3", "t4"].forEach((text) => gate.noteKnownText(text));
    gate.noteKnownText("t4");
    gate.noteKnownText("t4");

    gate.receive("t0");

    expect(reload).not.toHaveBeenCalled();
  });

  it("drops known texts older than a received match and then reloads the dropped one", () => {
    const { gate, reload } = createGate("T0");
    gate.noteKnownText("T1");

    gate.receive("T1");
    expect(reload).not.toHaveBeenCalled();

    gate.receive("T0");
    expect(reload).toHaveBeenCalledExactlyOnceWith("T0");
  });

  it("still ignores late echoes of newer own writes after an older echo arrived", () => {
    const { gate, reload } = createGate("T0");
    gate.noteKnownText("T1");
    gate.noteKnownText("T2");

    gate.receive("T1");
    gate.receive("T2");
    gate.receive("T2");

    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps the five text cap after older texts were dropped by a match", () => {
    const { gate, reload } = createGate("t0");
    ["t1", "t2"].forEach((text) => gate.noteKnownText(text));
    gate.receive("t2");
    ["t3", "t4", "t5", "t6"].forEach((text) => gate.noteKnownText(text));

    gate.receive("t3");
    expect(reload).not.toHaveBeenCalled();

    gate.receive("t2");
    expect(reload).toHaveBeenCalledExactlyOnceWith("t2");
  });

  it("does not call onReloadDeferred when reloading at once", () => {
    const { gate, onReloadDeferred } = createGate();

    gate.receive("from sync");

    expect(onReloadDeferred).not.toHaveBeenCalled();
  });

  it("treats the reloaded text as known so its own echo does not reload again", () => {
    const { gate, reload } = createGate();
    gate.receive("from sync");

    gate.receive("from sync");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again for a different later external text", () => {
    const { gate, reload } = createGate();

    gate.receive("first");
    gate.receive("second");

    expect(reload.mock.calls).toEqual([["first"], ["second"]]);
  });

  it("forgets earlier known texts when started from a new text", () => {
    const { gate, reload } = createGate("old");

    gate.startFrom("new");
    gate.receive("old");

    expect(reload).toHaveBeenCalledExactlyOnceWith("old");
  });
});

describe("ExternalChangeGate while a text is being edited", () => {
  it("does not reload during the edit", () => {
    const { gate, reload, startEditing } = createGate();
    startEditing();

    gate.receive("from sync");

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once the edit has ended", () => {
    const { gate, reload, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("from sync");

    stopEditing();
    gate.resumeAfterTextEdit();

    expect(reload).toHaveBeenCalledExactlyOnceWith("from sync");
  });

  it("reloads with the latest of several external texts received during the edit", () => {
    const { gate, reload, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("first");
    gate.receive("second");

    stopEditing();
    gate.resumeAfterTextEdit();

    expect(reload).toHaveBeenCalledExactlyOnceWith("second");
  });

  it("does not reload on a second resume after the deferred text was applied", () => {
    const { gate, reload, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("from sync");
    stopEditing();
    gate.resumeAfterTextEdit();

    gate.resumeAfterTextEdit();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing on resume when nothing was deferred", () => {
    const { gate, reload } = createGate();

    gate.resumeAfterTextEdit();

    expect(reload).not.toHaveBeenCalled();
  });

  it("keeps waiting when resumed while another edit is still active", () => {
    const { gate, reload, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("from sync");

    gate.resumeAfterTextEdit();
    expect(reload).not.toHaveBeenCalled();

    stopEditing();
    gate.resumeAfterTextEdit();
    expect(reload).toHaveBeenCalledExactlyOnceWith("from sync");
  });

  it("does not defer a known text during the edit", () => {
    const { gate, reload, startEditing, stopEditing } = createGate("start");
    startEditing();
    gate.receive("start");

    stopEditing();
    gate.resumeAfterTextEdit();

    expect(reload).not.toHaveBeenCalled();
  });

  it("drops a deferred text when started from a new text", () => {
    const { gate, reload, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("stale");
    gate.startFrom("fresh");

    stopEditing();
    gate.resumeAfterTextEdit();

    expect(reload).not.toHaveBeenCalled();
  });
});

describe("ExternalChangeGate deferral signalling", () => {
  it("reports no deferred reload before anything was received", () => {
    const { gate } = createGate();

    expect(gate.hasDeferredReload()).toBe(false);
  });

  it("calls onReloadDeferred once when a text is deferred", () => {
    const { gate, onReloadDeferred, startEditing } = createGate();
    startEditing();

    gate.receive("from sync");

    expect(onReloadDeferred).toHaveBeenCalledTimes(1);
  });

  it("calls onReloadDeferred once per deferred text when several arrive during one edit", () => {
    const { gate, onReloadDeferred, startEditing } = createGate();
    startEditing();

    gate.receive("first");
    gate.receive("second");

    expect(onReloadDeferred).toHaveBeenCalledTimes(2);
  });

  it("reports a deferred reload while a text was deferred", () => {
    const { gate, startEditing } = createGate();
    startEditing();

    gate.receive("from sync");

    expect(gate.hasDeferredReload()).toBe(true);
  });

  it("does not call onReloadDeferred for a known text during the edit", () => {
    const { gate, onReloadDeferred, startEditing } = createGate("start");
    startEditing();

    gate.receive("start");

    expect(onReloadDeferred).not.toHaveBeenCalled();
    expect(gate.hasDeferredReload()).toBe(false);
  });

  it("does not defer an older echo received during the edit and then defers the dropped text", () => {
    const { gate, reload, onReloadDeferred, startEditing, stopEditing } = createGate("T0");
    gate.noteKnownText("T1");
    startEditing();

    gate.receive("T1");
    expect(onReloadDeferred).not.toHaveBeenCalled();

    gate.receive("T0");
    expect(onReloadDeferred).toHaveBeenCalledTimes(1);
    stopEditing();
    gate.resumeAfterTextEdit();
    expect(reload).toHaveBeenCalledExactlyOnceWith("T0");
  });

  it("reports no deferred reload after the deferred text was applied on resume", () => {
    const { gate, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("from sync");
    stopEditing();

    gate.resumeAfterTextEdit();

    expect(gate.hasDeferredReload()).toBe(false);
  });

  it("still reports a deferred reload when resumed while another edit is active", () => {
    const { gate, startEditing } = createGate();
    startEditing();
    gate.receive("from sync");

    gate.resumeAfterTextEdit();

    expect(gate.hasDeferredReload()).toBe(true);
  });

  it("reports no deferred reload after a later text was reloaded at once", () => {
    const { gate, reload, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("deferred");
    stopEditing();

    gate.receive("newer");

    expect(reload).toHaveBeenCalledExactlyOnceWith("newer");
    expect(gate.hasDeferredReload()).toBe(false);
  });

  it("reports no deferred reload after starting from a new text", () => {
    const { gate, startEditing } = createGate();
    startEditing();
    gate.receive("stale");

    gate.startFrom("fresh");

    expect(gate.hasDeferredReload()).toBe(false);
  });

  it("does not call onReloadDeferred on resume", () => {
    const { gate, onReloadDeferred, startEditing, stopEditing } = createGate();
    startEditing();
    gate.receive("from sync");
    stopEditing();
    onReloadDeferred.mockClear();

    gate.resumeAfterTextEdit();

    expect(onReloadDeferred).not.toHaveBeenCalled();
  });
});

describe("ExternalChangeGate known texts after a reload", () => {
  it("reloads the initial text after an external text replaced it when idle", () => {
    const { gate, reload } = createGate("A0");

    gate.receive("B");
    gate.receive("A0");

    expect(reload.mock.calls).toEqual([["B"], ["A0"]]);
  });

  it("reloads an own earlier save after an external text replaced it when idle", () => {
    const { gate, reload } = createGate("A0");
    gate.noteKnownText("A1");

    gate.receive("B");
    gate.receive("A1");

    expect(reload.mock.calls).toEqual([["B"], ["A1"]]);
  });

  it("defers the initial text after an external text was deferred and reloads it on resume", () => {
    const { gate, reload, onReloadDeferred, startEditing, stopEditing } = createGate("A0");
    startEditing();

    gate.receive("B");
    gate.receive("A0");

    expect(onReloadDeferred).toHaveBeenCalledTimes(2);
    stopEditing();
    gate.resumeAfterTextEdit();
    expect(reload).toHaveBeenCalledExactlyOnceWith("A0");
  });

  it("ignores the echo of an own save and a repeat of the reloaded text after a reload", () => {
    const { gate, reload } = createGate("A0");
    gate.receive("B");
    gate.noteKnownText("C");

    gate.receive("B");
    gate.receive("C");

    expect(reload).toHaveBeenCalledExactlyOnceWith("B");
  });
});

describe("ExternalChangeGate echoes of own saves", () => {
  it("ignores the newest own text any number of times", () => {
    const { gate, reload } = createGate("T0");
    gate.noteKnownText("T1");

    ["T1", "T1", "T1", "T1"].forEach((text) => gate.receive(text));

    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores an older own text once", () => {
    const { gate, reload } = createGate("T0");
    gate.noteKnownText("T1");
    gate.noteKnownText("T2");

    gate.receive("T1");

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads an older own text when it arrives a second time", () => {
    const { gate, reload } = createGate("T0");
    gate.noteKnownText("T1");
    gate.noteKnownText("T2");
    gate.receive("T1");

    gate.receive("T1");

    expect(reload).toHaveBeenCalledExactlyOnceWith("T1");
  });

  it("forgets everything older than a consumed old echo as well", () => {
    const { gate, reload } = createGate("T0");
    ["T1", "T2", "T3"].forEach((text) => gate.noteKnownText(text));
    gate.receive("T2");

    gate.receive("T0");
    gate.receive("T1");

    expect(reload.mock.calls).toEqual([["T0"], ["T1"]]);
  });

  it("still ignores the newest text after an old echo was consumed", () => {
    const { gate, reload } = createGate("T0");
    ["T1", "T2", "T3"].forEach((text) => gate.noteKnownText(text));
    gate.receive("T1");

    ["T3", "T3", "T3"].forEach((text) => gate.receive(text));

    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload for the echoes of rapid successive saves arriving in order", () => {
    const { gate, reload } = createGate("T0");
    ["T1", "T2", "T3", "T4"].forEach((text) => gate.noteKnownText(text));

    ["T1", "T2", "T3", "T4", "T4"].forEach((text) => gate.receive(text));

    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload for echoes of rapid saves when only the newest content is read each time", () => {
    const { gate, reload } = createGate("T0");
    ["T1", "T2", "T3"].forEach((text) => gate.noteKnownText(text));

    ["T3", "T3", "T3"].forEach((text) => gate.receive(text));

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads a file restored to an older version once the echoes of the saves have been seen", () => {
    const { gate, reload } = createGate("T0");
    ["T1", "T2", "T3"].forEach((text) => {
      gate.noteKnownText(text);
      gate.receive(text);
    });

    gate.receive("T2");

    expect(reload).toHaveBeenCalledExactlyOnceWith("T2");
  });

  it("reloads a file restored to the initial text after later saves were echoed", () => {
    const { gate, reload } = createGate("T0");
    gate.noteKnownText("T1");
    gate.receive("T1");

    gate.receive("T0");

    expect(reload).toHaveBeenCalledExactlyOnceWith("T0");
  });

  it("reloads a restored text only once and then ignores its echo", () => {
    const { gate, reload } = createGate("T0");
    gate.noteKnownText("T1");
    gate.receive("T1");
    gate.receive("T0");

    gate.receive("T0");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not defer or reload an old echo that arrives during a text edit, and reloads its second arrival after the edit", () => {
    const { gate, reload, onReloadDeferred, startEditing, stopEditing } = createGate("T0");
    gate.noteKnownText("T1");
    gate.noteKnownText("T2");
    startEditing();

    gate.receive("T1");
    expect(onReloadDeferred).not.toHaveBeenCalled();

    gate.receive("T1");
    stopEditing();
    gate.resumeAfterTextEdit();

    expect(reload).toHaveBeenCalledExactlyOnceWith("T1");
  });
});
