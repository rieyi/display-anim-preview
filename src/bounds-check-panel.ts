/** Dockable quick/exact bounds inspector with caching, progress, and cancellation. */

import { rememberBoundsDetection, validBoundsDetection, modelBoundsFingerprint, type BoundsCheckMode, type BoundsDetectionRecord } from "./bounds-cache";
import { summarizeOutOfBoundsByFrame } from "./bounds-report";
import { BoundsTaskCancelledError, type BoundsProgress, type BoundsTaskControl } from "./bounds-task";
import type { OutOfBoundsHit } from "./bake";
import { runExactBoundsScan, type ExactBoundsScanResult } from "./exact-bounds";
import { tr } from "./i18n";
import { runQuickBoundsScan } from "./math-bounds";
import { waitForUndoIdle } from "./undo-idle";
import { getProjectAnimationFps } from "./export-animation-settings";
import { el, escapeHtml } from "./ui-dom";

let panel: Panel | null = null;
let content: HTMLElementLike | null = null;
let checkedMode: BoundsCheckMode = "quick";
let boundsCheckBusy = false;
let recheckButton: HTMLElementLike | null = null;
let activeCancellation: { cancelled: boolean } | null = null;
let progressModeLabelOverride: string | null = null;
let exportBakeOnly = false;

interface AnimationCheckResult {
  animation: Animation;
  frames: number;
  hits: OutOfBoundsHit[];
  mode: BoundsCheckMode;
  cached: boolean;
}

interface BoundsSourceState {
  project: ModelProjectInstance;
  mode: string;
  timelineTime: number;
  animationUuid: string | null;
  playing: Array<{ uuid: string; playing: false | true | "locked" }>;
  saved: boolean;
}

function captureBoundsSourceState(): BoundsSourceState {
  if (!Project) throw new Error("No active Blockbench project.");
  return {
    project: Project as unknown as ModelProjectInstance,
    mode: Modes.selected.id,
    timelineTime: Timeline.time,
    animationUuid: Animation.selected?.uuid ?? null,
    playing: Animation.all.map((animation) => ({ uuid: animation.uuid, playing: animation.playing })),
    saved: Project.saved,
  };
}

function restoreBoundsSourceState(state: BoundsSourceState, restoreMode: boolean): void {
  if ((Project as unknown as ModelProjectInstance | null) !== state.project && ModelProject.all.includes(state.project)) {
    state.project.select();
  }
  if (!Project) throw new Error("Blockbench did not restore the source project after range checking.");
  if (restoreMode) Modes.options[state.mode]?.select();
  for (const animation of Animation.all) animation.selected = false;
  Animation.selected = state.animationUuid
    ? Animation.all.find((animation) => animation.uuid === state.animationUuid) ?? null
    : null;
  if (Animation.selected) Animation.selected.selected = true;
  for (const item of state.playing) {
    const animation = Animation.all.find((candidate) => candidate.uuid === item.uuid);
    if (animation) animation.playing = item.playing;
  }
  Timeline.setTime(state.timelineTime);
  Animator.preview();
  Project.saved = state.saved;
}

function modeLabel(mode: BoundsCheckMode): string {
  return tr(mode === "quick" ? "dap.bounds.mode.quick" : "dap.bounds.mode.exact");
}

function highlightProblemElements(hits: OutOfBoundsHit[]): void {
  const uuids = new Set(hits.map((hit) => hit.sourceElementUuid).filter(Boolean));
  const elements = Outliner.elements.filter((element) => uuids.has(element.uuid));
  if (!elements.length) return;
  unselectAllElements();
  for (const element of elements) {
    element.selected = true;
    Outliner.selected.push(element);
  }
  updateSelection();
}

