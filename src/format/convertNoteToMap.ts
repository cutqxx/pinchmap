import { withMindmapFlag } from "./frontmatter";
import { appendRootItem } from "./newMapFile";
import { parseMapFile } from "./parseMapFile";
import { serializeMapFile } from "./serializeMapFile";

export function convertNoteToMap(text: string, noteName: string, random: () => number = Math.random): string {
  const flagged = withMindmapFlag(text);
  const { map, source } = parseMapFile(flagged, random);
  if (map.rootIds.length === 0) return appendRootItem(flagged, noteName, random);
  return serializeMapFile({ ...map }, source);
}
