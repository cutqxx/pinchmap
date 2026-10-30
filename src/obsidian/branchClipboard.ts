import type { BranchClipboard } from "../editor";
import { branchToMarkdown, parsePastedBranches } from "../format";

export interface TextClipboard {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

/**
 * Uses the async clipboard API: it is called straight from a key press or a menu tap (a user gesture),
 * which is what iOS requires, and it works from a menu item where DOM `copy`/`paste` events do not fire.
 * Missing API or denied permission leaves the clipboard and the map untouched.
 */
export function createBranchClipboard(textClipboard: TextClipboard | undefined): BranchClipboard {
  return {
    writeBranch: async (map, nodeId) => {
      await textClipboard?.writeText(branchToMarkdown(map, nodeId)).catch(ignoreUnavailableClipboard);
    },
    readBranches: async () => {
      const text = await textClipboard?.readText().catch(ignoreUnavailableClipboard);
      return parsePastedBranches(text ?? "");
    },
  };
}

function ignoreUnavailableClipboard(): undefined {
  return undefined;
}

export function textClipboardOf(view: Window): TextClipboard | undefined {
  return (view.navigator as Navigator | undefined)?.clipboard as TextClipboard | undefined;
}
