/** Two-step multi-animation export dialog and JSB pack integration orchestration. */

import { createExportAnimationSpecs, findAnimationKeyConflicts, type ExportAnimationSpec } from "./animation-export-plan";
import { describeOutOfBounds } from "./bounds-report";
import { runBoundsCheck, runExactBoundsForExport } from "./bounds-check-panel";
import { buildDatapack, type DatapackOptions } from "./datapack";
import { configuredDisplayAnimations } from "./display-animation-settings";
import {
  initialExportSettings,
  rememberExportSettingsDraft,
  rememberExportSettings,
  type ExportOutputMode,
  type ExportWriteMode,
  type StoredExportAnimationSettings,
} from "./export-animation-settings";
import { PREVIEW_TEXTURE_PROPERTY } from "./hand-rig";
import { EXPORT_NAMESPACE, isSafeProjectName, isValidObjectiveName, isValidPlayingTag, phaseObjectiveFor } from "./export-layout";
import { previewPacks, writePacks, type WriteTarget } from "./file-writer";
import { tr } from "./i18n";
import { buildResourcePack, type PackAnimationSequence, type PackBuildReport, type PackOptions } from "./resource-pack";

interface FormResult {
  pack_name: string;
  project_name: string;
  base_item: string;
  display_name: string;
  frame_objective: string;
  mode_objective: string;
  max_frame_objective: string;
  playing_tag: string;
  output_mode: ExportOutputMode;
  write_mode: ExportWriteMode;
  default_animation: string;
}

interface Destination {
  label: string;
  scopeRoot: string;
  targetRoot: string;
  kind: "resource" | "datapack";
  insert: boolean;
}

let exportInProgress = false;

function includesResource(mode: ExportOutputMode): boolean {
  return mode !== "datapack_only";
}

function includesDatapack(mode: ExportOutputMode): boolean {
  return mode !== "resource_only";
}

function normalizeItemId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "minecraft:potion";
  return trimmed.includes(":") ? trimmed : `minecraft:${trimmed}`;
}

function animationIdentity(spec: ExportAnimationSpec): string {
  return `${spec.sourceName} (${spec.key})`;
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]!));
}

function pickDirectory(resourceId: string, title: string): string | null {
  return Blockbench.pickDirectory({ resource_id: resourceId, title }) ?? null;
}

function chooseDestinations(
  outputMode: ExportOutputMode,
  writeMode: ExportWriteMode,
  packName: string,
  settings: StoredExportAnimationSettings
): Destination[] | null {
  if (writeMode === "insert") {
    if (outputMode === "both_default") {
      const root = settings.sharedRoot || pickDirectory("display_anim_insert_shared", tr("dap.export.pick_shared", { pack: packName }));
      if (!root) return null;
      return [
        { label: tr("dap.export.resource_pack"), scopeRoot: root, targetRoot: `${root}/resource-packs/${packName}`, kind: "resource", insert: true },
        { label: tr("dap.export.datapack"), scopeRoot: root, targetRoot: `${root}/datapacks/${packName}`, kind: "datapack", insert: true },
      ];
    }
    const destinations: Destination[] = [];
    if (includesResource(outputMode)) {
      const root = settings.resourcePackFolder || pickDirectory("display_anim_insert_resource", tr("dap.export.pick_existing_resource"));
      if (!root) return null;
      destinations.push({
        label: tr("dap.export.resource_pack"),
        scopeRoot: root,
        targetRoot: root,
        kind: "resource",
        insert: true,
      });
    }
    if (includesDatapack(outputMode)) {
      const root = settings.datapackFolder || pickDirectory("display_anim_insert_datapack", tr("dap.export.pick_existing_datapack"));
      if (!root) return null;
      destinations.push({
        label: tr("dap.export.datapack"),
        scopeRoot: root,
        targetRoot: root,
        kind: "datapack",
        insert: true,
      });
    }
    return destinations;
  }

  if (outputMode === "both_default") {
    const root = settings.sharedRoot || pickDirectory("display_anim_export", tr("dap.export.pick_shared", { pack: packName }));
    if (!root) return null;
    return [
      { label: tr("dap.export.resource_pack"), scopeRoot: root, targetRoot: `${root}/resource-packs/${packName}`, kind: "resource", insert: false },
      { label: tr("dap.export.datapack"), scopeRoot: root, targetRoot: `${root}/datapacks/${packName}`, kind: "datapack", insert: false },
    ];
  }
  if (outputMode === "both_separate") {
    const resourceParent = settings.resourcePackFolder || pickDirectory("display_anim_export_resource_parent", tr("dap.export.pick_resource", { pack: packName }));
    if (!resourceParent) return null;
    const datapackParent = settings.datapackFolder || pickDirectory("display_anim_export_datapack_parent", tr("dap.export.pick_datapack", { pack: packName }));
    if (!datapackParent) return null;
    return [
      { label: tr("dap.export.resource_pack"), scopeRoot: resourceParent, targetRoot: `${resourceParent}/${packName}`, kind: "resource", insert: false },
      { label: tr("dap.export.datapack"), scopeRoot: datapackParent, targetRoot: `${datapackParent}/${packName}`, kind: "datapack", insert: false },
    ];
  }
  const kind = outputMode === "resource_only" ? "resource" : "datapack";
  const configured = kind === "resource" ? settings.resourcePackFolder : settings.datapackFolder;
  const parent = configured || pickDirectory(
    kind === "resource" ? "display_anim_export_resource_parent" : "display_anim_export_datapack_parent",
    kind === "resource" ? tr("dap.export.pick_resource", { pack: packName }) : tr("dap.export.pick_datapack", { pack: packName })
  );
  return parent
    ? [{
        label: kind === "resource" ? tr("dap.export.resource_pack") : tr("dap.export.datapack"),
        scopeRoot: parent,
        targetRoot: `${parent}/${packName}`,
        kind,
        insert: false,
      }]
    : null;
}

