import { describe, expect, it } from "vitest";
import { generateNodeId } from "./nodeId";

function sequenceRandom(): () => number {
  let counter = 0;
  return () => {
    counter += 1;
    return (counter % 36) / 36;
  };
}

describe("generateNodeId", () => {
  it("makes a six character id from a-z and 0-9", () => {
    expect(generateNodeId(new Set(), sequenceRandom())).toMatch(/^[a-z0-9]{6}$/);
  });

  it("never returns an id that is already taken", () => {
    const random = sequenceRandom();
    const first = generateNodeId(new Set(), random);
    const replay = sequenceRandom();

    const second = generateNodeId(new Set([first]), replay);

    expect(second).not.toBe(first);
    expect(second).toMatch(/^[a-z0-9]{6}$/);
  });

  it("keeps drawing until it finds a free id", () => {
    const values = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const random = () => values.shift() ?? 0.9;

    expect(generateNodeId(new Set(["aaaaaa"]), random)).toBe("ssssss");
  });
});
