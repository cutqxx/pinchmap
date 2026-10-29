const STRINGS = {
  en: {
    openAsMarkdown: "Open as Markdown",
    viewName: "Pinchmap",
    layoutUnreadable: "Pinchmap: the map layout could not be read, so the automatic layout is used.",
    mapUpdatedExternally: "Map updated externally",
    addChild: "Add child",
    addSibling: "Add sibling",
    done: "Done",
    newMap: "New map",
    untitledName: "Untitled",
    convertToMap: "Convert this note to a map",
    openAsMap: "Open as map",
    mapActionFailed: "Pinchmap: the action failed. See the developer console for details.",
  },
  ru: {
    openAsMarkdown: "Открыть как Markdown",
    viewName: "Pinchmap",
    layoutUnreadable: "Pinchmap: раскладка карты не прочитана, используется автораскладка.",
    mapUpdatedExternally: "Карта обновлена извне",
    addChild: "Добавить дочернюю",
    addSibling: "Добавить соседнюю",
    done: "Готово",
    newMap: "Новая карта",
    untitledName: "Без названия",
    convertToMap: "Превратить эту заметку в карту",
    openAsMap: "Открыть как карту",
    mapActionFailed: "Pinchmap: действие не удалось. Подробности в консоли разработчика.",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

const OBSIDIAN_LANGUAGE_STORAGE_KEY = "language";

export function t(key: StringKey, language: string = readObsidianLanguage()): string {
  const dictionary = language === "ru" ? STRINGS.ru : STRINGS.en;
  return dictionary[key];
}

function readObsidianLanguage(): string {
  return window.localStorage.getItem(OBSIDIAN_LANGUAGE_STORAGE_KEY) ?? "en";
}