function openNearestKeyframe(animation: Animation, hits: OutOfBoundsHit[], time: number): void {
  const groupUuids = [...new Set(hits.flatMap((hit) => hit.sourceGroupUuids ?? []))];
  for (const groupUuid of groupUuids) {
    const animator = animation.animators?.[groupUuid];
    if (!animator) continue;
    const nearest = [...(animator.keyframes ?? [])].sort((left, right) => {
      const distance = Math.abs(left.time - time) - Math.abs(right.time - time);
      if (Math.abs(distance) > 0.000001) return distance;
      if (left.channel === right.channel) return 0;
      return left.channel === "position" ? -1 : 1;
    })[0];
    if (!nearest) continue;
    animator.select();
    nearest.select();
    return;
  }
}

function locateFrame(animation: Animation, frame: number, hits: OutOfBoundsHit[]): void {
  Timeline.pause();
  animation.select();
  const time = frame / getProjectAnimationFps();
  Timeline.setTime(time);
  Animator.preview();
  highlightProblemElements(hits);
  openNearestKeyframe(animation, hits, time);
  Blockbench.showQuickMessage(tr("dap.bounds.located", { animation: animation.name, frame }), 2200);
}

function passedMessage(animations: number, frames: number, mode: BoundsCheckMode): void {
  Blockbench.showMessageBox({
    title: tr("dap.bounds.passed_title"),
    message: `<div style="margin-bottom:14px">` +
      `<div style="font-size:17px;font-weight:700;color:#59c36a">${escapeHtml(tr("dap.bounds.passed_heading"))}</div>` +
      `<div style="margin-top:3px">${escapeHtml(tr("dap.bounds.passed_message", { frames, fps: getProjectAnimationFps() }))}</div></div>` +
      `<div style="padding:9px 11px;border-left:3px solid #59c36a;background:var(--color-back)">` +
      `${escapeHtml(modeLabel(mode))} · ${escapeHtml(tr("dap.bounds.passed_animations", { animations }))}</div>`,
    icon: "check_circle",
  });
}

interface ProgressView {
  shell: HTMLElementLike;
  title: HTMLElementLike;
  detail: HTMLElementLike;
  bar: HTMLElementLike;
}

let progressView: ProgressView | null = null;

function renderProgress(progress?: BoundsProgress): void {
  if (!content) return;
  // Rebuild the progress DOM only when it is missing or was cleared by a
  // results render; per-frame updates only touch text nodes and the bar width.
  if (!progressView || progressView.shell.parentElement !== content) {
    content.innerHTML = "";
    progressView = buildProgressView();
    content.appendChild(progressView.shell);
  }
  const view = progressView;
  view.title.innerText = progress
    ? tr("dap.bounds.progress_title", { mode: progressModeLabelOverride ?? modeLabel(progress.mode), animation: progress.animationName })
    : tr("dap.bounds.progress_preparing");
  view.detail.innerText = progress ? tr("dap.bounds.progress_frames", {
    frame: progress.animationFrame, frames: progress.animationFrames,
    completed: progress.completedFrames, total: progress.totalFrames,
  }) : "";
  view.bar.style.width = progress && progress.totalFrames
    ? `${Math.min(100, progress.completedFrames / progress.totalFrames * 100).toFixed(1)}%` : "0%";
}

function buildProgressView(): ProgressView {
  const shell = el("div");
  shell.style.padding = "14px 10px";
  const title = el("div");
  title.style.fontWeight = "700";
  const detail = el("div", "");
  detail.style.marginTop = "7px";
  detail.style.color = "var(--color-subtle_text)";
  const track = el("div");
  track.style.height = "8px";
  track.style.marginTop = "12px";
  track.style.background = "var(--color-back)";
  const bar = el("div");
  bar.style.height = "100%";
  bar.style.width = "0%";
  bar.style.background = "var(--color-accent)";
  track.appendChild(bar);
  const cancel = el("button", tr("dap.bounds.cancel"));
  cancel.style.width = "100%";
  cancel.style.marginTop = "14px";
  cancel.style.borderRadius = "0";
  cancel.onclick = () => {
    if (activeCancellation) activeCancellation.cancelled = true;
    cancel.innerText = tr("dap.bounds.cancelling");
    (cancel as unknown as { disabled: boolean }).disabled = true;
  };
  shell.appendChild(title);
  shell.appendChild(detail);
  shell.appendChild(track);
  shell.appendChild(cancel);
  return { shell, title, detail, bar };
}

