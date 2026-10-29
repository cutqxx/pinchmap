import { describe, expect, it } from "vitest";
import { buildMindMap } from "../model";
import type { MindMap, NodeEntry } from "../model";
import { detectLineEnding, readJson, withJsonBlock } from "./jsonBlock";
import type { JsonSource } from "./jsonBlock";

const ABSENT: JsonSource = readJson("", "\n").source;

function block(...lines: string[]): string {
  return ["%%", "```json", ...lines, "```", "%%"].join("\n");
}

function mapOf(...entries: NodeEntry[]): MindMap {
  return buildMindMap(entries);
}

function write(map: MindMap, tail: string, lineEnding = "\n", body = "- a\n"): string {
  const json = readJson(tail, lineEnding).source;
  return withJsonBlock(body, tail, map, json);
}

describe("detectLineEnding", () => {
  it("answers LF for text without CRLF", () => {
    expect(detectLineEnding("a\nb\n")).toBe("\n");
  });

  it("answers CRLF when the text contains CRLF", () => {
    expect(detectLineEnding("a\r\nb\r\n")).toBe("\r\n");
  });

  it("answers LF for text without any line break", () => {
    expect(detectLineEnding("abc")).toBe("\n");
  });
});

describe("readJson", () => {
  it("reports an absent block when the tail has none", () => {
    const read = readJson("Outro\n", "\n");

    expect(read.source.status).toBe("absent");
    expect(read.states.size).toBe(0);
  });

  it("reads states of nodes from a block", () => {
    const tail = `${block('{"version": 1, "nodes": {"a1": {"collapsed": true}, "b2": {"color": "red"}}}')}\n`;

    const read = readJson(tail, "\n");

    expect(read.source.status).toBe("readable");
    expect(read.states.get("a1")).toEqual({ collapsed: true });
    expect(read.states.get("b2")).toEqual({ color: "red" });
  });

  it("skips node entries that have no state fields", () => {
    const read = readJson(`${block('{"nodes": {"a1": {}, "b2": {"left": true}, "c3": 5}}')}\n`, "\n");

    expect([...read.states.keys()]).toEqual(["b2"]);
  });

  it("keeps unknown top-level fields as extras without the nodes field", () => {
    const read = readJson(`${block('{"version": 2, "future": [1], "nodes": {}}')}\n`, "\n");

    expect(read.source.extras).toEqual({ version: 2, future: [1] });
  });

  it.each([
    ["invalid JSON", '{"nodes": {'],
    ["a JSON array", "[1, 2]"],
    ["a JSON string", '"text"'],
    ["a nodes field that is not an object", '{"nodes": [1]}'],
    ["an empty body", ""],
  ])("reports a corrupt block for %s", (_name, body) => {
    const read = readJson(`${block(body)}\n`, "\n");

    expect(read.source.status).toBe("corrupt");
    expect(read.states.size).toBe(0);
  });

  it("reads the last of several blocks", () => {
    const tail = `${block('{"nodes": {"old": {"left": true}}}')}\nmid\n${block('{"nodes": {"new": {"left": true}}}')}\n`;

    expect([...readJson(tail, "\n").states.keys()]).toEqual(["new"]);
  });

  it("reports a corrupt block when the last block is broken even if an earlier one is valid", () => {
    const tail = `${block('{"nodes": {"old": {"left": true}}}')}\n${block("{broken")}\n`;

    const read = readJson(tail, "\n");

    expect(read.source.status).toBe("corrupt");
    expect(read.states.size).toBe(0);
  });

  it("reads a block written with CRLF", () => {
    const tail = block('{"nodes": {"a1": {"left": true}}}').replace(/\n/g, "\r\n") + "\r\n";

    expect(readJson(tail, "\r\n").states.get("a1")).toEqual({ left: true });
  });
});

