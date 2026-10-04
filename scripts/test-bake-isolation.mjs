import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(new URL("../src/bake.ts", import.meta.url));

const entry = `
 globalThis.Canvas={updateAll(){}};
  globalThis.tl = key => key;

  if (!Array.prototype.V3_add) {
    Object.defineProperty(Array.prototype, "V3_add", {
      value(other) {
        this[0] += other[0];
        this[1] += other[1];
        this[2] += other[2];
        return this;
      },
      configurable: true
    });
  }

  function cloneVector(vector) {
    return vector ? [...vector] : vector;
  }
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  let resolvedRotation = null;

  class MockCube {
    static animator = false;
    constructor() {
      this.uuid = "cube";
      this.name = "cube";
      this.from = [0, 0, 0];
      this.to = [40, 1, 1];
      this.origin = this.from;
      this.parent = null;
      this.export = true;
    }
  }

  class MockGroup {
    static all = [];
    constructor(child) {
      this.uuid = "bone";
      this.name = "bone";
      this.origin = [0, 0, 0];
      this.rotation = [0, 0, 0];
      this.children = [child];
      this.parent = "root";
      this.mesh = {
        updateMatrixWorld() {},
        matrix: { toArray: () => [1,0,0,0,0,1,0,0,0,0,1,0,Animator.defaultPose ? 0 : Timeline.time * 20,0,0,1] },
        matrixWorld: { toArray: () => [1,0,0,0,0,1,0,0,0,0,1,0,Animator.defaultPose ? 0 : Timeline.time * 20,0,0,1] }
      };
      child.parent = this;
    }
    getTypeBehavior(name) {
      return name === "rotatable";
    }
    resolve() {
      resolvedRotation = [...this.rotation];
      const index = MockGroup.all.indexOf(this);
      if (index >= 0) MockGroup.all.splice(index, 1);
      for (const child of this.children) child.parent = "root";
    }
  }

  globalThis.Group = MockGroup;
  const cube = new MockCube();
  const group = new MockGroup(cube);
  MockGroup.all.push(group);
  globalThis.Outliner = { elements: [cube] };

  function makeAnimation({ uuid, name, playing, position, rotation, keyframes }) {
    const animation = {
      uuid,
      name,
      length: 1,
      snapping: 20,
      blend_weight: "",
      playing,
      selected: false,
      animators: {
        bone: { keyframes: Array.from({ length: keyframes }, (_, index) => ({ index })) }
      },
      getBoneAnimator(node) {
        if (node !== group) return null;
        return {
          channels: { position: true, rotation: true },
          interpolate(channel) {
            return channel === "position"
              ? [position + Timeline.time, 0, 0]
              : [0, rotation, 0];
          }
        };
      },
      select() {
        for (const item of Animation.all) item.selected = false;
        Animation.selected = this;
        this.selected = true;
      }
    };
    return animation;
  }

  const target = makeAnimation({
    uuid: "target", name: "Reload", playing: false, position: 1, rotation: 2, keyframes: 2
  });
  const otherPlaying = makeAnimation({
    uuid: "other", name: "Fire", playing: true, position: 100, rotation: 200, keyframes: 3
  });
  const otherLocked = makeAnimation({
    uuid: "locked", name: "Inspect", playing: "locked", position: 1000, rotation: 2000, keyframes: 4
  });
  otherPlaying.selected = true;
  globalThis.Animation = {
    all: [target, otherPlaying, otherLocked],
    selected: otherPlaying
  };

  globalThis.Timeline = {
    time: 2.75,
    setTime(value) { this.time = value; }
  };

  const modeOptions = {};
  function mode(id) {
    return {
      id,
      select() { Modes.selected = this; }
    };
  }
  modeOptions.edit = mode("edit");
  modeOptions.animate = mode("animate");
  globalThis.Modes = { selected: modeOptions.edit, options: modeOptions };

  const playbackStatesDuringCompile = [];
  let compileCount = 0;
  const codec = {
    compile() {
      compileCount++;
      // The first compile snapshots display settings before playback state is changed.
      if (compileCount > 1) {
        playbackStatesDuringCompile.push(Animation.all.map(animation => animation.playing));
      }
      return JSON.stringify({
        display: { gui: { rotation: [1, 2, 3] } },
        elements: [{ name: cube.name, from: cloneVector(cube.from), to: cloneVector(cube.to) }],
        probe: { rotation: resolvedRotation ? [...resolvedRotation] : [0, 0, 0] }
      });
    }
  };
  globalThis.Format = { codec };
  // The resolver must ignore the live format's codec (it can resolve to
  // Codecs.project) and use the real Java block compiler instead.
  globalThis.Formats = { java_block: { codec } };
  globalThis.Codecs = {};

  globalThis.Animator = {
    previewCalls: 0,
    defaultPose: false,
    showDefaultPose() { this.defaultPose = true; },
    preview() {
      this.defaultPose = false;
      this.previewCalls++;
      if (MockGroup.all.length === 0) {
        throw new Error("Cannot read properties of undefined (reading 'fix_rotation')");
      }
    },
    MolangParser: { parse() { return 1; } }
  };
  globalThis.Project = { saved: true, display_anim_export_settings: {
    version: 7, handRenderingEnabled: true, handLeftGroupUuid: "bone", handRightGroupUuid: "bone"
  } };
  globalThis.Blockbench = {
    showMessageBox() {
      throw new Error("rollback integrity warning was displayed");
    }
  };

  let undoSnapshot = null;
  globalThis.Undo = {
    current_save: null,
    initEdit() {
      const token = {};
      this.current_save = token;
      undoSnapshot = {
        groups: [...MockGroup.all],
        groupOrigin: cloneVector(group.origin),
        groupRotation: cloneVector(group.rotation),
        groupParent: group.parent,
        cubeFrom: cloneVector(cube.from),
        cubeTo: cloneVector(cube.to),
        cubeOriginWasFrom: cube.origin === cube.from,
        cubeParent: cube.parent,
        cubeExport: cube.export,
        resolvedRotation
      };
      return token;
    },
    cancelEdit() {
      // Blockbench previews before its Undo restoration has completely settled.
      Animator.preview();
      MockGroup.all.splice(0, MockGroup.all.length, ...undoSnapshot.groups);
      group.origin.splice(0, 3, ...undoSnapshot.groupOrigin);
      group.rotation.splice(0, 3, ...undoSnapshot.groupRotation);
      group.parent = undoSnapshot.groupParent;
      cube.from.splice(0, 3, ...undoSnapshot.cubeFrom);
      cube.to.splice(0, 3, ...undoSnapshot.cubeTo);
      cube.origin = undoSnapshot.cubeOriginWasFrom ? cube.from : cloneVector(undoSnapshot.cubeFrom);
      cube.parent = undoSnapshot.cubeParent;
      cube.export = undoSnapshot.cubeExport;
      resolvedRotation = undoSnapshot.resolvedRotation;
      this.current_save = null;
    }
  };

  const beforeKeyframeCount = Animation.all.reduce(
    (total, animation) => total + animation.animators.bone.keyframes.length,
    0
  );
  const beforeState = {
    selected: Animation.selected,
    selectedFlags: Animation.all.map(animation => animation.selected),
    playing: Animation.all.map(animation => animation.playing),
    time: Timeline.time,
    mode: Modes.selected.id,
    saved: Project.saved,
    groupOrigin: cloneVector(group.origin),
    groupRotation: cloneVector(group.rotation),
    cubeFrom: cloneVector(cube.from),
    cubeTo: cloneVector(cube.to),
    keyframes: beforeKeyframeCount
  };

  const { bakeFrames, bakeFramesAsync, bakeAnimationSequence } = await import(${JSON.stringify(modulePath)});
  Undo.current_save = { existing: true };
  let nestedEditRejected = false;
  try {
    bakeFrames(target, 1, 20);
  } catch (error) {
    nestedEditRejected = String(error).includes("edit transaction");
  }
  assert(nestedEditRejected, "baking did not reject an existing Blockbench edit transaction");
  assert(Undo.current_save.existing === true, "baking replaced the user's active edit transaction");
  Undo.current_save = null;
  const result = bakeFrames(target, 3, 20);

  assert(result.frames.length === 3, "target animation did not bake the requested frame count");
  assert(Undo.current_save === null, "baking left an Undo transaction active");
  assert(playbackStatesDuringCompile.length === 3,
    "did not observe playback state for every baked frame");
  const observedBakeStates = playbackStatesDuringCompile.length;
  for (const state of playbackStatesDuringCompile) {
    assert(state[0] === true && state[1] === false && state[2] === false,
      "another true/locked animation remained active while baking the target");
  }

  const parsedFrames = result.frames.map(frame => frame.model);
  parsedFrames.forEach((frame, index) => {
    const expectedX = 1 + index / 20;
    assert(Math.abs(frame.elements[0].from[0] - expectedX) < 1e-9,
      "frame contains a position offset from another animation");
    assert(frame.probe.rotation[1] === 2,
      "frame contains a rotation offset from another animation");
    assert(frame.display.gui.rotation.join(",") === "1,2,3",
      "compiled display snapshot was not retained");
  });
  assert(result.outOfBounds.length > 0, "out-of-range geometry was not reported");
  assert(result.outOfBounds.every(hit =>
    hit.sourceElementUuid === "cube" && hit.sourceGroupUuids.join(",") === "bone"
  ), "bounds report did not retain source element and parent animator identity");

  assert(Animation.selected === beforeState.selected, "selected animation was not restored");
  assert(Animation.all.map(animation => animation.selected).join(",") === beforeState.selectedFlags.join(","),
    "per-animation selected flags were not restored");
  assert(Animation.all.map(animation => animation.playing).join(",") === beforeState.playing.join(","),
    "true/false/locked playback states were not restored exactly");
  assert(Timeline.time === beforeState.time, "timeline time was not restored");
  assert(Modes.selected.id === beforeState.mode, "Blockbench mode was not restored");
  assert(Project.saved === beforeState.saved, "project saved state was not restored");
  assert(group.origin.join(",") === beforeState.groupOrigin.join(",") &&
      group.rotation.join(",") === beforeState.groupRotation.join(",") &&
      cube.from.join(",") === beforeState.cubeFrom.join(",") &&
      cube.to.join(",") === beforeState.cubeTo.join(","),
    "model geometry was not restored after the undo transaction");
  const afterKeyframeCount = Animation.all.reduce(
    (total, animation) => total + animation.animators.bone.keyframes.length,
    0
  );
  assert(afterKeyframeCount === beforeState.keyframes, "keyframe count changed during baking");

  // The sequence wrapper must retain source identity and the generated key.
  playbackStatesDuringCompile.splice(0);
  const sequence = bakeAnimationSequence(target, "reload", 1, 20);
  assert(sequence.sourceUuid === "target" && sequence.sourceName === "Reload" && sequence.key === "reload",
    "baked sequence did not retain its source identity");
  assert(sequence.frames.length === 1, "sequence wrapper returned the wrong number of frames");

  // Export with range checking disabled must still bake, but must not inspect or report model bounds.
  const bakeOnly = await bakeFramesAsync(
    target, 1, 20, { isCancelled: () => false }, undefined, undefined, false
  );
  assert(bakeOnly.frames.length === 1, "range-disabled export skipped the required isolated bake");
  assert(bakeOnly.outOfBounds.length === 0, "range-disabled export still collected coordinate violations");

  const withHands = await bakeFramesAsync(
    target, 2, 20, { isCancelled: () => false }, undefined, undefined, false, true
  );
  assert(withHands.frames.every(frame => frame.hands), "hand matrices were not attached to baked frames");
  assert(withHands.frames[0].hands.left.matrix[12] === -2 && withHands.frames[1].hands.left.matrix[12] === -1,
    "absolute hand model-space matrices were not sampled after Animator.preview");

  process.stdout.write(JSON.stringify({ frames: result.frames.length, states: observedBakeStates, keyframes: afterKeyframeCount }));
`;

const output = await build({
  stdin: {
    contents: entry,
    resolveDir: process.cwd(),
    sourcefile: "bake-isolation-test.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node20",
  loader: { ".png": "dataurl" },
  define: {
    __DAP_FORCE_LANGUAGE__: "null",
  },
});

try {
  await import(
    `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString("base64")}`
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