function renderExportBakeComplete(animations: number, frames: number): void {
  if (!content) return;
  content.innerHTML = "";
  progressView = null;
  const shell = el("div");
  shell.style.padding = "14px 10px";
  shell.style.borderLeft = "3px solid #59c36a";
  shell.style.background = "var(--color-back)";
  const title = el("div", tr("dap.bounds.export_bake_complete"));
  title.style.fontWeight = "700";
  title.style.color = "#59c36a";
  const detail = el("div", tr("dap.bounds.export_bake_complete_detail", { animations, frames }));
  detail.style.marginTop = "7px";
  detail.style.color = "var(--color-subtle_text)";
  shell.appendChild(title);
  shell.appendChild(detail);
  content.appendChild(shell);
}

function renderResults(results: AnimationCheckResult[]): void {
  if (!content) return;
  content.innerHTML = "";
  progressView = null;
  const problemFrames = results.reduce((sum, result) => sum + new Set(result.hits.map((hit) => hit.frame)).size, 0);
  const mode = results[0]?.mode ?? checkedMode;
  const cachedCount = results.filter((result) => result.cached).length;
  const header = el("div");
  header.style.padding = "9px 10px";
  header.style.borderLeft = `3px solid ${problemFrames ? "#e25d68" : "#59c36a"}`;
  header.style.background = "var(--color-back)";
  const title = el("div", `${modeLabel(mode)} · ${tr("dap.bounds.panel_checked_animations", { animations: results.length })}`);
  title.style.fontWeight = "700";
  title.style.fontSize = "14px";
  const summary = el("div", problemFrames ? tr("dap.bounds.panel_failed", { frames: problemFrames }) : tr("dap.bounds.panel_all_passed"));
  summary.style.color = problemFrames ? "#e25d68" : "#59c36a";
  summary.style.marginTop = "3px";
  header.appendChild(title);
  header.appendChild(summary);
  if (cachedCount) {
    const reused = el("div", tr("dap.bounds.cache_reused", { animations: cachedCount }));
    reused.style.fontSize = "inherit";
    reused.style.marginTop = "3px";
    reused.style.color = "var(--color-subtle_text)";
    header.appendChild(reused);
  }
  content.appendChild(header);
  if (problemFrames) {
    const hint = el("div", tr("dap.bounds.panel_hint"));
    hint.style.color = "var(--color-subtle_text)";
    hint.style.fontSize = "inherit";
    hint.style.padding = "8px 2px 6px";
    content.appendChild(hint);
  }
  for (const result of results) {
    const animationHeader = el("div");
    animationHeader.style.display = "flex";
    animationHeader.style.justifyContent = "space-between";
    animationHeader.style.alignItems = "center";
    animationHeader.style.gap = "8px";
    animationHeader.style.padding = "8px 3px 5px";
    animationHeader.style.borderBottom = "1px solid var(--color-border)";
    const animationName = el("b", result.animation.name);
    const animationStatus = el("span", result.hits.length
      ? tr("dap.bounds.animation_failed", { frames: new Set(result.hits.map((hit) => hit.frame)).size })
      : tr("dap.bounds.animation_passed", { frames: result.frames }));
    animationStatus.style.color = result.hits.length ? "#e25d68" : "#59c36a";
    animationStatus.style.fontSize = "inherit";
    animationHeader.appendChild(animationName);
    animationHeader.appendChild(animationStatus);
    content.appendChild(animationHeader);
    for (const item of summarizeOutOfBoundsByFrame(result.hits)) {
      const row = el("div");
      row.style.display = "block";
      row.style.width = "100%";
      row.style.textAlign = "left";
      row.style.padding = "8px 9px";
      row.style.margin = "0 0 5px";
      row.style.borderRadius = "0";
      row.style.borderLeft = "3px solid #e25d68";
      row.style.background = "var(--color-back)";
      row.style.boxSizing = "border-box";
      row.style.cursor = "pointer";
      row.style.lineHeight = "1.35";
      row.style.minHeight = "58px";
      row.innerHTML = `<b style="color:#e25d68">${escapeHtml(tr("dap.export.locate_frame", { frame: item.frame }))}</b>` +
        `<div style="font-size:inherit;color:var(--color-subtle_text);margin-top:3px;white-space:normal">${escapeHtml(item.description)}</div>`;
      const frameHits = result.hits.filter((hit) => hit.frame === item.frame);
      row.onclick = () => locateFrame(result.animation, item.frame, frameHits);
      content.appendChild(row);
    }
  }
}

