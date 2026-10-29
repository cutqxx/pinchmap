import { describe, expect, it } from "vitest";
import committedFixture from "../../docs/fixtures/h1-200-nodes.md?raw";
import { parseMapFile } from "./parseMapFile";

function incrementingRandom(): () => number {
  let calls = 0;
  return () => (calls++ % 997) / 997;
}

function parseFixture() {
  return parseMapFile(committedFixture, incrementingRandom());
}

describe("H1 fixture", () => {
  it("is a map of exactly 200 nodes", () => {
    expect(parseFixture().map.nodes.size).toBe(200);
  });

  it("writes an id on every node so parsing does not need to generate any", () => {
    const parsed = parseFixture();

    expect([...parsed.source.items.values()].every((item) => item.hasWrittenId)).toBe(true);
  });

  it("has a single root with branches below it", () => {
    expect(parseFixture().map.rootIds).toHaveLength(1);
  });
});
