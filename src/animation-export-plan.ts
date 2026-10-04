/** Pure planning and validation for multi-animation exports. */

import { frameCountFor, isReservedAnimationKey } from "./export-layout";

export interface ExportAnimationSpec {
  animation: Animation;
  sourceUuid: string;
  sourceName: string;
  key: string;
  sourceFps: number;
  frameCount: number;
}

export interface AnimationKeyConflict {
  key: string;
  animationNames: string[];
}

/** Converts an animation name into one safe Minecraft string/path segment. */
export function animationKeyFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isValidAnimationKey(key: string): boolean {
  return (
    Boolean(key) &&
    key !== "." &&
    key !== ".." &&
    !isReservedAnimationKey(key) &&
    /^[a-z0-9_.-]+$/.test(key)
  );
}

export function findAnimationKeyConflicts(
  animations: Array<{ name: string }>
): AnimationKeyConflict[] {
  const groups = new Map<string, string[]>();
  for (const animation of animations) {
    const key = animationKeyFromName(animation.name);
    const names = groups.get(key) ?? [];
    names.push(animation.name);
    groups.set(key, names);
  }
  return [...groups.entries()]
    .filter(([key, names]) => !isValidAnimationKey(key) || names.length > 1)
    .map(([key, animationNames]) => ({ key, animationNames }));
}

export function createExportAnimationSpecs(
  animations: Animation[],
  fps: number
): ExportAnimationSpec[] {
  return animations.map((animation) => ({
    animation,
    sourceUuid: animation.uuid,
    sourceName: animation.name,
    key: animationKeyFromName(animation.name),
    sourceFps: animation.snapping || fps,
    frameCount: frameCountFor(animation.length, fps),
  }));
}