function describeTextureSizeMismatch(): string | null {
  if (!Project) return null;
  const previewTextureUuid = (Project.display_anim_export_settings as { handPreviewTextureUuid?: string } | undefined)?.handPreviewTextureUuid;
  const mismatched = Texture.all.filter(
    (texture) => (!previewTextureUuid || texture.uuid !== previewTextureUuid) &&
      (texture as unknown as Record<string, unknown>)[PREVIEW_TEXTURE_PROPERTY] !== true &&
      texture.name !== "DAP_Default_Player_Skin.png" &&
      texture.name !== "missing.png" &&
      (texture.width !== Project.texture_width || texture.height !== Project.texture_height)
  );
  if (!mismatched.length) return null;
  return tr("dap.export.texture_mismatch", {
    project_width: Project.texture_width,
    project_height: Project.texture_height,
    textures: mismatched.map((texture) => `  ${texture.name}: ${texture.width}×${texture.height}`).join("\n"),
  });
}

export function confirmWarnings(
  warnings: Array<{
    title: string;
    message: string;
    boundsAnimationUuid?: string;
  }>
): Promise<"cancel" | "bounds" | "continue"> {
  if (!warnings.length) return Promise.resolve("continue");
  const boundsAnimationUuid = warnings.find((warning) => warning.boundsAnimationUuid)?.boundsAnimationUuid;
  const message = warnings
    .map((warning, index) => {
      const details = escapeHtml(warning.message).replace(/\n/g, "<br>");
      return `<section style="padding:0 0 12px 12px;border-left:3px solid #e25d68;` +
        `${index ? "margin-top:16px;" : ""}">` +
        `<div style="color:#e25d68;font-size:15px;font-weight:700;margin-bottom:7px">` +
        `⚠ ${index + 1}. ${escapeHtml(warning.title)}</div>` +
        `<div style="line-height:1.5">${details}</div></section>`;
    })
    .join(`<div style="border-top:1px solid var(--color-border);margin:2px 0 14px"></div>`);
  return new Promise((resolve) => {
    const buttons = boundsAnimationUuid
      ? [tr("dap.export.cancel_export"), tr("dap.export.open_bounds_check"), tr("dap.export.export_anyway")]
      : [tr("dap.export.cancel_export"), tr("dap.export.export_anyway")];
    Blockbench.showMessageBox(
      {
        title: tr("dap.export.warnings_title"),
        message,
        icon: "warning",
        buttons,
        confirmIndex: buttons.length - 1,
        cancelIndex: 0,
      },
      (button) => {
        if (boundsAnimationUuid && button === 1) {
          resolve("bounds");
        } else {
          resolve(button === buttons.length - 1 ? "continue" : "cancel");
        }
      }
    );
  });
}