describe("withJsonBlock writing", () => {
  it("writes one node per line in document order", () => {
    const map = mapOf(
      { id: "c1", text: "c", parentId: "a1", state: { collapsed: true } },
      { id: "a1", text: "a", parentId: null, state: { color: "red" } },
      { id: "b1", text: "b", parentId: null, state: { left: true } },
    );

    const written = write(map, `${block('{"version": 1, "nodes": {"b1": {"left": true}}}')}\n`);

    expect(written).toBe(
      "- a\n" +
        block(
          "{",
          '"version": 1,',
          '"nodes": {',
          '"a1": {"color":"red"},',
          '"c1": {"collapsed":true},',
          '"b1": {"left":true}',
          "}",
          "}",
        ) +
        "\n",
    );
  });

  it("writes only nodes that have state", () => {
    const map = mapOf(
      { id: "a1", text: "a", parentId: null },
      { id: "b1", text: "b", parentId: null, state: { left: true } },
    );

    const written = write(map, `${block('{"nodes": {}}')}\n`);

    expect(written).toContain('"b1": {"left":true}');
    expect(written).not.toContain('"a1"');
  });

  it("drops entries of ids that are no longer in the map", () => {
    const tail = `${block('{"version": 1, "nodes": {"gone": {"left": true}, "a1": {"left": true}}}')}\n`;
    const { states } = readJson(tail, "\n");
    const map = mapOf({ id: "a1", text: "a", parentId: null, ...(states.has("a1") ? { state: states.get("a1") } : {}) });

    const written = write(map, tail);

    expect(written).not.toContain("gone");
    expect(written).toContain('"a1": {"left":true}');
  });

  it("round-trips unknown and future state fields untouched", () => {
    const state = { left: true, futureFlag: { deep: [1, "two", null, false] }, "ключ": "значение" };
    const map = mapOf({ id: "a1", text: "a", parentId: null, state });

    const written = write(map, "");

    const reread = readJson(written.slice("- a\n".length), "\n");
    expect(reread.states.get("a1")).toEqual(state);
  });

  it("keeps unknown top-level fields and the version of the existing block", () => {
    const tail = `${block('{"version": 7, "theme": {"x": 1}, "nodes": {}}')}\n`;
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const reread = readJson(write(map, tail).slice("- a\n".length), "\n");

    expect(reread.source.extras).toEqual({ version: 7, theme: { x: 1 } });
  });

  it("writes an empty nodes field when the existing block has no stateful nodes left", () => {
    const tail = `${block('{"version": 1, "nodes": {"a1": {"left": true}}}')}\n`;
    const map = mapOf({ id: "a1", text: "a", parentId: null });

    expect(write(map, tail)).toBe(`- a\n${block("{", '"version": 1,', '"nodes": {}', "}")}\n`);
  });

  it("writes no block at all when none exists and no node has state", () => {
    const map = mapOf({ id: "a1", text: "a", parentId: null });

    expect(withJsonBlock("- a\n", "Outro\n", map, ABSENT)).toBe("- a\nOutro\n");
  });

  it("appends a new block at the end after a blank line when none exists", () => {
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const written = withJsonBlock("- a\n", "Outro\n", map, ABSENT);

    expect(written.startsWith("- a\nOutro\n\n%%\n```json\n")).toBe(true);
    expect(written.endsWith("```\n%%\n")).toBe(true);
    expect(readJson(written.slice("- a\nOutro\n".length), "\n").states.get("a1")).toEqual({ left: true });
  });

  it("terminates an unterminated last line before appending a new block", () => {
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const written = withJsonBlock("- a", "", map, ABSENT);

    expect(written.startsWith("- a\n\n%%\n")).toBe(true);
  });

  it("replaces the block in place and keeps text before and after it", () => {
    const tail = `Outro\n${block('{"version": 1, "nodes": {}}')}\nAfter\n`;
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const written = write(map, tail);

    expect(written.startsWith("- a\nOutro\n%%\n")).toBe(true);
    expect(written.endsWith("%%\nAfter\n")).toBe(true);
    expect(written).toContain('"a1": {"left":true}');
  });

  it("keeps a missing line break after the closing mark of the replaced block", () => {
    const tail = block('{"nodes": {}}');
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    expect(write(map, tail).endsWith("```\n%%")).toBe(true);
  });

  it("rewrites only the last of several blocks and leaves earlier ones byte for byte", () => {
    const first = `${block('{"nodes": {"old": {"left": true}}}')}\n`;
    const tail = `${first}between\n${block('{"nodes": {}}')}\n`;
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const written = write(map, tail);

    expect(written.startsWith(`- a\n${first}between\n`)).toBe(true);
    expect(written).toContain('"a1": {"left":true}');
  });

  it("writes the block with CRLF when the file uses CRLF", () => {
    const tail = block('{"version": 1, "nodes": {}}').replace(/\n/g, "\r\n") + "\r\n";
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const written = write(map, tail, "\r\n", "- a\r\n");

    expect(written.replace(/\r\n/g, "")).not.toContain("\n");
    expect(written).toBe(
      "- a\r\n" +
        ["%%", "```json", "{", '"version": 1,', '"nodes": {', '"a1": {"left":true}', "}", "}", "```", "%%"].join("\r\n") +
        "\r\n",
    );
  });

  it("appends a new block with CRLF when the file uses CRLF and has none", () => {
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });
    const json = readJson("", "\r\n").source;

    const written = withJsonBlock("- a\r\n", "", map, json);

    expect(written.replace(/\r\n/g, "")).not.toContain("\n");
    expect(written.startsWith("- a\r\n\r\n%%\r\n```json\r\n")).toBe(true);
  });

  it("keeps a corrupt block in the tail and appends a new block after it", () => {
    const corrupt = `${block("{broken")}\n`;
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const written = write(map, `Outro\n${corrupt}`);

    expect(written.startsWith(`- a\nOutro\n${corrupt}`)).toBe(true);
    const newBlock = written.slice(`- a\nOutro\n${corrupt}`.length);
    expect(readJson(newBlock, "\n").states.get("a1")).toEqual({ left: true });
  });

  it("appends a block after a corrupt one even when no node has state", () => {
    const corrupt = `${block("{broken")}\n`;
    const map = mapOf({ id: "a1", text: "a", parentId: null });

    const written = write(map, corrupt);

    expect(written.startsWith(`- a\n${corrupt}`)).toBe(true);
    expect(readJson(written.slice(`- a\n${corrupt}`.length), "\n").source.status).toBe("readable");
  });

  it("makes a block that becomes the last one win when read again after a corrupt block", () => {
    const corrupt = `${block("{broken")}\n`;
    const map = mapOf({ id: "a1", text: "a", parentId: null, state: { left: true } });

    const written = write(map, corrupt);

    expect(readJson(written.slice("- a\n".length), "\n").states.get("a1")).toEqual({ left: true });
  });
});
