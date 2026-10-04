import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const exportDialogPath = fileURLToPath(
  new URL("../src/export-dialog.ts", import.meta.url)
);
const exportSource = readFileSync(exportDialogPath, "utf8");
if (exportSource.includes("new Dialog<") || exportSource.includes("new Dialog(")) {
  throw new Error("export action still opens a duplicate configuration dialog");
}
if (exportSource.indexOf("const destinations = chooseDestinations") <
    exportSource.indexOf("const warningDecision = await confirmWarnings")) {
  throw new Error("output folder is still selected before export warnings are resolved");
}

const entry = `
  globalThis.tl = key => key;
  let shown = null;
  globalThis.Blockbench = {
    showMessageBox(options, callback) {
      shown = { options, callback };
    }
  };

  const { confirmWarnings } = await import(${JSON.stringify(exportDialogPath)});
  const acceptedPromise = confirmWarnings([
    { title: "Texture warning", message: "Texture details" },
    { title: "Bounds warning", message: "Bounds details" }
  ]);
  if (!shown) throw new Error("warning confirmation dialog was not shown");
  if (!shown.options.message.includes("Texture details") ||
      !shown.options.message.includes("Bounds details")) {
    throw new Error("export warnings were not combined into one confirmation");
  }
  if (!shown.options.message.includes("border-left:3px solid #e25d68")) {
    throw new Error("warning hierarchy styling was not rendered");
  }
  shown.callback(1);
  if (await acceptedPromise !== "continue") {
    throw new Error("confirm button did not continue export");
  }

  const cancelledPromise = confirmWarnings([
    { title: "Warning", message: "Details" }
  ]);
  shown.callback(shown.options.cancelIndex ?? shown.options.buttons.length - 1);
  if (await cancelledPromise !== "cancel") {
    throw new Error("cancel button did not stop export");
  }

  if (await confirmWarnings([]) !== "continue") {
    throw new Error("empty warning list did not continue immediately");
  }

  const boundsPromise = confirmWarnings([{
    title: "Bounds warning",
    message: "Frame details",
    boundsAnimationUuid: "animation-a"
  }]);
  if (shown.options.buttons.length !== 3 || shown.options.buttons[1] !== "Open Bounds Checker") {
    throw new Error("bounds-check handoff was not offered");
  }
  if (shown.options.cancelIndex !== 0 || shown.options.confirmIndex !== 2) {
    throw new Error("bounds handoff dialog native cancellation/confirmation indices are unsafe");
  }
  shown.callback(1);
  if (await boundsPromise !== "bounds") {
    throw new Error("bounds-check handoff did not cancel the export flow");
  }
`;

const output = await build({
  stdin: {
    contents: entry,
    resolveDir: process.cwd(),
    sourcefile: "export-confirmation-test.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node20",
  loader: { ".vsh": "text", ".fsh": "text", ".png": "dataurl" },
  define: {
    __DAP_FORCE_LANGUAGE__: "null",
  },
});

try {
  await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`
  );
} catch (error) {
  throw new Error(error instanceof Error ? error.message : String(error));
}
