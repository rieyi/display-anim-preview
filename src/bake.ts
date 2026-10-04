import {
  applyCompiledDisplaySnapshot,
  cloneCompiledDisplay,
  type CompiledDisplay,
} from "./display-snapshot";
import { tr } from "./i18n";
import { resolveJavaBlockCodec } from "./java-block-codec";
import { assertBoundsTaskActive, type BoundsTaskControl, yieldBoundsTask } from "./bounds-task";
import { assertNoHandScaleKeyframes, resolveProjectHandRig, type HandRigGroups } from "./hand-rig";
import {
  IDENTITY_MATRIX,
  invertRigidMatrix,
  multiplyMatrices,
  captureHandPose,
  type BakedHandPoses,
} from "./hand-pose";

/**
 * Bake skeletal animation into flat Java block models using Blockbench transforms.
 * Group.resolve() flattens the hierarchy inside a cancelled Undo transaction per frame.
 * Include animation snapshots because Group animators own the keyframes.
 */

/** Cube coordinates outside the Minecraft model bounds. */
export interface OutOfBoundsHit {
  frame: number;
  elementIndex: number;
  elementName: string;
  axis: "x" | "y" | "z";
  field: "from" | "to";
  value: number;
  /** Map back to the source element before hierarchy flattening when possible. */
  sourceElementUuid?: string;
  /** Source ancestor groups, nearest first, for locating contributing keyframes. */
  sourceGroupUuids?: string[];
}

export interface BakedFrame {
  frame: number;
  /**
   * Parsed Java block model as emitted by the Blockbench codec. Frames are
   * single-use: `buildResourcePack` rewrites texture and element entries in
   * place, so the same frame objects must not be fed through it twice.
   */
  model: Record<string, unknown>;
  /** Per-frame arm motion against fixed authoring anchors, including edited rest placement. */
  hands?: BakedHandPoses;
}

export interface BakeResult {
  frames: BakedFrame[];
  outOfBounds: OutOfBoundsHit[];
}

export interface BakedAnimationSequence extends BakeResult {
  sourceUuid: string;
  sourceName: string;
  key: string;
}

function snapshotCompiledDisplay(): CompiledDisplay | undefined {
  try {
    const compiled = JSON.parse(
      resolveJavaBlockCodec().compile({ prevent_dialog: true })
    ) as { display?: CompiledDisplay };
    return cloneCompiledDisplay(compiled.display);
  } catch (err) {
    console.warn("Unable to snapshot current display settings before baking", err);
    return undefined;
  }
}

/** Minecraft Java coordinate limits verified against the built-in java_block format. */
const COORDINATE_MIN = -16;
const COORDINATE_MAX = 32;

const AXIS_NAMES: Array<"x" | "y" | "z"> = ["x", "y", "z"];

/** Apply the current timeline animation offsets to static node data. */
function applyAnimatedOffsets(node: OutlinerNodeLike, animation: Animation): void {
  const offsetRotation: [number, number, number] = [0, 0, 0];
  const offsetPosition: [number, number, number] = [0, 0, 0];

  const animator = animation.getBoneAnimator(node);
  if (!animator || !(node instanceof Group)) return;

  const multiplier = animation.blend_weight
    ? Math.max(Animator.MolangParser.parse(animation.blend_weight), 0)
    : 1;

  if (animator.channels.rotation) {
    const rotation = animator.interpolate("rotation");
    if (rotation instanceof Array) {
      offsetRotation.V3_add(rotation.map((v) => v * multiplier));
    }
  }
  if (animator.channels.position) {
    const position = animator.interpolate("position");
    if (position instanceof Array) {
      offsetPosition.V3_add(position.map((v) => v * multiplier));
    }
  }

  if (node.getTypeBehavior("rotatable") && node.rotation) {
    node.rotation[0] += offsetRotation[0];
    node.rotation[1] += offsetRotation[1];
    node.rotation[2] += offsetRotation[2];
  }

  applyPositionOffset(node, offsetPosition);
}

/** Translate every coordinate in a node subtree. */
function applyPositionOffset(node: OutlinerNodeLike, offset: [number, number, number]): void {
  if (node instanceof Group) {
    node.origin?.V3_add(offset);
    for (const child of node.children) {
      applyPositionOffset(child, offset);
    }
    return;
  }
  node.from?.V3_add(offset);
  node.to?.V3_add(offset);
  if (node.origin && node.origin !== node.from) {
    node.origin.V3_add(offset);
  }
}

