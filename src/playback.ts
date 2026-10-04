import { getDisplayAnimationEnabled } from "./display-animation-settings";
import { getProjectAnimationFps, setProjectAnimationFps } from "./export-animation-settings";
import { tr } from "./i18n";

/** Bridges the plugin controls to Blockbench's official animation timeline and playback state. */

export type TickCallback = (currentTime: number, length: number, playing: boolean) => void;

let lowFpsPreview = false;
let previewLooping = false;
let onTick: TickCallback = () => {};
let listenersRegistered = false;
let quantizedPreviewInProgress = false;
let previewPlaybackTimer: number | null = null;
let playbackIntent = false;
let pauseResolutionToken = 0;
let lastPlaybackTime = 0;
let lastPlaybackAnimationUuid = "";
let originalLoopToggleValue: boolean | null = null;

function firstMinecraftFrameTime(animation: Animation): number {
  return Math.min(1 / getProjectAnimationFps(), animation.length);
}

function getAnimation(): Animation | null {
  return Animation.selected ?? Animation.all[0] ?? null;
}

function quantize(time: number): number {
  if (!lowFpsPreview) return time;
  const step = 1 / getProjectAnimationFps();
  if (!step || step <= 0) return time;
  const epsilon = step * 1e-7;
  return Math.floor((time + epsilon) / step) * step;
}

function report(time = Timeline.time): void {
  const animation = getAnimation();
  if (!animation) return;
  onTick(Math.min(quantize(time), animation.length), animation.length, Timeline.playing);
}

/**
 * Outside animation mode, Blockbench sets the official playback state but does not continuously
 * schedule Timeline.loop(). A short mutually exclusive timer calls the official loop only in
 * those modes, avoiding a second animation clock.
 */
function usesPreviewPlaybackDriver(): boolean {
  return ["edit", "paint", "display"].includes(Modes.selected.id);
}

export function isCurrentDisplayAnimationEnabled(): boolean {
  return getDisplayAnimationEnabled(DisplayMode.display_slot);
}

function previewPlaybackAllowed(): boolean {
  return (
    Modes.selected.id !== "display" || isCurrentDisplayAnimationEnabled()
  );
}

function renderAtTimePreservingClock(time: number): void {
  const rawTime = Timeline.time;
  quantizedPreviewInProgress = true;
  try {
    Timeline.time = time;
    Animator.preview(true);
  } finally {
    Timeline.time = rawTime;
    quantizedPreviewInProgress = false;
  }
}

function stopPreviewPlaybackDriver(): void {
  if (previewPlaybackTimer !== null) {
    clearInterval(previewPlaybackTimer);
    previewPlaybackTimer = null;
  }
}

function drivePreviewPlayback(): void {
  if (
    !Timeline.playing ||
    !usesPreviewPlaybackDriver()
  ) {
    stopPreviewPlaybackDriver();
    return;
  }
  Timeline.loop();
}

function syncPreviewPlaybackDriver(): void {
  if (
    Timeline.playing &&
    usesPreviewPlaybackDriver()
  ) {
    if (previewPlaybackTimer === null) {
      previewPlaybackTimer = setInterval(drivePreviewPlayback, 16);
    }
  } else {
    stopPreviewPlaybackDriver();
  }
}

/**
 * Keeps the official clock running across display contexts. Disabled contexts render frame 0
 * without changing the clock, so returning to an enabled context continues uninterrupted.
 */
export function enforceCurrentDisplayAnimationPolicy(): void {
  if (Modes.selected.id !== "display" || isCurrentDisplayAnimationEnabled()) {
    if (Modes.selected.id === "display") Animator.preview();
    syncPreviewPlaybackDriver();
    report();
    return;
  }
  renderAtTimePreservingClock(0);
  syncPreviewPlaybackDriver();
  report();
}

/**
 * Re-renders at the snapped time after Blockbench's interpolated frame, then restores the
 * official clock so playback speed and looping remain correct.
 */
