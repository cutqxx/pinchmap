import type { FileManager, MetadataCache, Vault, Workspace } from "obsidian";
import type { NodeLink } from "../model";

export interface LinkOpenerDeps {
  readonly workspace: Pick<Workspace, "openLinkText">;
  readonly metadataCache: Pick<MetadataCache, "getFirstLinkpathDest">;
  readonly vault: Pick<Vault, "create">;
  readonly fileManager: Pick<FileManager, "getNewFileParent">;
  openExternal(url: string): void;
}

/** Opens a node link: a note in a new tab (created first when missing, as clicking an unresolved link does), or a URL in the browser. */
export async function openNodeLink(deps: LinkOpenerDeps, sourcePath: string, link: NodeLink): Promise<void> {
  if (link.kind === "external") return deps.openExternal(link.target);
  await createNoteIfMissing(deps, sourcePath, notePathOf(link.target));
  await deps.workspace.openLinkText(link.target, sourcePath, "tab");
}

function notePathOf(target: string): string {
  return (target.split("#")[0] ?? "").trim();
}

async function createNoteIfMissing(deps: LinkOpenerDeps, sourcePath: string, notePath: string): Promise<void> {
  if (notePath === "" || deps.metadataCache.getFirstLinkpathDest(notePath, sourcePath) !== null) return;
  const fileName = notePath.endsWith(".md") ? notePath : `${notePath}.md`;
  const folder = deps.fileManager.getNewFileParent(sourcePath, fileName);
  const folderPrefix = folder.path === "/" ? "" : `${folder.path}/`;
  await deps.vault.create(`${folderPrefix}${fileName}`, "");
}
