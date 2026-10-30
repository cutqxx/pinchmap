import { Notice } from "obsidian";
import { t } from "./i18n";

export function reportFailure(action: Promise<void>): void {
  action.catch((error: unknown) => {
    console.error(error);
    new Notice(t("mapActionFailed"));
  });
}