function handleDisplayFrame(): void {
  if (quantizedPreviewInProgress) return;
  const animation = getAnimation();
  if (!animation) return;

  const rawTime = Timeline.time;
  const animationChanged = lastPlaybackAnimationUuid !== animation.uuid;
  if (animationChanged) {
    lastPlaybackAnimationUuid = animation.uuid;
    lastPlaybackTime = rawTime;
  } else if (playbackIntent && rawTime + 1e-7 < lastPlaybackTime) {
    if (!previewLooping) {
      playbackIntent = false;
      Timeline.pause();
      Timeline.setTime(animation.length);
      Animator.preview();
      lastPlaybackTime = animation.length;
      onTick(animation.length, animation.length, false);
      return;
    }
    const restartTime = firstMinecraftFrameTime(animation);
    Timeline.setTime(restartTime);
    lastPlaybackTime = restartTime;
    Animator.preview();
    onTick(restartTime, animation.length, true);
    return;
  }
  lastPlaybackTime = rawTime;
  if (Modes.selected.id === "display" && !isCurrentDisplayAnimationEnabled()) {
    renderAtTimePreservingClock(0);
    report(rawTime);
    return;
  }
  const displayTime = Math.min(quantize(rawTime), animation.length);
  if (
    lowFpsPreview &&
    Timeline.playing &&
    Math.abs(displayTime - rawTime) > 1e-8
  ) {
    renderAtTimePreservingClock(displayTime);
  }
  onTick(displayTime, animation.length, Timeline.playing);
}

function handleTimelinePlay(): void {
  if (!previewPlaybackAllowed()) {
    Timeline.pause();
    Blockbench.showQuickMessage(
      tr("dap.panel.play_disabled"),
      2200
    );
    return;
  }
  const animation = getAnimation();
  if (
    animation &&
    !previewLooping &&
    Timeline.time >= animation.length - 1e-7
  ) {
    const restartTime = firstMinecraftFrameTime(animation);
    Timeline.setTime(restartTime);
    lastPlaybackAnimationUuid = animation.uuid;
    lastPlaybackTime = restartTime;
    Animator.preview();
  }
  playbackIntent = true;
  pauseResolutionToken++;
  syncPreviewPlaybackDriver();
  report();
}

function handleTimelinePause(): void {
  stopPreviewPlaybackDriver();
  const token = ++pauseResolutionToken;
  const pausedMode = Modes.selected.id;
  const shouldResumeAcrossModeChange = playbackIntent && pausedMode === "animate";
  setTimeout(() => {
    if (token !== pauseResolutionToken) return;
    if (shouldResumeAcrossModeChange && Modes.selected.id === "display") {
      Timeline.start();
      return;
    }
    playbackIntent = false;
    if (lowFpsPreview) {
      const animation = getAnimation();
      if (animation && Timeline.time >= animation.length - 1e-7) {
        const displayTime = Math.min(quantize(animation.length), animation.length);
        renderAtTimePreservingClock(displayTime);
        onTick(displayTime, animation.length, false);
      } else {
        seekTo(Timeline.time);
      }
    } else report();
  }, 0);
}

function handleAnimationSelect(): void {
  const animation = getAnimation();
  lastPlaybackAnimationUuid = animation?.uuid ?? "";
  lastPlaybackTime = Timeline.time;
  report();
}

function handleModeSelect(): void {
  enforceCurrentDisplayAnimationPolicy();
}

export function initializePlaybackSync(): void {
  if (listenersRegistered) return;
  Blockbench.on("display_animation_frame", handleDisplayFrame);
  Blockbench.on("timeline_play", handleTimelinePlay);
  Blockbench.on("timeline_pause", handleTimelinePause);
  Blockbench.on("select_mode", handleModeSelect);
  Blockbench.on("select_animation", handleAnimationSelect);
  listenersRegistered = true;
  previewLooping = false;
  // Reset the official loop toggle for a clean start, but remember the user's
  // value so unloading the plugin restores it.
  originalLoopToggleValue = BarItems.looped_animation_playback.value;
  BarItems.looped_animation_playback.set(false);
  syncPreviewPlaybackDriver();
}

