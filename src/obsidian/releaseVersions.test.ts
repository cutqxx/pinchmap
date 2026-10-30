/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

function readJson(path: string): Record<string, unknown> {
  const files = import.meta.glob<string>(["/package.json", "/manifest.json", "/versions.json"], { query: "?raw", import: "default", eager: true });
  const text = files[path];
  if (text === undefined) throw new Error(`${path} not found`);
  return JSON.parse(text) as Record<string, unknown>;
}

const packageJson = readJson("/package.json");
const manifest = readJson("/manifest.json");
const versions = readJson("/versions.json");

describe("release version files", () => {
  it("give package.json and manifest.json the same version", () => {
    expect(packageJson.version).toBe(manifest.version);
  });

  it("list the manifest version in versions.json with the manifest's minimum app version", () => {
    expect(versions[String(manifest.version)]).toBe(manifest.minAppVersion);
  });
});