function confirmPreflight(targets: WriteTarget[]): Promise<boolean> {
  const preview = previewPacks(targets);
  if (preview.conflicts.length) {
    Blockbench.showMessageBox({
      title: tr("dap.export.conflict_title"),
      message: tr("dap.export.conflict_message", { paths: preview.conflicts.join("\n") }),
      icon: "error",
    });
    return Promise.resolve(false);
  }
  const targetsSummary = preview.targets
    .map((target) => `<b>${escapeHtml(target.root)}</b><br>` +
      `<span style="color:#59c36a">● ${escapeHtml(tr("dap.export.preflight_added"))}: ${target.added}</span><br>` +
      `<span style="color:#59c36a">● ${escapeHtml(tr("dap.export.preflight_updated"))}: ${target.updated}</span><br>` +
      `<span style="color:${target.removed ? "#e25d68" : "#59c36a"}">${target.removed ? "⚠" : "●"} ${escapeHtml(tr("dap.export.preflight_removed"))}: ${target.removed}</span><br>` +
      `<span style="color:#59c36a">● ${escapeHtml(tr("dap.export.preflight_merged"))}: ${target.merged}</span>`)
    .join("<br><br>");
  return new Promise((resolve) => {
    Blockbench.showMessageBox(
      {
        title: tr("dap.export.preflight_title"),
        message: tr("dap.export.preflight_message", { summary: targetsSummary }),
        icon: "rule",
        buttons: [tr("dap.export.cancel"), tr("dap.export.confirm_write")],
        confirmIndex: 1,
        cancelIndex: 0,
      },
      (button) => resolve(button === 1)
    );
  });
}

