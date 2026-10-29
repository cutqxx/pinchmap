const STRINGS = {
  en: {
    openAsMarkdown: "Open as Markdown",
    viewName: "Pinchmap",
  },
  ru: {
    openAsMarkdown: "Открыть как Markdown",
    viewName: "Pinchmap",
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
