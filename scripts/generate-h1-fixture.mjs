// Generates a ~200-node map for the manual H1 performance check (Slice 5).
// Usage: node scripts/generate-h1-fixture.mjs [outputPath]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const NODE_COUNT = 200;
const BRANCH_COUNT = 8;
const LEAVES_PER_SUBBRANCH = 5;
const OUTPUT_PATH = process.argv[2] ?? "docs/fixtures/h1-200-nodes.md";

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
let sequence = 0;

function nextId() {
  let value = sequence++;
  let id = "";
  for (let i = 0; i < 6; i++) {
    id = ID_ALPHABET[value % ID_ALPHABET.length] + id;
    value = Math.floor(value / ID_ALPHABET.length);
  }
  return id;
}

function line(depth, text) {
  return `${"\t".repeat(depth)}- ${text} ^${nextId()}`;
}

function buildLines() {
  const lines = [line(0, "H1 test map: 200 nodes")];
  for (let branch = 1; lines.length < NODE_COUNT; branch = (branch % BRANCH_COUNT) + 1) {
    const subBranchCount = lines.filter((l) => l.startsWith("\t- ")).length;
    lines.push(line(1, `Branch ${branch}.${subBranchCount} with a longer title to wrap lines`));
    for (let leaf = 1; leaf <= LEAVES_PER_SUBBRANCH && lines.length < NODE_COUNT; leaf++) {
      lines.push(line(2, `Leaf ${leaf}`));
    }
  }
  return lines;
}

const body = ["---", "mindmap: true", "---", ...buildLines(), ""].join("\n");
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, body);
console.log(`Wrote ${NODE_COUNT} nodes to ${OUTPUT_PATH}`);