async function runExport(form: FormResult, specs: ExportAnimationSpec[], settings: StoredExportAnimationSettings): Promise<void> {
  const defaultSpec = specs.find((spec) => spec.sourceUuid === form.default_animation);
  if (!defaultSpec) throw new Error(tr("dap.export.default_missing"));
  const packName = form.pack_name.trim();
  const projectName = form.project_name.trim();
  const displayName = form.display_name.trim() || projectName;
  const configuredBaseItem = normalizeItemId(form.base_item);
  const baseItem = settings.handRenderingEnabled ? "minecraft:player_head" : configuredBaseItem;
  const displayContexts: PackOptions["displayContexts"] = configuredDisplayAnimations().map(
    ({ context, animated }) => ({ context: context.id, animated })
  );
  const hasAnimatedContext = displayContexts.some((route) => route.animated);
  const sequences: PackAnimationSequence[] = [];
  const warnings: Array<{
    title: string;
    message: string;
    boundsAnimationUuid?: string;
  }> = [];

  if (includesResource(form.output_mode)) {
    if (settings.handRenderingEnabled) {
      rememberExportSettingsDraft(settings);
    }
    if (!hasAnimatedContext && specs.length > 1) {
      warnings.push({
        title: tr("dap.export.no_animated_context_title"),
        message: tr("dap.export.no_animated_context_message", {
          default_animation: animationIdentity(defaultSpec),
        }),
      });
    }
    const bakedSpecs = hasAnimatedContext ? specs : [defaultSpec];
    const frameCounts = new Map(bakedSpecs.map((spec) => [spec.sourceUuid, hasAnimatedContext ? spec.frameCount : 1]));
    const animationKeys = new Map(bakedSpecs.map((spec) => [spec.sourceUuid, spec.key]));
    const isolated = await runExactBoundsForExport(
      bakedSpecs.map((spec) => spec.animation),
      animationKeys,
      frameCounts,
      settings.animationFps,
      settings.exactBoundsOnExport && hasAnimatedContext,
      settings.exactBoundsOnExport,
      settings.handRenderingEnabled
    );
    if (!isolated) {
      Blockbench.showQuickMessage(tr("dap.export.cancelled"), 2500);
      return;
    }
    for (const result of isolated.sequences) {
      sequences.push({ key: result.key, sourceName: result.sourceName, frames: result.frames });
    }
    for (const spec of bakedSpecs) {
      if (spec.sourceFps !== settings.animationFps) {
        warnings.push({
          title: `${tr("dap.export.resampled_title")} — ${animationIdentity(spec)}`,
          message: tr("dap.export.resampled_message", {
            source_fps: spec.sourceFps,
            game_fps: settings.animationFps,
            frames: spec.frameCount,
          }),
        });
      }
      if (settings.exactBoundsOnExport) {
        const record = isolated.records.find((item) => item.animationUuid === spec.sourceUuid);
        const bounds = describeOutOfBounds(record?.hits ?? []);
        if (bounds) warnings.push({
          title: `${tr("dap.export.bounds_title")} — ${animationIdentity(spec)}`,
          message: bounds,
          boundsAnimationUuid: spec.sourceUuid,
        });
      }
    }
    const textureWarning = describeTextureSizeMismatch();
    if (textureWarning) warnings.push({ title: tr("dap.export.texture_mismatch_title"), message: textureWarning });
  } else {
    warnings.push({ title: tr("dap.export.datapack_only_title"), message: tr("dap.export.datapack_only_message") });
  }
  if (settings.handRenderingEnabled && includesResource(form.output_mode)) {
    warnings.push({
      title: tr("dap.export.hand_rendering_warning_title"),
      message: tr("dap.export.hand_rendering_warning_message"),
    });
    if (!includesDatapack(form.output_mode)) {
      warnings.push({
        title: tr("dap.export.hand_rendering_resource_only_title"),
        message: tr("dap.export.hand_rendering_resource_only_message"),
      });
    }
  }

  const warningDecision = await confirmWarnings(warnings);
  if (warningDecision === "bounds") {
    runBoundsCheck(specs.map((spec) => spec.animation));
    return;
  }
  if (warningDecision === "cancel") {
    Blockbench.showQuickMessage(tr("dap.export.cancelled"), 2500);
    return;
  }

  // Ask for an output location only after model, texture, and resampling warnings are resolved.
  // This prevents a folder picker from appearing before the user decides to fix the model.
  const destinations = chooseDestinations(form.output_mode, form.write_mode, packName, settings);
  if (!destinations) {
    Blockbench.showQuickMessage(tr("dap.export.cancelled"), 2500);
    return;
  }

  const totalFrames = specs.reduce((sum, spec) => sum + spec.frameCount, 0);
  const resourceBuild = includesResource(form.output_mode)
    ? buildResourcePack(sequences, {
        packName,
        projectName,
        defaultAnimationKey: defaultSpec.key,
        displayContexts,
        handRenderingEnabled: settings.handRenderingEnabled,
        description: tr("dap.export.resource_description_multi", {
          name: displayName,
          animations: specs.length,
          frames: sequences.reduce((sum, sequence) => sum + sequence.frames.length, 0),
          fps: settings.animationFps,
        }),
      })
    : null;
  const datapackOptions: DatapackOptions = {
    packName,
    projectName,
    baseItem,
    itemDisplayName: displayName,
    frameObjective: form.frame_objective,
    modeObjective: form.mode_objective,
    maxFrameObjective: form.max_frame_objective,
    playingTag: form.playing_tag,
    playbackFps: settings.animationFps,
    debugEnabled: settings.debugEnabled === true,
    handRenderingEnabled: settings.handRenderingEnabled,
    animations: specs.map((spec) => ({ key: spec.key, displayName: spec.sourceName, frameCount: spec.frameCount })),
    defaultAnimationKey: defaultSpec.key,
    description: tr("dap.export.datapack_description_multi", {
      name: displayName,
      animations: specs.length,
      frames: totalFrames,
    }),
  };
  const targets: WriteTarget[] = destinations.map((destination) => ({
    scopeRoot: destination.scopeRoot,
    root: destination.targetRoot,
    kind: destination.kind,
    projectName,
    insert: destination.insert,
    files: [
      ...(destination.kind === "resource" ? resourceBuild!.files : buildDatapack(datapackOptions)),
    ],
  }));

  if (!(await confirmPreflight(targets))) {
    Blockbench.showQuickMessage(tr("dap.export.cancelled"), 2500);
    return;
  }

  const count = writePacks(targets);
  rememberExportSettings({
    selectedAnimationUuids: specs.map((spec) => spec.sourceUuid),
    defaultAnimationUuid: defaultSpec.sourceUuid,
    packName,
    projectName,
    outputMode: form.output_mode,
    writeMode: form.write_mode,
    baseItem: configuredBaseItem,
    displayName,
    frameObjective: form.frame_objective,
    modeObjective: form.mode_objective,
    maxFrameObjective: form.max_frame_objective,
    playingTag: form.playing_tag,
    debugEnabled: settings.debugEnabled === true,
    handRenderingEnabled: settings.handRenderingEnabled,
    handRigRootUuid: settings.handRigRootUuid,
    handLeftGroupUuid: settings.handLeftGroupUuid,
    handRightGroupUuid: settings.handRightGroupUuid,
    handPreviewTextureUuid: settings.handPreviewTextureUuid,
    exactBoundsOnExport: settings.exactBoundsOnExport,
    animationFps: settings.animationFps,
    sharedRoot: settings.sharedRoot,
    resourcePackFolder: settings.resourcePackFolder,
    datapackFolder: settings.datapackFolder,
  });

  const report = resourceBuild?.report ?? null;
  const locations = destinations.map((destination) =>
    `<div style="margin-top:7px"><b>${escapeHtml(destination.label)}：</b>` +
    `<div style="margin-top:2px;overflow-wrap:anywhere">${escapeHtml(`${destination.targetRoot}/`)}</div></div>`
  ).join("");
  const optimization = report ? describeOptimization(report) : "";
  const itemModel = includesResource(form.output_mode) || includesDatapack(form.output_mode)
    ? tr("dap.export.item_model_id", { id: `${EXPORT_NAMESPACE}:${projectName}` })
    : "";
  const tipsStatus = tr(settings.debugEnabled === true
    ? "dap.export.developer_tips_enabled"
    : "dap.export.developer_tips_disabled");
  const handStatus = tr(settings.handRenderingEnabled
    ? "dap.export.developer_tips_enabled"
    : "dap.export.developer_tips_disabled");
  Blockbench.showMessageBox({
    title: tr("dap.export.complete"),
    message: `<div style="font-size:16px;font-weight:700;color:#59c36a">✓ ${escapeHtml(tr("dap.export.complete_heading"))}</div>` +
      `<div style="margin-top:2px">${escapeHtml(tr("dap.export.write_success", { count }))}</div>` +
      `<div style="margin-top:13px;padding-top:7px;border-top:1px solid var(--color-border)">` +
      `<div style="font-size:15px;font-weight:700;border-left:3px solid var(--color-accent);padding-left:7px">${escapeHtml(tr("dap.export.output_locations"))}</div>${locations}</div>` +
      (optimization ? `<div style="margin-top:12px;padding-top:7px;border-top:1px solid var(--color-border)">` +
        `<div style="font-size:15px;font-weight:700;border-left:3px solid var(--color-accent);padding-left:7px;margin-bottom:5px">${escapeHtml(tr("dap.export.summary"))}</div>${optimization}</div>` : "") +
      `<div style="margin-top:12px;padding-top:7px;border-top:1px solid var(--color-border)">` +
      `<div style="font-size:15px;font-weight:700;border-left:3px solid var(--color-accent);padding-left:7px;margin-bottom:5px">${escapeHtml(tr("dap.export.developer_info"))}</div>` +
      (itemModel ? `<div>${escapeHtml(itemModel)}</div>` : "") +
      `<div style="margin-top:3px">${escapeHtml(tr("dap.export.developer_tips_status", { status: tipsStatus }))}</div>` +
      `<div style="margin-top:3px">${escapeHtml(tr("dap.export.hand_rendering_status", { status: handStatus }))}</div></div>`,
    icon: "check_circle",
  });
}

