import js from "@eslint/js";
import tseslint from "typescript-eslint";
import builtins from "builtin-modules";

const nodeBuiltinPaths = [...builtins, "electron"].map((name) => ({
  name,
  message: "Pinchmap runs on mobile: no Node or Electron modules.",
}));

const moduleNames = [
  "model",
  "format",
  "commands",
  "layout",
  "viewport",
  "render",
  "input",
  "editor",
  "obsidian",
];

const allowedDependencies = {
  model: [],
  format: ["model"],
  commands: ["model"],
  layout: ["model"],
  viewport: [],
  render: ["model", "layout", "viewport"],
  input: [],
  editor: ["model", "commands", "layout", "viewport", "render", "input"],
  obsidian: moduleNames.filter((name) => name !== "obsidian"),
};

function restrictionsFor(moduleName) {
  const allowed = allowedDependencies[moduleName];
  const forbiddenModules = moduleNames.filter(
    (name) => name !== moduleName && !allowed.includes(name),
  );
  const paths = [...nodeBuiltinPaths];
  if (moduleName !== "obsidian") {
    paths.push({
      name: "obsidian",
      message: "Only src/obsidian/ may import the obsidian package.",
    });
  }
  return {
    paths,
    patterns: [
      {
        group: ["../*/*", "../../*"],
        message: "Import other modules through their index.ts only.",
      },
      ...forbiddenModules.map((name) => ({
        group: [`../${name}`],
        message: `${moduleName}/ must not depend on ${name}/ (see .claude/BOUNDARIES.md).`,
      })),
    ],
  };
}

export default tseslint.config(
  { ignores: ["main.js", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...moduleNames.map((moduleName) => ({
    files: [`src/${moduleName}/**/*.ts`],
    rules: { "no-restricted-imports": ["error", restrictionsFor(moduleName)] },
  })),
);
