/** Shared identifiers and safe path rules for generated JSB pack modules. */

export const EXPORT_NAMESPACE = "jsb";

/** Minecraft items cannot animate faster than the 20 TPS clock. */
export const MAX_EXPORT_FPS = 20;

/** Inclusive endpoint frame count for an animation length at a given FPS. */
export function frameCountFor(length: number, fps: number): number {
  return Math.floor(length * fps) + 1;
}

export const DISPLAY_CONTEXT_PATHS: Record<string, string> = {
  firstperson_righthand: "fp_r",
  firstperson_lefthand: "fp_l",
  thirdperson_righthand: "tp_r",
  thirdperson_lefthand: "tp_l",
  gui: "gui",
  ground: "ground",
  head: "head",
  fixed: "fixed",
  embedded: "embed",
  on_shelf: "shelf",
};

const SAFE_SEGMENT = /^[a-z0-9_.-]+$/;
const RUNTIME_NAME = /^[A-Za-z0-9._+\-]+$/;

/** Scoreboard objective names are limited to 16 characters. */
export function isValidObjectiveName(value: string): boolean {
  return value.length > 0 && value.length <= 16 && RUNTIME_NAME.test(value);
}

/** Entity tags use the same unquoted character set, without the objective-name length limit. */
export function isValidPlayingTag(value: string): boolean {
  return value.length > 0 && RUNTIME_NAME.test(value);
}

export function isSafeProjectName(value: string): boolean {
  return (
    Boolean(value) &&
    value !== "." &&
    value !== ".." &&
    value !== "_generated" &&
    SAFE_SEGMENT.test(value)
  );
}

export function sanitizeProjectName(value: string, fallback = "display_animation"): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return isSafeProjectName(sanitized) ? sanitized : fallback;
}

export function isReservedAnimationKey(value: string): boolean {
  return value === "_generated";
}

/** Stable short suffix used by default scoreboard and tag names. */
export function projectHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).slice(0, 6).padStart(6, "0");
}

/** Internal playback phase objective derived from the configured frame objective. */
export function phaseObjectiveFor(frameObjective: string): string {
  return `jsb_${projectHash(frameObjective)}_p`;
}

export function defaultRuntimeNames(projectName: string): {
  frameObjective: string;
  modeObjective: string;
  maxFrameObjective: string;
  playingTag: string;
} {
  const hash = projectHash(projectName);
  return {
    frameObjective: `jsb_${hash}_f`,
    modeObjective: `jsb_${hash}_m`,
    maxFrameObjective: `jsb_${hash}_x`,
    playingTag: `jsb_${hash}_playing`,
  };
}