/** Resolve top-level groups repeatedly until the hierarchy is flat. */
function flattenHierarchy(): void {
  for (let round = 0; round < 100; round++) {
    const topLevel = Group.all.filter((group) => !(group.parent instanceof Group));
    if (!topLevel.length) return;
    for (const group of topLevel) {
      group.resolve(false);
    }
  }
  console.warn("Bone hierarchy did not fully flatten within the iteration cap");
}

function belongsToRoot(node: OutlinerNodeLike, rootGroupUuid: string): boolean {
  let current: OutlinerNodeLike | "root" | null = node;
  while (current && current !== "root") {
    if (current.uuid === rootGroupUuid) return true;
    current = current.parent;
  }
  return false;
}

/** Temporarily exclude elements outside the requested root; Undo restores the flags. */
function restrictExportToRoot(rootGroupUuid?: string): void {
  if (!rootGroupUuid) return;
  for (const element of Outliner.elements) {
    if (!belongsToRoot(element, rootGroupUuid)) {
      element.export = false;
    }
  }
}

/** Scan compiled frames for coordinates outside Minecraft bounds. */
function collectOutOfBounds(
  frame: number,
  model: { elements?: Array<{ name?: string; from: number[]; to: number[] }> },
  sources: Array<{ elementUuid: string; groupUuids: string[] }>
): OutOfBoundsHit[] {
  const hits: OutOfBoundsHit[] = [];

  const elements = model.elements ?? [];
  elements.forEach((element, elementIndex) => {
    const fields: Array<["from" | "to", number[]]> = [
      ["from", element.from],
      ["to", element.to],
    ];
    for (const [field, values] of fields) {
      if (!(values instanceof Array)) continue;
      values.forEach((value, axis) => {
        if (value >= COORDINATE_MIN && value <= COORDINATE_MAX) return;
        hits.push({
          frame,
          elementIndex,
          elementName: element.name ?? `element ${elementIndex}`,
          axis: AXIS_NAMES[axis] ?? "x",
          field,
          value,
          sourceElementUuid: sources[elementIndex]?.elementUuid,
          sourceGroupUuids: sources[elementIndex]?.groupUuids,
        });
      });
    }
  });
  return hits;
}

/** Count keyframes as a rollback integrity check. */
function countKeyframes(): number {
  let total = 0;
  for (const animation of Animation.all) {
    const animators = animation.animators ?? {};
    for (const key of Object.keys(animators)) {
      total += animators[key]?.keyframes?.length ?? 0;
    }
  }
  return total;
}

function modelStructureSignature(): string {
  const elements = Outliner.elements.map((element) => element.uuid).sort();
  const groups = Group.all.map((group) => group.uuid).sort();
  return `${elements.join(",")}|${groups.join(",")}`;
}

function safelyCancelBakeEdit(token: unknown): void {
  if (Undo.current_save !== token) {
    throw new Error("Blockbench changed the active edit while restoring a baked frame.");
  }
  const previewDescriptor = Object.getOwnPropertyDescriptor(Animator, "preview");
  if (!previewDescriptor?.configurable) {
    throw new Error("Blockbench does not allow a safe animation-preview restore in this version.");
  }
  try {
    Object.defineProperty(Animator, "preview", {
      configurable: true,
      value: () => {},
    });
    Undo.cancelEdit(true);
  } finally {
    Object.defineProperty(Animator, "preview", previewDescriptor);
  }
  if (Undo.current_save) {
    throw new Error("Blockbench did not finish restoring the baked frame.");
  }
}

