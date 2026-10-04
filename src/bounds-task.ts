/** Shared asynchronous progress and cancellation protocol for bounds checks. */

export interface BoundsProgress {
  mode: "quick" | "exact";
  animationUuid: string;
  animationName: string;
  animationFrame: number;
  animationFrames: number;
  completedFrames: number;
  totalFrames: number;
}

export interface BoundsTaskControl {
  isCancelled(): boolean;
  onProgress?(progress: BoundsProgress): void;
}

export class BoundsTaskCancelledError extends Error {
  constructor() {
    super("Bounds check cancelled");
    this.name = "BoundsTaskCancelledError";
  }
}

export function assertBoundsTaskActive(control: BoundsTaskControl): void {
  if (control.isCancelled()) throw new BoundsTaskCancelledError();
}

/** Yield between frames so Blockbench can update progress and cancellation controls. */
export function yieldBoundsTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