export function disposePlaybackSync(): void {
  if (!listenersRegistered) return;
  Blockbench.removeListener("display_animation_frame", handleDisplayFrame);
  Blockbench.removeListener("timeline_play", handleTimelinePlay);
  Blockbench.removeListener("timeline_pause", handleTimelinePause);
  Blockbench.removeListener("select_mode", handleModeSelect);
  Blockbench.removeListener("select_animation", handleAnimationSelect);
  stopPreviewPlaybackDriver();
  listenersRegistered = false;
  onTick = () => {};
  if (originalLoopToggleValue !== null) {
    BarItems.looped_animation_playback.set(originalLoopToggleValue);
    originalLoopToggleValue = null;
  }
}

export function isPlaying(): boolean {
  return Timeline.playing;
}

export function isLooping(): boolean {
  return previewLooping;
}

export function setLooping(value: boolean): void {
  previewLooping = value;
  BarItems.looped_animation_playback.set(value);
}

export function isLowFpsPreview(): boolean {
  return lowFpsPreview;
}

export function setLowFpsPreview(value: boolean): void {
  lowFpsPreview = value;
  if (Timeline.playing) {
    handleDisplayFrame();
  } else {
    seekTo(Timeline.time);
  }
}

export function getPreviewFps(): number {
  return getProjectAnimationFps();
}

export function setPreviewFps(value: number): number {
  const previewFps = setProjectAnimationFps(value);
  if (lowFpsPreview) {
    if (Timeline.playing) handleDisplayFrame();
    else seekTo(Timeline.time);
  }
  return previewFps;
}

export function getCurrentTime(): number {
  return Timeline.time;
}

export function setTickCallback(cb: TickCallback): void {
  onTick = cb;
  report();
}

export function seekTo(time: number): void {
  const animation = getAnimation();
  if (!animation) return;
  const clamped = Math.min(Math.max(time, 0), animation.length);
  const displayTime = quantize(clamped);
  Timeline.setTime(displayTime);
  Animator.preview();
  onTick(displayTime, animation.length, Timeline.playing);
}

/** Selects one animation and redraws its first moving Minecraft frame immediately. */
export function selectPreviewAnimation(uuid: string): Animation | null {
  const animation = Animation.all.find((item) => item.uuid === uuid) ?? null;
  if (!animation) return null;
  animation.select();
  const startTime = firstMinecraftFrameTime(animation);
  lastPlaybackAnimationUuid = animation.uuid;
  lastPlaybackTime = startTime;
  Timeline.setTime(startTime);
  if (Modes.selected.id === "display" && !isCurrentDisplayAnimationEnabled()) {
    renderAtTimePreservingClock(0);
  } else {
    Animator.preview();
  }
  syncPreviewPlaybackDriver();
  onTick(startTime, animation.length, Timeline.playing);
  return animation;
}

export function togglePlay(): void {
  if (!getAnimation()) return;
  if (
    Modes.selected.id === "display" &&
    !isCurrentDisplayAnimationEnabled()
  ) {
    Blockbench.showQuickMessage(
      tr("dap.panel.play_disabled"),
      2200
    );
    return;
  }
  if (Timeline.playing) {
    Timeline.pause();
  } else {
    Timeline.start();
  }
}

export function stop(): void {
  if (Timeline.playing) Timeline.pause();
}

/** Selects the current or first available animation and shows its first moving Minecraft frame. */
export function selectAnimationAndReset(): Animation | null {
  const animation = getAnimation();
  if (animation) {
    stop();
    animation.select();
    seekTo(firstMinecraftFrameTime(animation));
  }
  return animation;
}
