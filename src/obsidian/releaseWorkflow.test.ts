/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

const workflows = import.meta.glob<string>("/.github/workflows/release.yml", {
  query: "?raw",
  import: "default",
  eager: true,
});

const workflow = Object.values(workflows)[0] ?? "";

/** The text of the step whose `name:` is given, up to the next step. */
function stepNamed(name: string): string {
  const steps = workflow.split(/\n {6}- /);
  const step = steps.find((candidate) => candidate.startsWith(`name: ${name}\n`));
  if (step === undefined) throw new Error(`no step named ${name}`);
  return step;
}

describe("release workflow", () => {
  it("is found", () => {
    expect(workflow).toContain("name: Release Obsidian plugin");
  });

  it("runs Node 22, which vitest needs", () => {
    expect(workflow).toMatch(/node-version: 22\n/);
  });

  it("lints, tests and builds, in that order, before any publishing", () => {
    const lint = workflow.indexOf("- run: npm run lint");
    const test = workflow.indexOf("- run: npm test");
    const build = workflow.indexOf("- run: npm run build");
    const firstPublish = workflow.indexOf("name: Publish");

    expect(lint).toBeGreaterThan(-1);
    expect(lint).toBeLessThan(test);
    expect(test).toBeLessThan(build);
    expect(build).toBeLessThan(firstPublish);
  });

  it("publishes the stable release only for main", () => {
    expect(stepNamed("Publish stable release")).toContain("if: github.ref_name == 'main'");
  });

  it("names the stable release after the manifest version", () => {
    expect(stepNamed("Publish stable release")).toContain('gh release create "$version"');
  });

  it("publishes nothing from any other branch, so BRAT users are only offered builds of main", () => {
    const publishingSteps = workflow.split(/\n {6}- /).filter((step) => step.includes("gh release"));

    expect(publishingSteps).toHaveLength(1);
    expect(publishingSteps[0]).toContain("if: github.ref_name == 'main'");
    expect(workflow).not.toContain("--prerelease");
  });

  it("refuses to overwrite a release whose tag points at another commit", () => {
    const step = stepNamed("Publish stable release");
    const guard = step.indexOf('if [ -n "$tag_sha" ] && [ "$tag_sha" != "$GITHUB_SHA" ]; then');

    expect(guard).toBeGreaterThan(-1);
    expect(step.indexOf("exit 1", guard)).toBeLessThan(step.indexOf("--clobber"));
  });

  it("creates the stable release at the pushed commit", () => {
    expect(stepNamed("Publish stable release")).toContain('--target "$GITHUB_SHA"');
  });
});