export function resolveBoundsCheckAnimations(preferredAnimations?: Animation[]): Animation[] {
  const source = preferredAnimations?.length ? preferredAnimations : Animation.all;
  const seen = new Set<string>();
  return source.filter((animation) => {
    if (seen.has(animation.uuid)) return false;
    seen.add(animation.uuid);
    return true;
  });
}

function setBoundsCheckBusy(busy: boolean): void {
  boundsCheckBusy = busy;
  if (recheckButton) (recheckButton as unknown as { disabled: boolean }).disabled = busy;
  if (!busy) {
    Blockbench.setProgress(0);
    Blockbench.setStatusBarText();
  }
}

function recordsToResults(animations: Animation[], records: BoundsDetectionRecord[], mode: BoundsCheckMode, cached: Set<string>): AnimationCheckResult[] {
  return animations.map((animation) => {
    const record = records.find((candidate) => candidate.animationUuid === animation.uuid);
    if (!record) throw new Error(`No ${mode} range result was produced for "${animation.name}".`);
    return { animation, frames: record.frames, hits: record.hits, mode, cached: cached.has(animation.uuid) };
  });
}

/** Shared per-scan progress renderer for quick and exact scans. */
function createBoundsProgressControl(): BoundsTaskControl {
  return {
    isCancelled: () => activeCancellation?.cancelled === true,
    onProgress: (progress) => {
      renderProgress(progress);
      Blockbench.setProgress(progress.totalFrames ? progress.completedFrames / progress.totalFrames : 0);
      Blockbench.setStatusBarText(tr("dap.bounds.progress_status", {
        mode: progressModeLabelOverride ?? modeLabel(progress.mode), animation: progress.animationName,
        frame: progress.animationFrame, frames: progress.animationFrames,
      }));
    },
  };
}

async function performBoundsCheck(
  animationUuids: string[], mode: BoundsCheckMode, project: object, sourceState: BoundsSourceState
): Promise<void> {
  try {
  const animations = animationUuids.map((uuid) => Animation.all.find((animation) => animation.uuid === uuid))
    .filter((animation): animation is Animation => Boolean(animation));
  if (!animations.length) {
    Blockbench.showQuickMessage(tr("dap.bounds.no_animation"), 2000);
    return;
  }
  checkedMode = mode;
  openBoundsCheckPanel();
  // One fingerprint covers every animation; per-animation calls would each
  // rescan the whole model.
  const modelFingerprint = modelBoundsFingerprint();
  const cached = new Map<string, BoundsDetectionRecord>();
  for (const animation of animations) {
    const record = validBoundsDetection(project, animation, mode, modelFingerprint);
    if (record) cached.set(animation.uuid, record);
  }
  const pending = animations.filter((animation) => !cached.has(animation.uuid));
  if (!pending.length) {
    renderResults(recordsToResults(animations, [...cached.values()], mode, new Set(cached.keys())));
    Blockbench.showQuickMessage(tr("dap.bounds.cache_all_reused"), 2200);
    return;
  }
  activeCancellation = { cancelled: false };
  renderProgress();
  const control = createBoundsProgressControl();
  const scanned = mode === "quick"
    ? await runQuickBoundsScan(pending, control)
    : (await runExactBoundsScan(pending, control)).records;
  for (const record of scanned) rememberBoundsDetection(project, record);
  const results = recordsToResults(animations, [...cached.values(), ...scanned], mode, new Set(cached.keys()));
  renderResults(results);
  if (results.every((result) => !result.hits.length)) {
    passedMessage(animations.length, results.reduce((sum, result) => sum + result.frames, 0), mode);
  }
  } finally {
    // Keep results visible in Animate mode while restoring selection, playback, and time.
    restoreBoundsSourceState(sourceState, false);
  }
}

