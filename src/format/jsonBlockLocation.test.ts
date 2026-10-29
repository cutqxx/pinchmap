import { describe, expect, it } from "vitest";
import { findLastJsonBlock } from "./jsonBlockLocation";

const BLOCK = ["%%", "```json", '{"a": 1}', "```", "%%"].join("\n");

describe("findLastJsonBlock", () => {
  it("finds no block in text without a comment-wrapped json fence", () => {
    expect(findLastJsonBlock("- a\n```json\n{}\n```\n")).toBeNull();
  });

  it("finds no block in empty text", () => {
    expect(findLastJsonBlock("")).toBeNull();
  });

  it("returns the json body between the fences", () => {
    expect(findLastJsonBlock(`${BLOCK}\n`)?.body).toBe('{"a": 1}\n');
  });

  it("joins a multi-line body in order", () => {
    const text = "%%\n```json\n{\n\"a\": 1\n}\n```\n%%\n";

    expect(JSON.parse(findLastJsonBlock(text)?.body ?? "")).toEqual({ a: 1 });
  });

  it("covers exactly the block lines including the closing line break", () => {
    const text = `Intro\n${BLOCK}\nOutro\n`;

    const range = findLastJsonBlock(text)?.range;

    expect(text.slice(range?.start, range?.end)).toBe(`${BLOCK}\n`);
  });

  it("ends the range at the end of text when the closing mark has no line break", () => {
    const text = `Intro\n${BLOCK}`;

    const range = findLastJsonBlock(text)?.range;

    expect(text.slice(range?.start, range?.end)).toBe(BLOCK);
  });

  it("uses the last block when several are present", () => {
    const first = '%%\n```json\n{"n": 1}\n```\n%%\n';
    const last = '%%\n```json\n{"n": 2}\n```\n%%\n';
    const text = `${first}between\n${last}`;

    const found = findLastJsonBlock(text);

    expect(found?.body).toBe('{"n": 2}\n');
    expect(text.slice(found?.range.start)).toBe(last);
  });

  it("finds a block with CRLF line endings", () => {
    const text = 'x\r\n%%\r\n```json\r\n{"a": 1}\r\n```\r\n%%\r\n';

    const found = findLastJsonBlock(text);

    expect(JSON.parse(found?.body ?? "")).toEqual({ a: 1 });
    expect(text.slice(found?.range.start, found?.range.end)).toBe('%%\r\n```json\r\n{"a": 1}\r\n```\r\n%%\r\n');
  });

  it("finds no block when the fence is not closed", () => {
    expect(findLastJsonBlock("%%\n```json\n{}\n%%\n")).toBeNull();
  });

  it("finds no block when the closing comment mark is missing", () => {
    expect(findLastJsonBlock("%%\n```json\n{}\n```\n")).toBeNull();
  });

  it("finds no block when the fence is not json", () => {
    expect(findLastJsonBlock("%%\n```\n{}\n```\n%%\n")).toBeNull();
  });

  it("does not let an unterminated block swallow a later complete block", () => {
    const text = `%%\n\`\`\`json\n{"broken": \n%%\n${BLOCK}\n`;

    expect(findLastJsonBlock(text)?.body).toBe('{"a": 1}\n');
  });
});
