/** Per-project quick/exact bounds cache retained only for the current session. */

import type { OutOfBoundsHit } from "./bake";
import { getProjectAnimationFps } from "./export-animation-settings";

export type BoundsCheckMode = "quick" | "exact";

export interface BoundsDetectionRecord {
  mode: BoundsCheckMode;
  animationUuid: string;
  animationName: string;
  fingerprint: string;
  frames: number;
  hits: OutOfBoundsHit[];
  checkedAt: number;
  fps: number;
}

const projectCache = new WeakMap<object, Map<string, BoundsDetectionRecord>>();

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function nodeParentUuid(node: OutlinerNodeLike): string {
  return node.parent && node.parent !== "root" ? node.parent.uuid : "root";
}

export function modelBoundsFingerprint(): string {
  const elements = Outliner.elements.map((element) => ({
    uuid: element.uuid,
    type: (element.constructor as unknown as { name?: string })?.name ?? "element",
    parent: nodeParentUuid(element),
    from: element.from,
    to: element.to,
    origin: element.origin,
    rotation: element.rotation,
    inflate: element.inflate ?? 0,
    export: element.export !== false,
  })).sort((left, right) => left.uuid.localeCompare(right.uuid));
  const groups = Group.all.map((group) => ({
    uuid: group.uuid,
    parent: nodeParentUuid(group),
    children: group.children.map((child) => child.uuid),
    origin: group.origin,
    rotation: group.rotation,
    export: group.export !== false,
  })).sort((left, right) => left.uuid.localeCompare(right.uuid));
  return hash(stable({ format: Format.id, elements, groups }));
}

function keyframeSnapshot(keyframe: KeyframeInstance): Record<string, unknown> {
  const value = keyframe as unknown as Record<string, unknown>;
  const dataPoints = (keyframe.data_points ?? []).map((point) => Object.fromEntries(
    Object.entries(point as unknown as Record<string, unknown>)
      .filter(([key, item]) => key !== "keyframe" && (
        item === null || ["string", "number", "boolean"].includes(typeof item) ||
        (Array.isArray(item) && item.every((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry)))
      ))
  ));
  return {
    time: keyframe.time,
    channel: keyframe.channel,
    interpolation: keyframe.interpolation,
    // KeyframeDataPoint refers back to its keyframe; retain serializable user data only.
    data_points: dataPoints,
    easing: value.easing,
    easingArgs: value.easingArgs,
    bezier_left_time: keyframe.bezier_left_time,
    bezier_left_value: keyframe.bezier_left_value,
    bezier_right_time: keyframe.bezier_right_time,
    bezier_right_value: keyframe.bezier_right_value,
  };
}

export function animationBoundsFingerprint(animation: Animation, modelFingerprint = modelBoundsFingerprint()): string {
  const animators = Object.entries(animation.animators ?? {})
    .map(([uuid, animator]) => ({
      uuid,
      keyframes: (animator?.keyframes ?? []).map(keyframeSnapshot),
    }))
    .sort((left, right) => left.uuid.localeCompare(right.uuid));
  return hash(stable({
    modelFingerprint,
    uuid: animation.uuid,
    name: animation.name,
    length: animation.length,
    snapping: animation.snapping,
    blendWeight: animation.blend_weight ?? "",
    animators,
  }));
}

function cacheKey(mode: BoundsCheckMode, animationUuid: string): string {
  return `${mode}:${animationUuid}`;
}

export function rememberBoundsDetection(project: object, record: BoundsDetectionRecord): void {
  let records = projectCache.get(project);
  if (!records) {
    records = new Map();
    projectCache.set(project, records);
  }
  records.set(cacheKey(record.mode, record.animationUuid), record);
}

export function validBoundsDetection(
  project: object,
  animation: Animation,
  mode: BoundsCheckMode,
  modelFingerprint = modelBoundsFingerprint()
): BoundsDetectionRecord | null {
  const record = projectCache.get(project)?.get(cacheKey(mode, animation.uuid)) ?? null;
  if (!record) return null;
  return record.fps === getProjectAnimationFps() &&
    record.fingerprint === animationBoundsFingerprint(animation, modelFingerprint) ? record : null;
}

export function detectionStatus(
  project: object,
  animation: Animation,
  modelFingerprint = modelBoundsFingerprint()
): {
  quick: BoundsDetectionRecord | null;
  exact: BoundsDetectionRecord | null;
  stale: boolean;
} {
  const records = projectCache.get(project);
  const quickStored = records?.get(cacheKey("quick", animation.uuid)) ?? null;
  const exactStored = records?.get(cacheKey("exact", animation.uuid)) ?? null;
  const fingerprint = animationBoundsFingerprint(animation, modelFingerprint);
  const quick = quickStored?.fingerprint === fingerprint ? quickStored : null;
  const exact = exactStored?.fingerprint === fingerprint ? exactStored : null;
  return { quick, exact, stale: Boolean((quickStored || exactStored) && !quick && !exact) };
}

export function clearProjectBoundsCache(project: object): void {
  projectCache.delete(project);
}
