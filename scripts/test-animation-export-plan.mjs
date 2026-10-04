import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(
  new URL("../src/animation-export-plan.ts", import.meta.url)
);

const entry = `
  const {
    animationKeyFromName,
    isValidAnimationKey,
    findAnimationKeyConflicts,
    createExportAnimationSpecs
  } = await import(${JSON.stringify(modulePath)});

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  const normalized = new Map([
    ["TPS Reload", "tps_reload"],
    ["  A/B:C!  ", "a_b_c"],
    ["Mixed.Case-01", "mixed.case-01"],
    ["中文动画", ""],
    ["   ", ""],
    [".", "."],
    ["..", ".."]
  ]);
  for (const [source, expected] of normalized) {
    assert(
      animationKeyFromName(source) === expected,
      JSON.stringify(source) + " did not normalize to " + JSON.stringify(expected)
    );
  }

  for (const invalid of ["", ".", "..", "中文"]) {
    const key = animationKeyFromName(invalid);
    assert(!isValidAnimationKey(key), JSON.stringify(invalid) + " produced a valid key");
  }
  for (const valid of ["reload", "tps_reload", "a.b-c_01"]) {
    assert(isValidAnimationKey(valid), valid + " should be a valid animation key");
  }

  const conflicts = findAnimationKeyConflicts([
    { name: "Reload" },
    { name: "reload" },
    { name: "Fire!" },
    { name: "Fire?" },
    { name: "中文" },
    { name: "武器" },
    { name: "." },
    { name: ".." },
    { name: "Unique Animation" }
  ]);
  const byKey = new Map(conflicts.map(conflict => [conflict.key, conflict.animationNames]));
  assert(byKey.get("reload")?.length === 2, "case-insensitive collision was not reported");
  assert(byKey.get("fire")?.length === 2, "punctuation collision was not reported");
  assert(byKey.get("")?.length === 2, "Chinese names that sanitize to empty were not grouped");
  assert(byKey.get(".")?.[0] === ".", "single-dot key was not rejected");
  assert(byKey.get("..")?.[0] === "..", "double-dot key was not rejected");
  assert(!byKey.has("unique_animation"), "unique valid key was incorrectly reported");

  const animations = [
    { uuid: "a", name: "Reload", length: 1, snapping: 12 },
    { uuid: "b", name: "Fire", length: 0.125, snapping: 30 },
    { uuid: "c", name: "Idle", length: 2.999, snapping: 0 }
  ];
  const specs = createExportAnimationSpecs(animations, 20);
  assert(specs.length === 3, "not every selected animation produced a specification");
  assert(specs[0].sourceFps === 12 && specs[0].frameCount === 21,
    "one-second 12 FPS source did not become 21 samples at 20 FPS");
  assert(specs[1].sourceFps === 30 && specs[1].frameCount === 3,
    "fractional-duration animation frame count is wrong");
  assert(specs[2].sourceFps === 20 && specs[2].frameCount === 60,
    "missing source snapping did not fall back to the export FPS");
  assert(specs.map(spec => spec.key).join(",") === "reload,fire,idle",
    "specification keys do not follow normalized animation names");
  const twelveFps = createExportAnimationSpecs(animations, 12);
  assert(twelveFps[0].frameCount === 13 && twelveFps[1].frameCount === 2,
    "manual export FPS did not change the baked model frame count");

  process.stdout.write(JSON.stringify({ normalized: normalized.size, conflicts: conflicts.length, specs: specs.length }));
`;

await importTestBundle(entry, { sourcefile: "animation-export-plan-test.ts" });
