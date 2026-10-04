import { build } from "esbuild";

/**
 * Shared test harness: bundles a test entry with esbuild and imports it as a
 * module. Every scripts/test-*.mjs used to repeat this build/import pair.
 *
 * `define` is passed through to esbuild; omit it to leave
 * __DAP_FORCE_LANGUAGE__ undefined, matching scripts that never defined it.
 */
export async function importTestBundle(entry, { sourcefile = "test-entry.ts", define } = {}) {
  const output = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), sourcefile, loader: "ts" },
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    target: "node20",
    loader: {
      ".vsh": "text",
      ".fsh": "text",
      ".png": "dataurl",
    },
    ...(define ? { define } : {}),
  });
  const code = Buffer.from(output.outputFiles[0].contents).toString("base64");
  return import(`data:text/javascript;base64,${code}`);
}
