const STRINGS = {
  en: {
    openAsMarkdown: "Open as Markdown",
    viewName: "Pinchmap",
    layoutUnreadable: "Pinchmap: the map layout could not be read, so the automatic layout is used.",
    mapUpdatedExternally: "Map updated externally",
    addChild: "Add child",
    addSibling: "Add sibling",
    addNode: "Add node",
    color: "Color",
    noColor: "No color",
    colorRed: "Red",
    colorOrange: "Orange",
    colorYellow: "Yellow",
    colorGreen: "Green",
    colorCyan: "Cyan",
    colorPurple: "Purple",
    copy: "Copy",
    paste: "Paste",
    duplicate: "Duplicate",
    delete: "Delete",
    collapse: "Collapse",
    expand: "Expand",
    resetNodeLayout: "Reset to auto-layout",
    resetNodeLayoutCommand: "Reset node to auto-layout",
    resetMapLayoutCommand: "Reset map to auto-layout",
    longPressSettingName: "Long press duration",
    longPressSettingDescription: "Seconds to hold a finger on a node or on empty space to open its menu. Allowed range: 0.2 to 2.0.",
    done: "Done",
    undo: "Undo",
    redo: "Redo",
    newMap: "New map",
    untitledName: "Untitled",
    convertToMap: "Convert this note to a map",
    openAsMap: "Open as map",
    mapActionFailed: "Pinchmap: the action failed. See the developer console for details.",
    saveFailed: "Pinchmap: the map could not be saved. Your changes are kept and saving is retried.",
  },
  ru: {
    openAsMarkdown: "Открыть как Markdown",
    viewName: "Pinchmap",
    layoutUnreadable: "Pinchmap: раскладка карты не прочитана, используется автораскладка.",
    mapUpdatedExternally: "Карта обновлена извне",
    addChild: "Добавить дочернюю",
    addSibling: "Добавить соседнюю",
    addNode: "Добавить ноду",
    color: "Цвет",
    noColor: "Без цвета",
    colorRed: "Красный",
    colorOrange: "Оранжевый",
    colorYellow: "Жёлтый",
    colorGreen: "Зелёный",
    colorCyan: "Бирюзовый",
    colorPurple: "Фиолетовый",
    copy: "Копировать",
    paste: "Вставить",
    duplicate: "Дублировать",
    delete: "Удалить",
    collapse: "Свернуть",
    expand: "Развернуть",
    resetNodeLayout: "Вернуть в автораскладку",
    resetNodeLayoutCommand: "Вернуть ноду в автораскладку",
    resetMapLayoutCommand: "Вернуть карту в автораскладку",
    longPressSettingName: "Длительность долгого нажатия",
    longPressSettingDescription: "Сколько секунд держать палец на ноде или на пустом месте, чтобы открыть меню. Допустимо от 0,2 до 2,0.",
    done: "Готово",
    undo: "Отменить",
    redo: "Повторить",
    newMap: "Новая карта",
    untitledName: "Без названия",
    convertToMap: "Превратить эту заметку в карту",
    openAsMap: "Открыть как карту",
    mapActionFailed: "Pinchmap: действие не удалось. Подробности в консоли разработчика.",
    saveFailed: "Pinchmap: карту не удалось сохранить. Правки не потеряны, сохранение будет повторено.",
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
