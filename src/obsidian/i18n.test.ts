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
