import { describe, expect, it } from "vitest";
import { t } from "./i18n";

describe("t", () => {
  it("returns the Russian label for ru", () => {
    expect(t("openAsMarkdown", "ru")).toBe("Открыть как Markdown");
  });

  it("returns the English label for en", () => {
    expect(t("openAsMarkdown", "en")).toBe("Open as Markdown");
  });

  it("falls back to English for an unknown language", () => {
    expect(t("openAsMarkdown", "de")).toBe("Open as Markdown");
  });

  it("falls back to English for a null language", () => {
    expect(t("openAsMarkdown", null as unknown as string)).toBe("Open as Markdown");
  });

  it("uses the same view name in every language", () => {
    expect(t("viewName", "ru")).toBe("Pinchmap");
    expect(t("viewName", "en")).toBe("Pinchmap");
  });
});

describe("t done", () => {
  it("returns Готово for ru", () => {
    expect(t("done", "ru")).toBe("Готово");
  });

  it("returns Done for en", () => {
    expect(t("done", "en")).toBe("Done");
  });
});

describe("t map creation labels", () => {
  it.each([
    ["newMap", "Новая карта", "New map"],
    ["untitledName", "Без названия", "Untitled"],
    ["convertToMap", "Превратить эту заметку в карту", "Convert this note to a map"],
    ["openAsMap", "Открыть как карту", "Open as map"],
  ] as const)("returns the %s label in ru and en", (key, ru, en) => {
    expect(t(key, "ru")).toBe(ru);
    expect(t(key, "en")).toBe(en);
  });
});

describe("t mapActionFailed", () => {
  it("returns the failure notice in ru and en", () => {
    expect(t("mapActionFailed", "ru")).toBe("Pinchmap: действие не удалось. Подробности в консоли разработчика.");
    expect(t("mapActionFailed", "en")).toBe("Pinchmap: the action failed. See the developer console for details.");
  });
});

describe("t empty-space menu and long press setting", () => {
  it.each([
    ["addNode", "Добавить ноду", "Add node"],
    ["delete", "Удалить", "Delete"],
    ["longPressSettingName", "Длительность долгого нажатия", "Long press duration"],
    [
      "longPressSettingDescription",
      "Сколько секунд держать палец на ноде или на пустом месте, чтобы открыть меню. Допустимо от 0,2 до 2,0.",
      "Seconds to hold a finger on a node or on empty space to open its menu. Allowed range: 0.2 to 2.0.",
    ],
  ] as const)("returns the %s label in ru and en", (key, ru, en) => {
    expect(t(key, "ru")).toBe(ru);
    expect(t(key, "en")).toBe(en);
  });
});

describe("t undo and redo labels", () => {
  it.each([
    ["undo", "Отменить", "Undo"],
    ["redo", "Повторить", "Redo"],
  ] as const)("returns the %s label in ru and en", (key, ru, en) => {
    expect(t(key, "ru")).toBe(ru);
    expect(t(key, "en")).toBe(en);
  });
});