function readModelMatrix(group: OutlinerNodeLike): number[] {
  const chain: OutlinerNodeLike[] = [];
  let current: OutlinerNodeLike | "root" | null = group;
  while (current && current !== "root") {
    chain.unshift(current);
    current = current.parent;
  }

  let matrix = IDENTITY_MATRIX.slice();
  for (const item of chain) {
    // Verified against Blockbench 5.1.6: mesh.matrix is the Group's animated
    // parent-relative transform. matrixWorld additionally contains scene,
    // display_base, display_area, and mode-specific centering transforms.
    item.mesh.updateMatrixWorld(true);
    const local = item.mesh.matrix.toArray();
    if (local.length !== 16 || local.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid Blockbench model matrix for hand group ${item.name}.`);
    }
    matrix = multiplyMatrices(matrix, local);
  }
  return matrix;
}

function readHandMatrices(rig: HandRigGroups): BakedHandPoses {
  const read = (side: "left" | "right") => {
    const group = rig[side];
    const pose = captureHandPose(side, readModelMatrix(group));
    const cubes: OutlinerNodeLike[] = [];
    group.forEachChild?.(node => { if (node instanceof Cube) cubes.push(node); });
    if (!cubes.length) return pose;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    // Bounds center in the hand group's local frame avoids world-AABB drift
    // when a multi-cube hand rotates about an arbitrary authored pivot.
    const inverse = invertRigidMatrix(readModelMatrix(group));
    for (const cube of cubes) {
      const { from, to, origin } = cube;
      if (!from || !to || !origin) continue;
      const local = multiplyMatrices(inverse, readModelMatrix(cube));
      for (let corner = 0; corner < 8; corner++) {
        const point = [0, 1, 2].map(axis => ((corner & (1 << axis)) ? to[axis] : from[axis]) - origin[axis]);
        for (let axis = 0; axis < 3; axis++) {
          const value = local[12 + axis] + point.reduce((sum, v, column) => sum + local[column * 4 + axis] * v, 0);
          min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
        }
      }
    }
    const center = min.map((v, axis) => (v + max[axis]) / 2);
    if (center.every(Number.isFinite)) {
      const matrix = readModelMatrix(group);
      pose.center = [0, 1, 2].map(axis => matrix[12 + axis] + center.reduce((sum, v, column) => sum + matrix[column * 4 + axis] * v, 0));
    }
    return pose;
  };
  return { left: read("left"), right: read("right") };
}

/**
 * Bake frameCount frames at the requested FPS and restore timeline, selection, playback, model data, and Undo history.
 */
function* bakeFrameSteps(
  animation: Animation,
  frameCount: number,
  fps: number,
  rootGroupUuid?: string,
  collectBounds = true,
  captureHands = false
): Generator<{ frame: number; total: number }, BakeResult, void> {
  if (Undo.current_save) {
    throw new Error(tr("dap.bake.active_edit"));
  }
  const frames: BakedFrame[] = [];
  const outOfBounds: OutOfBoundsHit[] = [];

  const originalTime = Timeline.time;
  const sourceAnimationUuid = animation.uuid;
  const originalAnimationUuid = Animation.selected?.uuid;
  const playingStates = Animation.all.map((animation) => ({
    uuid: animation.uuid,
    playing: animation.playing,
  }));
  const originalSaved = Project?.saved;
  const keyframesBefore = countKeyframes();
  const structureBefore = modelStructureSignature();
  const originalModeId = Modes.selected.id;
  const displaySnapshot = snapshotCompiledDisplay();
  const sourceGroups = new Map<string, string[]>();
  let handRig: HandRigGroups | null = null;
  if (collectBounds) {
    for (const element of Outliner.elements) {
      const groupUuids: string[] = [];
      let parent = element.parent;
      while (parent && parent !== "root") {
        if (parent instanceof Group) groupUuids.push(parent.uuid);
        parent = parent.parent;
      }
      sourceGroups.set(element.uuid, groupUuids);
    }
  }

  try {
    // Interpolation returns no vectors outside animation mode, so baking must switch explicitly.
    Modes.options.animate?.select();
    for (const state of playingStates) {
      const current = Animation.all.find((item) => item.uuid === state.uuid);
      if (current) current.playing = false;
    }
    const initialTarget = Animation.all.find((item) => item.uuid === sourceAnimationUuid);
    if (!initialTarget) throw new Error(`Animation ${sourceAnimationUuid} is no longer available.`);
    initialTarget.select();
    if (captureHands) {
      handRig = resolveProjectHandRig();
      if (!handRig) throw new Error(tr("dap.hand.rig_missing"));
      assertNoHandScaleKeyframes(initialTarget, handRig);

    }
    initialTarget.playing = true;

    for (let frame = 0; frame < frameCount; frame++) {
      const targetAnimation = Animation.all.find((item) => item.uuid === sourceAnimationUuid);
      if (!targetAnimation) throw new Error(`Animation ${sourceAnimationUuid} disappeared during baking.`);
      // Undo may recreate group meshes with stale parent-relative transforms.
      // Rebuild the default hierarchy before applying this frame's animation.
      if (handRig) {
        handRig = resolveProjectHandRig();
        if (!handRig) throw new Error(tr("dap.hand.rig_missing"));
        Canvas.updateAll();
      }
      Timeline.setTime(frame / fps);
      Animator.preview();
      const currentHands = handRig ? readHandMatrices(handRig) : null;
      const hands = currentHands ?? undefined;

      const token = Undo.initEdit({
        elements: Outliner.elements.slice(),
        groups: Group.all.slice(),
        outliner: true,
        // Required: Group.resolve() deletes groups whose animators own the keyframes.
        animations: Animation.all.slice(),
      });

      try {
        restrictExportToRoot(rootGroupUuid);
        // Omit authored hand proxies only in the temporary bake transaction.
        if (handRig) {
          for (const group of [handRig.left, handRig.right]) {
            group.forEachChild?.(node => { node.export = false; });
          }
        }
        const animatableElements = Outliner.elements.filter(
          (element) => element.constructor.animator
        );
        for (const node of [...Group.all, ...animatableElements]) {
          applyAnimatedOffsets(node, targetAnimation);
        }
        flattenHierarchy();

        const compiledSources = collectBounds
          ? Outliner.elements
              .filter((element) => element.export !== false)
              .map((element) => ({
                elementUuid: element.uuid,
                groupUuids: sourceGroups.get(element.uuid) ?? [],
              }))
          : [];

        const compiled = JSON.parse(
          resolveJavaBlockCodec().compile({ prevent_dialog: true })
        ) as Record<string, unknown>;
        const model = applyCompiledDisplaySnapshot(compiled, displaySnapshot);
        frames.push({ frame, model, hands });
        if (collectBounds) {
          outOfBounds.push(...collectOutOfBounds(frame, model, compiledSources));
        }
      } finally {
        safelyCancelBakeEdit(token);
        if (modelStructureSignature() !== structureBefore) {
          throw new Error("Blockbench did not restore the model hierarchy after checking a frame.");
        }
      }
      yield { frame: frame + 1, total: frameCount };
    }
  } finally {
    for (const item of Animation.all) item.selected = false;
    const originalAnimation = originalAnimationUuid
      ? Animation.all.find((item) => item.uuid === originalAnimationUuid) ?? null
      : null;
    Animation.selected = originalAnimation;
    if (originalAnimation) originalAnimation.selected = true;
    for (const state of playingStates) {
      const current = Animation.all.find((item) => item.uuid === state.uuid);
      if (current) current.playing = state.playing;
    }
    Modes.options[originalModeId]?.select();
    Timeline.setTime(originalTime);
    Animator.preview();
    if (Project && originalSaved !== undefined) {
      Project.saved = originalSaved;
    }

    // Group counts alone cannot prove rollback integrity; keyframes must be checked directly.
    const keyframesAfter = countKeyframes();
    if (keyframesAfter !== keyframesBefore) {
      const lost = keyframesBefore - keyframesAfter;
      console.error(
        `Bake rollback incomplete: ${keyframesBefore} keyframes before, ${keyframesAfter} after (lost ${lost})`
      );
      Blockbench.showMessageBox({
        title: tr("dap.rollback.title"),
        message: tr("dap.rollback.message", {
          before: keyframesBefore,
          after: keyframesAfter,
          lost,
        }),
        icon: "error",
      });
    }
    if (modelStructureSignature() !== structureBefore) {
      console.error("Bake rollback incomplete: model hierarchy changed during baking");
    }
  }

  return { frames, outOfBounds };
}

export function bakeFrames(
  animation: Animation,
  frameCount: number,
  fps: number,
  rootGroupUuid?: string
): BakeResult {
  const generator = bakeFrameSteps(animation, frameCount, fps, rootGroupUuid);
  while (true) {
    const step = generator.next();
    if (step.done) return step.value;
  }
}

/** Asynchronous frame baking for cancellable, isolated bounds checks. */
export async function bakeFramesAsync(
  animation: Animation,
  frameCount: number,
  fps: number,
  control: BoundsTaskControl,
  onFrame?: (frame: number, total: number) => void,
  rootGroupUuid?: string,
  collectBounds = true,
  captureHands = false
): Promise<BakeResult> {
  const generator = bakeFrameSteps(animation, frameCount, fps, rootGroupUuid, collectBounds, captureHands);
  let completed = false;
  try {
    while (true) {
      assertBoundsTaskActive(control);
      const step = generator.next();
      if (step.done) {
        completed = true;
        return step.value;
      }
      onFrame?.(step.value.frame, step.value.total);
      await yieldBoundsTask();
    }
  } finally {
    if (!completed) generator.return({ frames: [], outOfBounds: [] });
  }
}

export function bakeAnimationSequence(
  animation: Animation,
  key: string,
  frameCount: number,
  fps: number
): BakedAnimationSequence {
  const result = bakeFrames(animation, frameCount, fps);
  return {
    sourceUuid: animation.uuid,
    sourceName: animation.name,
    key,
    ...result,
  };
}

// Single source of truth lives in export-layout; re-exported for existing consumers.
export { frameCountFor } from "./export-layout";