function chooseBoundsMode(animations: Animation[]): void {
  Blockbench.showMessageBox({
    title: tr("dap.bounds.choose_title"),
    message: tr("dap.bounds.choose_message"),
    icon: "settings_overscan",
    buttons: [tr("dap.bounds.choose_cancel"), tr("dap.bounds.mode.quick"), tr("dap.bounds.mode.exact")],
    confirmIndex: 2,
    cancelIndex: 0,
  }, (button) => {
    if (button === 1) runBoundsCheck(animations, "quick");
    if (button === 2) runBoundsCheck(animations, "exact");
  });
}

export function runBoundsCheck(preferredAnimations?: Animation[], mode?: BoundsCheckMode): void {
  const animations = resolveBoundsCheckAnimations(preferredAnimations);
  if (!animations.length) {
    Blockbench.showQuickMessage(tr("dap.bounds.no_animation"), 2000);
    return;
  }
  if (!mode) {
    chooseBoundsMode(animations);
    return;
  }
  if (boundsCheckBusy) {
    Blockbench.showQuickMessage(tr("dap.bounds.check_in_progress"), 1800);
    return;
  }
  setBoundsCheckBusy(true);
  const sourceState = captureBoundsSourceState();
  const animationUuids = animations.map((animation) => animation.uuid);
  const project = Project as unknown as object;
  const projectUuid = Project?.uuid;
  document.activeElement?.blur();
  void waitForUndoIdle().then(async (idle) => {
    if (!idle || Project?.uuid !== projectUuid) {
      if (!idle) Blockbench.showMessageBox({
        title: tr("dap.bounds.edit_in_progress_title"), message: tr("dap.bounds.edit_in_progress_message"), icon: "error",
      });
      return;
    }
    await performBoundsCheck(animationUuids, mode, project, sourceState);
  }).catch((error) => {
    if (error instanceof BoundsTaskCancelledError) {
      Blockbench.showQuickMessage(tr("dap.bounds.cancelled"), 2200);
      return;
    }
    Blockbench.showMessageBox({
      title: tr("dap.bounds.check_failed_title"),
      message: escapeHtml(error instanceof Error ? error.message : String(error)),
      icon: "error",
    });
  }).finally(() => {
    activeCancellation = null;
    setBoundsCheckBusy(false);
  });
}