function describeOptimization(report: PackBuildReport): string {
  const statistics = tr("dap.export.optimization_statistics", {
    sampled: report.sampledFrames,
    unique: report.uniqueModels,
    duplicates: report.duplicateFrames,
  });
  const modelJson = tr("dap.export.model_json_size", {
    before: formatBytes(report.modelBytesBefore),
    after: formatBytes(report.modelBytesAfter),
  });
  const animations = report.animations
    .map((animation) => escapeHtml(tr("dap.export.animation_report", {
      animation: `${animation.sourceName} (${animation.key})`,
      frames: animation.sampledFrames,
    })))
    .join("<br>");
  return `<div style="font-weight:600">${escapeHtml(tr("dap.export.space_optimization"))}</div>` +
    `<div style="margin-top:1px;line-height:1.3">${escapeHtml(statistics)}</div>` +
    `<div style="margin-top:1px;line-height:1.3">${escapeHtml(modelJson)}</div>` +
    (animations ? `<div style="margin-top:5px;line-height:1.35">${animations}</div>` : "");
}

function openPackConfigurationDialog(
  animations: Animation[],
  initial: StoredExportAnimationSettings,
  defaultAnimationUuid: string
): void {
  const specs = createExportAnimationSpecs(animations, initial.animationFps);
  const form: FormResult = {
    pack_name: initial.packName,
    project_name: initial.projectName,
    base_item: initial.baseItem,
    display_name: initial.displayName,
    frame_objective: initial.frameObjective,
    mode_objective: initial.modeObjective,
    max_frame_objective: initial.maxFrameObjective,
    playing_tag: initial.playingTag,
    output_mode: initial.outputMode,
    write_mode: initial.writeMode,
    default_animation: defaultAnimationUuid,
  };
  if (!isSafeProjectName(form.pack_name.trim()) || !isSafeProjectName(form.project_name.trim())) {
    Blockbench.showMessageBox({ title: tr("dap.export.invalid_identifier_title"), message: `${tr("dap.export.invalid_identifier_message")}\n\n${tr("dap.export.open_settings_hint")}`, icon: "error" });
    return;
  }
  const objectives = [
    form.frame_objective,
    form.mode_objective,
    form.max_frame_objective,
    phaseObjectiveFor(form.frame_objective),
  ];
  if (objectives.some((value) => !isValidObjectiveName(value)) || new Set(objectives).size !== objectives.length || !isValidPlayingTag(form.playing_tag)) {
    Blockbench.showMessageBox({ title: tr("dap.export.failed"), message: `${tr("dap.export.objective_conflict")}\n\n${tr("dap.export.open_settings_hint")}`, icon: "error" });
    return;
  }
  exportInProgress = true;
  void runExport(form, specs, initial)
    .catch((error) => {
      console.error("JSB export failed", error);
      Blockbench.showMessageBox({ title: tr("dap.export.failed"), message: (error as Error).message ?? String(error), icon: "error" });
    })
    .finally(() => { exportInProgress = false; });
}

