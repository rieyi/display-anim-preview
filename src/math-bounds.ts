/** Read-only matrix bounds scans for interactive authoring checks. */

import { animationBoundsFingerprint, modelBoundsFingerprint, type BoundsDetectionRecord } from "./bounds-cache";
import { assertBoundsTaskActive, type BoundsTaskControl, yieldBoundsTask } from "./bounds-task";
import { frameCountFor, type OutOfBoundsHit } from "./bake";
import { getProjectAnimationFps } from "./export-animation-settings";

const MIN = -16;
const MAX = 32;
const DEG = Math.PI / 180;

type Vec3 = [number, number, number];

function vector(value: number[] | undefined, fallback: Vec3 = [0, 0, 0]): Vec3 {
  return value ? [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0] : [...fallback];
}

/** Blockbench Java models use ZYX Euler rotation order. */
function rotateZYX(point: Vec3, rotation: Vec3, origin: Vec3): Vec3 {
  let x = point[0] - origin[0];
  let y = point[1] - origin[1];
  let z = point[2] - origin[2];
  const [rx, ry, rz] = rotation.map((value) => value * DEG) as Vec3;

  let cosine = Math.cos(rx); let sine = Math.sin(rx);
  [y, z] = [y * cosine - z * sine, y * sine + z * cosine];
  cosine = Math.cos(ry); sine = Math.sin(ry);
  [x, z] = [x * cosine + z * sine, -x * sine + z * cosine];
  cosine = Math.cos(rz); sine = Math.sin(rz);
  [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
  return [x + origin[0], y + origin[1], z + origin[2]];
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function groupChain(element: OutlinerNodeLike): Group[] {
  const result: Group[] = [];
  let parent = element.parent;
  while (parent && parent !== "root") {
    if (parent instanceof Group) result.push(parent);
    parent = parent.parent;
  }
  return result;
}

function animationOffsets(animation: Animation, group: Group): { position: Vec3; rotation: Vec3 } {
  const animator = animation.getBoneAnimator(group);
  if (!animator) return { position: [0, 0, 0], rotation: [0, 0, 0] };
  const multiplier = animation.blend_weight
    ? Math.max(Animator.MolangParser.parse(animation.blend_weight), 0)
    : 1;
  const position = animator.channels.position ? animator.interpolate("position") : null;
  const rotation = animator.channels.rotation ? animator.interpolate("rotation") : null;
  return {
    position: vector(position instanceof Array ? position.map((value) => value * multiplier) : undefined),
    rotation: vector(rotation instanceof Array ? rotation.map((value) => value * multiplier) : undefined),
  };
}

function transformedCorners(element: OutlinerNodeLike, animation: Animation): Vec3[] {
  const from = vector(element.from);
  const to = vector(element.to);
  const inflate = element.inflate ?? 0;
  const lows: Vec3 = [from[0] - inflate, from[1] - inflate, from[2] - inflate];
  const highs: Vec3 = [to[0] + inflate, to[1] + inflate, to[2] + inflate];
  const elementOrigin = vector(element.origin, from);
  const elementRotation = vector(element.rotation);
  const groups = groupChain(element);
  const offsets = new Map(groups.map((group) => [group.uuid, animationOffsets(animation, group)]));
  const corners: Vec3[] = [];
  for (const x of [lows[0], highs[0]]) for (const y of [lows[1], highs[1]]) for (const z of [lows[2], highs[2]]) {
    let point = rotateZYX([x, y, z], elementRotation, elementOrigin);
    for (const group of groups) {
      const offset = offsets.get(group.uuid)!;
      point = rotateZYX(point, add(vector(group.rotation), offset.rotation), vector(group.origin));
      point = add(point, offset.position);
    }
    corners.push(point);
  }
  return corners;
}

function collectFrameHits(frame: number, animation: Animation): OutOfBoundsHit[] {
  const hits: OutOfBoundsHit[] = [];
  for (let index = 0; index < Outliner.elements.length; index++) {
    const element = Outliner.elements[index];
    if (!element.from || !element.to || element.export === false) continue;
    const corners = transformedCorners(element, animation);
    const chain = groupChain(element).map((group) => group.uuid);
    for (let axis = 0; axis < 3; axis++) {
      const values = corners.map((corner) => corner[axis]);
      const low = Math.min(...values);
      const high = Math.max(...values);
      if (low < MIN) hits.push({
        frame, elementIndex: index, elementName: element.name, axis: (["x", "y", "z"] as const)[axis],
        field: "from", value: low, sourceElementUuid: element.uuid, sourceGroupUuids: chain,
      });
      if (high > MAX) hits.push({
        frame, elementIndex: index, elementName: element.name, axis: (["x", "y", "z"] as const)[axis],
        field: "to", value: high, sourceElementUuid: element.uuid, sourceGroupUuids: chain,
      });
    }
  }
  return hits;
}

export async function runQuickBoundsScan(
  animations: Animation[],
  control: BoundsTaskControl
): Promise<BoundsDetectionRecord[]> {
  const originalTime = Timeline.time;
  const originalMode = Modes.selected.id;
  const originalAnimationUuid = Animation.selected?.uuid;
  const originalPlaying = Animation.all.map((animation) => ({ uuid: animation.uuid, playing: animation.playing }));
  const originalSaved = Project?.saved;
  const fps = getProjectAnimationFps();
  const modelFingerprint = modelBoundsFingerprint();
  const totalFrames = animations.reduce((sum, animation) => sum + frameCountFor(animation.length, fps), 0);
  let completedFrames = 0;
  const records: BoundsDetectionRecord[] = [];

  try {
    Modes.options.animate?.select();
    for (const state of originalPlaying) {
      const current = Animation.all.find((item) => item.uuid === state.uuid);
      if (current) current.playing = false;
    }
    for (const requested of animations) {
      const animation = Animation.all.find((item) => item.uuid === requested.uuid);
      if (!animation) continue;
      animation.select();
      animation.playing = true;
      const frames = frameCountFor(animation.length, fps);
      const hits: OutOfBoundsHit[] = [];
      for (let frame = 0; frame < frames; frame++) {
        assertBoundsTaskActive(control);
        Timeline.setTime(frame / fps);
        hits.push(...collectFrameHits(frame, animation));
        completedFrames++;
        control.onProgress?.({
          mode: "quick", animationUuid: animation.uuid, animationName: animation.name,
          animationFrame: frame + 1, animationFrames: frames, completedFrames, totalFrames,
        });
        if (frame % 5 === 0) await yieldBoundsTask();
      }
      animation.playing = false;
      records.push({
        mode: "quick", animationUuid: animation.uuid, animationName: animation.name,
        fingerprint: animationBoundsFingerprint(animation, modelFingerprint), frames, hits, checkedAt: Date.now(), fps,
      });
    }
    return records;
  } finally {
    for (const item of Animation.all) item.selected = false;
    Animation.selected = originalAnimationUuid
      ? Animation.all.find((item) => item.uuid === originalAnimationUuid) ?? null
      : null;
    if (Animation.selected) Animation.selected.selected = true;
    for (const state of originalPlaying) {
      const current = Animation.all.find((item) => item.uuid === state.uuid);
      if (current) current.playing = state.playing;
    }
    Modes.options[originalMode]?.select();
    Timeline.setTime(originalTime);
    Animator.preview();
    if (Project && originalSaved !== undefined) Project.saved = originalSaved;
  }
}