/** Bake resource models in an isolated project with cancellable exact progress. */
export async function runExactBoundsForExport(
  animations: Animation[],
  keysByUuid: ReadonlyMap<string, string>,
  framesByUuid: ReadonlyMap<string, number>,
  samplingFps: number,
  rememberResults: boolean,
  showResults: boolean,
  captureHands = false
): Promise<ExactBoundsScanResult | null> {
  if (boundsCheckBusy) throw new Error(tr("dap.bounds.check_in_progress"));
  const sourceProject = Project as unknown as object;
  const sourceState = captureBoundsSourceState();
  setBoundsCheckBusy(true);
  activeCancellation = { cancelled: false };
  progressModeLabelOverride = rememberResults || showResults ? null : tr("dap.bounds.mode.export_bake");
  const bakeOnly = !rememberResults && !showResults;
  exportBakeOnly = bakeOnly;
  try {
    openBoundsCheckPanel();
    checkedMode = "exact";
    renderProgress();
    const control = createBoundsProgressControl();
    const collectBounds = rememberResults || showResults;
    const result = await runExactBoundsScan(animations, control, keysByUuid, framesByUuid, samplingFps, collectBounds, captureHands);
    if (rememberResults) {
      for (const record of result.records) rememberBoundsDetection(sourceProject, record);
    }
    if (showResults) {
      const restoredAnimations = result.records.map((record) => Animation.all.find((animation) => animation.uuid === record.animationUuid))
        .filter((animation): animation is Animation => Boolean(animation));
      renderResults(recordsToResults(restoredAnimations, result.records, "exact", new Set()));
    } else if (bakeOnly) {
      renderExportBakeComplete(
        result.sequences.length,
        result.sequences.reduce((sum, sequence) => sum + sequence.frames.length, 0)
      );
    }
    return result;
  } catch (error) {
    if (error instanceof BoundsTaskCancelledError) {
      Blockbench.showQuickMessage(tr("dap.bounds.cancelled"), 2200);
      return null;
    }
    throw error;
  } finally {
    activeCancellation = null;
    progressModeLabelOverride = null;
    exportBakeOnly = false;
    if (recheckButton) recheckButton.style.display = bakeOnly ? "none" : "";
    setBoundsCheckBusy(false);
    restoreBoundsSourceState(sourceState, true);
  }
}

export function openBoundsCheckPanel(): void {
  Modes.options.animate?.select();
  if (panel) {
    if (recheckButton) recheckButton.style.display = exportBakeOnly ? "none" : "";
    panel.update();
    return;
  }
  const shell = el("div");
  shell.style.display = "flex";
  shell.style.flexDirection = "column";
  shell.style.height = "100%";
  shell.style.minHeight = "0";
  shell.style.minWidth = "0";
  const results = el("div");
  results.style.flex = "1 1 auto";
  results.style.minHeight = "0";
  results.style.overflowY = "auto";
  results.style.overflowX = "hidden";
  results.style.padding = "4px 6px 8px 4px";
  results.style.boxSizing = "border-box";
  content = results;
  const footer = el("div");
  footer.style.flex = "0 0 auto";
  footer.style.padding = "7px 6px 5px 4px";
  footer.style.borderTop = "1px solid var(--color-border)";
  footer.style.background = "var(--color-ui)";
  const recheck = el("button", tr("dap.bounds.recheck"));
  recheckButton = recheck;
  recheck.style.display = exportBakeOnly ? "none" : "";
  recheck.style.width = "100%";
  recheck.style.borderRadius = "0";
  recheck.onclick = () => {
    runBoundsCheck(undefined, checkedMode);
  };
  footer.appendChild(recheck);
  shell.appendChild(results);
  shell.appendChild(footer);
  panel = new Panel("display_anim_preview_bounds", {
    name: tr("dap.bounds.panel_title"), icon: "settings_overscan", growable: true, resizable: true,
    condition: { modes: ["animate"] }, default_position: { slot: "left_bar", height: 420, width: 350 },
  });
  panel.node.style.minHeight = "140px";
  panel.node.appendChild(shell);
}

export function disposeBoundsCheckPanel(): void {
  // Cancel any in-flight scan so its finally block stops instead of touching
  // global UI after the plugin has been unloaded.
  if (activeCancellation) activeCancellation.cancelled = true;
  activeCancellation = null;
  progressModeLabelOverride = null;
  progressView = null;
  exportBakeOnly = false;
  panel?.delete();
  panel = null;
  content = null;
  recheckButton = null;
  boundsCheckBusy = false;
}
