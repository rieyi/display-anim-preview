import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const mathPath = fileURLToPath(new URL("../src/math-bounds.ts", import.meta.url));
const cachePath = fileURLToPath(new URL("../src/bounds-cache.ts", import.meta.url));
const entry = `
  globalThis.tl = key => key;
  class TestGroup {}
  TestGroup.all = [];
  globalThis.Group = TestGroup;
  const cube = {
    uuid: "cube", name: "Cube", parent: "root", from: [-17, 0, 0], to: [1, 1, 1],
    origin: [0, 0, 0], rotation: [0, 0, 0], inflate: 0, export: true,
    constructor: { name: "Cube" },
  };
  globalThis.Outliner = { elements: [cube] };
  globalThis.Format = { id: "java_block" };
  globalThis.Project = { saved: true };
  globalThis.Modes = {
    selected: { id: "edit" },
    options: {
      edit: { select() { Modes.selected.id = "edit"; } },
      animate: { select() { Modes.selected.id = "animate"; } },
    },
  };
  globalThis.Timeline = { time: 0.35, setTime(value) { this.time = value; } };
  globalThis.Animator = { preview() {}, MolangParser: { parse() { return 1; } } };
  const animation = {
    uuid: "idle", name: "Idle", length: 0.1, snapping: 20, blend_weight: "", animators: {},
    selected: true, playing: "locked",
    select() { Animation.selected = this; this.selected = true; },
    getBoneAnimator() { return null; },
  };
  const circularKeyframe = { time: 0, channel: "position", interpolation: "linear", data_points: [] };
  const circularPoint = { keyframe: circularKeyframe, x: "1", y: "2", z: "3" };
  circularKeyframe.data_points.push(circularPoint);
  animation.animators = { bone: { keyframes: [circularKeyframe] } };
  globalThis.Animation = { all: [animation], selected: animation };

  const { runQuickBoundsScan } = await import(${JSON.stringify(mathPath)});
  const {
    modelBoundsFingerprint, animationBoundsFingerprint, rememberBoundsDetection,
    validBoundsDetection, detectionStatus,
  } = await import(${JSON.stringify(cachePath)});
  const progress = [];
  const records = await runQuickBoundsScan([animation], {
    isCancelled: () => false,
    onProgress: value => progress.push(value),
  });
  if (records.length !== 1 || records[0].frames !== 3 || records[0].hits.length !== 3) {
    throw new Error("quick math scan did not sample and report every expected frame");
  }
  if (progress.length !== 3 || progress.at(-1).completedFrames !== 3) {
    throw new Error("quick math progress is incomplete");
  }
  if (Timeline.time !== 0.35 || Modes.selected.id !== "edit" || animation.playing !== "locked" || !Project.saved) {
    throw new Error("quick math scan did not restore editor state");
  }

  const modelFingerprint = modelBoundsFingerprint();
  if (records[0].fingerprint !== animationBoundsFingerprint(animation, modelFingerprint)) {
    throw new Error("range result fingerprint does not match current animation data");
  }
  rememberBoundsDetection(Project, records[0]);
  if (!validBoundsDetection(Project, animation, "quick") || !detectionStatus(Project, animation).quick) {
    throw new Error("unchanged animation did not reuse its quick range cache");
  }
  cube.from[0] = -15;
  const status = detectionStatus(Project, animation);
  if (validBoundsDetection(Project, animation, "quick") || !status.stale || status.quick) {
    throw new Error("model edits did not invalidate the animation range cache");
  }

  let progressCount = 0;
  let cancelled = false;
  try {
    await runQuickBoundsScan([animation], {
      isCancelled: () => progressCount > 0,
      onProgress: () => { progressCount++; },
    });
  } catch (error) {
    cancelled = error?.name === "BoundsTaskCancelledError";
  }
  if (!cancelled || Timeline.time !== 0.35 || animation.playing !== "locked") {
    throw new Error("cancelling a quick scan did not restore editor state");
  }
  process.stdout.write(JSON.stringify({ frames: records[0].frames, hits: records[0].hits.length, cacheInvalidated: status.stale }));
`;

await importTestBundle(entry, { sourcefile: "bounds-engine-test.ts", define: { __DAP_FORCE_LANGUAGE__: "null" } });
