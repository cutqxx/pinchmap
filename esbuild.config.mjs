import esbuild from "esbuild";
import builtins from "builtin-modules";

const isProduction = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/obsidian/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: isProduction ? false : "inline",
  treeShaking: true,
  minify: isProduction,
  outfile: "main.js",
});

if (isProduction) {
  await context.rebuild();
  process.exit(0);
}
await context.watch();
