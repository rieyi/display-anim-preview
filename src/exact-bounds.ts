/** Run authoritative Java codec bounds checks in a disposable Blockbench project. */

import { animationBoundsFingerprint, modelBoundsFingerprint, type BoundsDetectionRecord } from "./bounds-cache";
import { type BoundsTaskControl } from "./bounds-task";
import { bakeFramesAsync, frameCountFor, type BakedAnimationSequence } from "./bake";
import { withIsolatedProject } from "./isolated-project";

export interface ExactBoundsScanResult {
  records: BoundsDetectionRecord[];
  sequences: BakedAnimationSequence[];
}

export async function runExactBoundsScan(
  sourceAnimations: Animation[],
  control: BoundsTaskControl,
  keysByUuid: ReadonlyMap<string, string> = new Map(),
  framesByUuid: ReadonlyMap<string, number> = new Map(),
  samplingFps = 20,
  collectBounds = true,
  captureHands = false
): Promise<ExactBoundsScanResult> {
  const modelFingerprint = modelBoundsFingerprint();
  const requested = sourceAnimations.map((animation) => ({
    uuid: animation.uuid,
    name: animation.name,
    frames: framesByUuid.get(animation.uuid) ?? frameCountFor(animation.length, samplingFps),
    fingerprint: animationBoundsFingerprint(animation, modelFingerprint),
  }));
  const totalFrames = requested.reduce((sum, animation) => sum + animation.frames, 0);
  let completedFrames = 0;

  return withIsolatedProject(async () => {
    const records: BoundsDetectionRecord[] = [];
    const sequences: BakedAnimationSequence[] = [];
    for (const item of requested) {
      const animation = Animation.all.find((candidate) => candidate.uuid === item.uuid);
      if (!animation) throw new Error(`Animation "${item.name}" is missing from the isolated project.`);
      const result = await bakeFramesAsync(animation, item.frames, samplingFps, control, (frame, frames) => {
        completedFrames++;
        control.onProgress?.({
          mode: "exact",
          animationUuid: item.uuid,
          animationName: item.name,
          animationFrame: frame,
          animationFrames: frames,
          completedFrames,
          totalFrames,
        });
      }, undefined, collectBounds, captureHands);
      records.push({
        mode: "exact",
        animationUuid: item.uuid,
        animationName: item.name,
        fingerprint: item.fingerprint,
        frames: result.frames.length,
        hits: result.outOfBounds,
        checkedAt: Date.now(),
        fps: samplingFps,
      });
      sequences.push({
        sourceUuid: item.uuid,
        sourceName: item.name,
        key: keysByUuid.get(item.uuid) ?? item.name,
        frames: result.frames,
        outOfBounds: result.outOfBounds,
      });
    }
    return { records, sequences };
  });
}
