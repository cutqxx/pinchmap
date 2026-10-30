import { describe, expect, it } from "vitest";
import { addChild, addRoot, addSibling, deleteBranch, setNodeCollapsed, setNodeColor, setNodeText } from "../commands";
import { parseMapFile, serializeMapFile } from "../format";
import { canonicalNodeText, generateNodeId } from "../model";
import type { MindMap, NodeId } from "../model";

const SEEDS = 40;
const COMMANDS_PER_SEED = 12;

const TEXTS = ["alpha", "beta gamma", "two\nlines", "", "- bullet", "--", "- -", "a - b", "line\n- not a child", "ends with caret ^", "code:\n```", "%%", "x\n%%", "```js\nconst a = 1;\n- not a child\n```", "```", "~~~\n- x", "a\n~~~~\n- y\n~~~~", "%%\nhidden\n%%", "* * *", "x\n* * *", "````\n```\n````", "x\n  - z", "x\nplain\n\t* t", "x\nplain\n    + deep\n  \\- kept"];

const FILES = [
  "- a ^a1\n\t- b ^b2\n- c ^c3\n",
  "---\nmindmap: true\n---\n- a ^a1\n\t- b ^b2\n\t\t- d ^d4\n- c ^c3\n\nOutro\n\n- other list\n",
  "---\r\nmindmap: true\r\n---\r\n- a ^a1\r\n- c ^c3\r\n\r\nOutro\r\n\r\n- other list\r\n",
  "- a ^a1\n- b ^b2",
  "Just text, no list",
  "```\n- fake\n```\n\n- a ^a1\n\t- b ^b2\n",
  "- a ^a1\n  ```\n  - code\n  ```\n\t- b ^b2\n\nOutro\n\n```js\nx\n```\n%%\n```json\n{\"version\":1,\"nodes\":{\"b2\":{\"color\":\"red\"}}}\n```\n%%\n",
  "Intro\n\n- ```js ^a1\n  - code\n  ```\n- b ^b2\n\n* * *\n\n- other\n",
];

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T;
}

function randomCommand(map: MindMap, random: () => number): MindMap {
  const ids = [...map.nodes.keys()];
  const newId = generateNodeId(new Set(ids), random);
  const text = pick(TEXTS, random);
  if (ids.length === 0) return addRoot(map, { id: newId, text, position: { x: 0, y: 0 } });
  const target: NodeId = pick(ids, random);
  switch (Math.floor(random() * 7)) {
    case 0:
      return addChild(map, { parentId: target, id: newId, text });
    case 1:
      return addSibling(map, { anchorId: target, id: newId, text });
    case 2:
      return addRoot(map, { id: newId, text, position: { x: Math.floor(random() * 500), y: Math.floor(random() * 500) } });
    case 3:
    case 4:
      return deleteBranch(map, { nodeId: target });
    case 5:
      return setNodeText(map, { nodeId: target, text });
    default:
      return random() < 0.5
        ? setNodeCollapsed(map, { nodeId: target, isCollapsed: random() < 0.5 })
        : setNodeColor(map, { nodeId: target, color: random() < 0.5 ? "red" : undefined });
  }
}

/** Every node as [id, canonical text, parent id], in document order, so two maps compare by structure. */
function structureOf(map: MindMap): (string | null)[][] {
  const lines: (string | null)[][] = [];
  const visit = (id: NodeId): void => {
    const node = map.nodes.get(id);
    if (node === undefined) throw new Error(`dangling id ${id}`);
    lines.push([node.id, canonicalNodeText(node.text), node.parentId]);
    node.childIds.forEach(visit);
  };
  map.rootIds.forEach(visit);
  return lines;
}

describe("editing a map and saving it", () => {
  it.each(FILES.map((file, index) => [index, file] as const))("keeps file %i readable as the same map after random commands (seeded)", (fileIndex, file) => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const random = seededRandom(seed * 7919 + fileIndex);
      const { map: loaded, source } = parseMapFile(file, random);
      let map = loaded;

      for (let step = 1; step <= COMMANDS_PER_SEED; step++) {
        map = randomCommand(map, random);
        const saved = serializeMapFile(map, source);
        const reread = parseMapFile(saved, random);
        const context = `file ${fileIndex}, seed ${seed}, step ${step}`;

        expect(structureOf(reread.map), context).toEqual(structureOf(map));
        expect(reread.map.nodes.size === 0, `${context}: map vanished from the file`).toBe(map.nodes.size === 0);
        expect(serializeMapFile(reread.map, reread.source), `${context}: second save differs`).toBe(saved);
      }
    }
  });

  it("never turns the list after the map into the map when every node was deleted", () => {
    const file = "---\nmindmap: true\n---\n- a ^a1\n\t- b ^b2\n- c ^c3\n\nOutro\n\n- other list\n";
    const { map, source } = parseMapFile(file);
    const everythingDeleted = ["a1", "c3"].reduce((current, nodeId) => deleteBranch(current, { nodeId }), map);

    const reread = parseMapFile(serializeMapFile(everythingDeleted, source));

    expect([...reread.map.nodes.values()].map((node) => node.text)).toEqual([""]);
    expect(serializeMapFile(everythingDeleted, source)).toContain("Outro\n\n- other list\n");
  });
});