export function openExportDialog(): void {
  if (exportInProgress) {
    Blockbench.showQuickMessage(tr("dap.export.busy"), 2000);
    return;
  }
  const animations = Animation.all.slice();
  if (!animations.length) {
    Blockbench.showMessageBox({ title: tr("dap.export.no_animation_title"), message: tr("dap.export.no_animation_message"), icon: "error" });
    return;
  }
  const initial = initialExportSettings(animations);
  const selectedSet = new Set(initial.selectedAnimationUuids);
  const selected = animations.filter((animation) => selectedSet.has(animation.uuid));
  if (!selected.length) {
    Blockbench.showMessageBox({ title: tr("dap.export.select_title"), message: `${tr("dap.export.select_required")}\n\n${tr("dap.export.open_settings_hint")}`, icon: "error" });
    return;
  }
  const conflicts = findAnimationKeyConflicts(selected);
  if (conflicts.length) {
    const details = conflicts.map((conflict) => tr("dap.export.key_conflict_entry", {
      key: conflict.key || tr("dap.export.invalid_key"), animations: conflict.animationNames.join(", "),
    })).join("\n");
    Blockbench.showMessageBox({ title: tr("dap.export.key_conflict_title"), message: `${tr("dap.export.key_conflict_message", { details })}\n\n${tr("dap.export.open_settings_hint")}`, icon: "error" });
    return;
  }
  const defaultUuid = selectedSet.has(initial.defaultAnimationUuid) ? initial.defaultAnimationUuid : selected[0].uuid;
  openPackConfigurationDialog(selected, initial, defaultUuid);
}
