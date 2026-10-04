import { build, context } from "esbuild";

/**
 * Bundle the plugin into a single JS file loadable via Blockbench
 * "Load Plugin from File". The output file name (without extension) must
 * exactly match the plugin id passed to Plugin.register() in src/plugin.ts,
 * or Blockbench refuses to load it.
 */
const outfileArgument = process.argv.find((argument) => argument.startsWith("--outfile="));
const outfile = outfileArgument?.slice("--outfile=".length) || "dist/display_anim_preview.js";
const forcedLanguage = process.argv.includes("--language=zh") ? '"zh"' : "null";
const officialRepository = process.argv.includes("--official") ? "true" : "false";

const options = {
  entryPoints: ["src/plugin.ts"],
  bundle: true,
  outfile,
  format: "iife",
  target: "es2020",
  platform: "browser",
  legalComments: "none",
  loader: {
    ".vsh": "text",
    ".fsh": "text",
    ".png": "dataurl",
  },
  // External map so stack traces in the browser devtools resolve to src/*.ts.
  sourcemap: "external",
  define: {
    __DAP_FORCE_LANGUAGE__: forcedLanguage,
    __DAP_OFFICIAL_REPOSITORY__: officialRepository,
  },
};

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching...");
} else {
  await build(options);
  console.log(`built ${outfile}`);
}
