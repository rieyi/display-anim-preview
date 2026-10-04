/** Lightweight sidebar-paged project settings window for export configuration. */

import { animationKeyFromName, findAnimationKeyConflicts } from "./animation-export-plan";
import { detectionStatus, modelBoundsFingerprint } from "./bounds-cache";
import {
  initialExportSettings,
  rememberExportSettingsDraft,
  type ExportOutputMode,
  type ExportWriteMode,
} from "./export-animation-settings";
import { EXPORT_NAMESPACE, isSafeProjectName, isValidObjectiveName, isValidPlayingTag } from "./export-layout";
import { tr } from "./i18n";
import { deleteHandRig, ensureHandRig, setHandRigVisibility } from "./hand-rig";
import { VANILLA_ITEM_IDS } from "./vanilla-items";
import { applyFocusHighlight, el } from "./ui-dom";

let overlay: HTMLElementLike | null = null;

function fieldLabel(text: string): HTMLElementLike {
  const label = el("label", text);
  label.style.display = "block";
  label.style.fontSize = "inherit";
  label.style.marginBottom = "5px";
  label.style.color = "var(--color-text)";
  return label;
}

function fieldWrap(): HTMLElementLike {
  const wrap = el("div");
  wrap.style.marginBottom = "15px";
  return wrap;
}

function styleControl(control: HTMLElementLike): void {
  control.style.height = "38px";
  control.style.padding = "0 10px";
  control.style.boxSizing = "border-box";
  control.style.color = "var(--color-text)";
  control.style.background = "var(--color-back)";
  control.style.border = "1px solid var(--color-border)";
  control.style.borderRadius = "0";
  control.style.outline = "none";
  applyFocusHighlight(control);
}

type Validation = { state: "valid" | "warning" | "error" | "empty"; message: string };

function validationLine(): HTMLElementLike {
  const line = el("div");
  line.style.fontSize = "inherit";
  line.style.marginTop = "5px";
  line.style.minHeight = "16px";
  return line;
}

function showValidation(line: HTMLElementLike, result: Validation): void {
  const colors = { valid: "#59c36a", warning: "#e6ad4f", error: "#e25d68", empty: "var(--color-subtle_text)" };
  const icons = { valid: "check_circle", warning: "warning", error: "error", empty: "info" };
  line.style.color = colors[result.state];
  line.innerHTML = `<i class="material-icons" style="font-size:14px;vertical-align:-2px;margin-right:4px">${icons[result.state]}</i>${result.message}`;
}

function identifierValidation(value: string): Validation {
  return isSafeProjectName(value.trim())
    ? { state: "valid", message: tr("dap.settings.valid_identifier") }
    : { state: "error", message: tr("dap.settings.invalid_identifier") };
}

function objectiveNameValidation(value: string): Validation {
  return isValidObjectiveName(value)
    ? { state: "valid", message: tr("dap.settings.valid_runtime_name") }
    : { state: "error", message: tr("dap.settings.invalid_runtime_name") };
}

function playingTagValidation(value: string): Validation {
  return isValidPlayingTag(value)
    ? { state: "valid", message: tr("dap.settings.valid_playing_tag") }
    : { state: "error", message: tr("dap.settings.invalid_playing_tag") };
}

function folderValidation(value: string, kind: "shared" | "resource" | "datapack", insert: boolean, packName = ""): Validation {
  if (!value.trim()) return { state: "empty", message: tr("dap.settings.folder_optional") };
  let fs: NodeFs | undefined;
  try {
    fs = requireNativeModule("fs", { scope: value, message: tr("dap.permission.export"), show_permission_dialog: false }) as NodeFs | undefined;
    if (!fs || !fs.existsSync(value)) return { state: "error", message: tr("dap.settings.folder_missing") };
    fs.readdirSync(value, { withFileTypes: true });
  } catch (_error) {
    return { state: "error", message: tr("dap.settings.folder_unreadable") };
  }
  if (!insert) return { state: "valid", message: tr("dap.settings.folder_valid_parent") };
  if (kind === "shared") {
    const path = requireNativeModule("path") as NodePath;
    const resourceMeta = path.join(value, "resource-packs", packName, "pack.mcmeta");
    const dataMeta = path.join(value, "datapacks", packName, "pack.mcmeta");
    return fs.existsSync(resourceMeta) && fs.existsSync(dataMeta)
      ? { state: "valid", message: tr("dap.settings.folder_valid_shared") }
      : { state: "error", message: tr("dap.settings.folder_invalid_shared") };
  }
  const path = requireNativeModule("path") as NodePath;
  const packMeta = path.join(value, "pack.mcmeta");
  if (!fs.existsSync(packMeta)) return { state: "error", message: tr("dap.settings.folder_no_pack_meta") };
  try {
    const parsed = JSON.parse(fs.readFileSync(packMeta, "utf8")) as { pack?: unknown };
    if (!parsed || typeof parsed.pack !== "object") return { state: "error", message: tr("dap.settings.folder_invalid_pack_meta") };
  } catch (_error) {
    return { state: "error", message: tr("dap.settings.folder_invalid_pack_meta") };
  }
  const expected = path.join(value, kind === "resource" ? "assets" : "data");
  return fs.existsSync(expected)
    ? { state: "valid", message: tr("dap.settings.folder_valid_pack") }
    : { state: "warning", message: tr(kind === "resource" ? "dap.settings.folder_no_assets" : "dap.settings.folder_no_data") };
}

function textField(parent: HTMLElementLike, label: string, value: string, change: (value: string) => void, validate?: (value: string) => Validation): void {
  const wrap = fieldWrap();
  wrap.appendChild(fieldLabel(label));
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  styleControl(input);
  const status = validationLine();
  input.oninput = (event) => {
    change(event.target.value);
    if (validate) showValidation(status, validate(event.target.value));
  };
  wrap.appendChild(input);
  if (validate) {
    showValidation(status, validate(value));
    wrap.appendChild(status);
  }
  parent.appendChild(wrap);
}

function selectField<T extends string>(
  parent: HTMLElementLike,
  label: string,
  value: T,
  options: Array<[T, string]>,
  change: (value: T) => void,
  disabled = false
): void {
  const wrap = fieldWrap();
  wrap.appendChild(fieldLabel(label));
  const select = document.createElement("select");
  select.style.width = "100%";
  styleControl(select);
  for (const [id, title] of options) {
    const option = document.createElement("option");
    option.value = id;
    option.innerText = title;
    select.appendChild(option);
  }
  select.value = value;
  select.disabled = disabled;
  if (disabled) select.style.opacity = "0.65";
  select.onchange = (event) => change(event.target.value as T);
  wrap.appendChild(select);
  parent.appendChild(wrap);
}

function checkboxField(parent: HTMLElementLike, label: string, help: string, checked: boolean, change: (value: boolean) => void): void {
  const wrap = fieldWrap();
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.style.marginRight = "8px";
  input.onchange = () => change(input.checked);
  const text = el("span", label);
  const row = el("label");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.cursor = "pointer";
  row.appendChild(input);
  row.appendChild(text);
  const hint = el("button", "?");
  hint.style.display = "inline-flex";
  hint.style.alignItems = "center";
  hint.style.justifyContent = "center";
  hint.style.width = "17px";
  hint.style.height = "17px";
  hint.style.marginLeft = "7px";
  hint.style.border = "1px solid var(--color-subtle_text)";
  hint.style.borderRadius = "50%";
  hint.style.fontSize = "inherit";
  hint.style.color = "var(--color-subtle_text)";
  hint.style.padding = "0";
  hint.style.cursor = "pointer";
  const helpBox = el("div", help);
  helpBox.style.display = "none";
  helpBox.style.margin = "8px 0 0 26px";
  helpBox.style.padding = "8px 10px";
  helpBox.style.background = "var(--color-back)";
  helpBox.style.borderLeft = "3px solid var(--color-accent)";
  helpBox.style.color = "var(--color-subtle_text)";
  helpBox.style.fontSize = "inherit";
  hint.onclick = () => {
    helpBox.style.display = helpBox.style.display === "none" ? "block" : "none";
  };
  row.appendChild(hint);
  wrap.appendChild(row);
  wrap.appendChild(helpBox);
  parent.appendChild(wrap);
}

function folderField(parent: HTMLElementLike, label: string, value: string, resourceId: string, validate: (value: string) => Validation, change: (value: string) => void): void {
  const wrap = fieldWrap();
  wrap.appendChild(fieldLabel(label));
  const row = el("div");
  row.style.display = "flex";
  row.style.gap = "8px";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = tr("dap.settings.folder_empty");
  input.style.flex = "1";
  styleControl(input);
  const status = validationLine();
  input.oninput = (event) => { change(event.target.value); showValidation(status, validate(event.target.value)); };
  const browse = el("button", tr("dap.settings.browse"));
  browse.style.height = "38px";
  browse.style.padding = "0 18px";
  browse.style.borderRadius = "0";
  browse.onclick = () => {
    const picked = Blockbench.pickDirectory({ resource_id: resourceId, title: label });
    if (!picked) return;
    input.value = picked;
    change(picked);
    showValidation(status, validate(picked));
  };
  row.appendChild(input);
  row.appendChild(browse);
  wrap.appendChild(row);
  showValidation(status, validate(value));
  wrap.appendChild(status);
  parent.appendChild(wrap);
}

function pageTitle(parent: HTMLElementLike, title: string, description: string): void {
  const heading = el("h2", title);
  heading.style.margin = "0 0 6px";
  parent.appendChild(heading);
  const note = el("p", description);
  note.style.color = "var(--color-subtle_text)";
  note.style.margin = "0 0 20px";
  parent.appendChild(note);
}

function copyableCode(parent: HTMLElementLike, title: string, description: string, value: string): void {
  const wrap = fieldWrap();
  const heading = el("div", title);
  heading.style.fontWeight = "600";
  heading.style.marginBottom = "7px";
  wrap.appendChild(heading);
  const note = el("div", description);
  note.style.marginBottom = "7px";
  note.style.color = "var(--color-subtle_text)";
  note.style.fontSize = "inherit";
  wrap.appendChild(note);
  const row = el("div");
  row.style.display = "flex";
  row.style.alignItems = "stretch";
  const code = document.createElement("textarea");
  code.value = value;
  code.readOnly = true;
  code.style.flex = "1";
  code.style.margin = "0";
  code.style.padding = "10px 12px";
  code.style.background = "var(--color-back)";
  code.style.border = "1px solid var(--color-border)";
  code.style.resize = "vertical";
  code.style.minHeight = `${Math.max(44, value.split("\n").length * 22 + 18)}px`;
  code.style.color = "var(--color-text)";
  code.style.fontFamily = "var(--font-code), monospace";
  code.style.boxSizing = "border-box";
  const copy = el("button");
  copy.innerHTML = `<i class="material-icons" style="font-size:18px">content_copy</i>`;
  copy.title = tr("dap.settings.copy");
  copy.style.width = "44px";
  copy.style.borderRadius = "0";
  copy.onclick = () => {
    const clipboard = requireNativeModule("clipboard", {
      message: tr("dap.settings.clipboard_permission"),
    }) as { writeText(text: string): void } | undefined;
    if (!clipboard) {
      Blockbench.showQuickMessage(tr("dap.settings.copy_failed"), 2000);
      return;
    }
    clipboard.writeText(value);
    Blockbench.showQuickMessage(tr("dap.settings.copied"), 1500);
  };
  row.appendChild(code);
  row.appendChild(copy);
  wrap.appendChild(row);
  parent.appendChild(wrap);
}

export function disposeProjectSettingsDialog(): void {
  overlay?.remove();
  overlay = null;
}

export function openProjectSettingsDialog(): void {
  disposeProjectSettingsDialog();
  if (!Project) {
    Blockbench.showQuickMessage(tr("dap.settings.no_project"), 2000);
    return;
  }
  const animations = Animation.all.slice();
  const settings = initialExportSettings(animations);
  const persist = () => rememberExportSettingsDraft(settings);

  overlay = el("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "10000";
  overlay.style.background = "rgba(0,0,0,.55)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  const shell = el("div");
  shell.id = "dap-project-settings-shell";
  shell.style.width = "900px";
  shell.style.maxWidth = "92vw";
  shell.style.height = "650px";
  shell.style.maxHeight = "88vh";
  shell.style.background = "var(--color-ui)";
  shell.style.border = "1px solid var(--color-border)";
  shell.style.boxShadow = "0 12px 50px rgba(0,0,0,.55)";
  shell.style.display = "flex";
  shell.style.flexDirection = "column";
  shell.style.borderRadius = "0";

  const scopedStyle = el("style");
  scopedStyle.innerHTML = `
    #dap-project-settings-shell .dap-sidebar-button:hover,
    #dap-project-settings-shell .dap-sidebar-button:focus {
      color: var(--color-text) !important;
      background: var(--color-selected) !important;
    }
    #dap-project-settings-shell .dap-sidebar-button:hover *,
    #dap-project-settings-shell .dap-sidebar-button:focus * {
      color: inherit !important;
    }
    #dap-project-settings-shell .dap-hand-card {
      border: 1px solid var(--color-border);
      background: var(--color-back);
      padding: 16px;
    }
    #dap-project-settings-shell .dap-hand-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 14px;
      margin-top: 14px;
    }
    #dap-project-settings-shell .dap-hand-grid > div {
      margin-bottom: 0 !important;
    }
    #dap-project-settings-shell .dap-hand-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding-top: 14px;
      margin-top: 14px;
      border-top: 1px solid var(--color-border);
    }
    #dap-project-settings-shell .dap-hand-actions button {
      height: 34px;
      padding: 0 12px;
      margin: 0;
    }
  `;
  shell.appendChild(scopedStyle);

  const header = el("div", tr("dap.settings.title"));
  header.style.fontSize = "18px";
  header.style.fontWeight = "600";
  header.style.padding = "15px 18px";
  header.style.borderBottom = "1px solid var(--color-border)";
  shell.appendChild(header);

  const body = el("div");
  body.style.display = "flex";
  body.style.flex = "1";
  body.style.minHeight = "0";
  const sidebar = el("div");
  sidebar.style.width = "190px";
  sidebar.style.padding = "0";
  sidebar.style.background = "var(--color-back)";
  sidebar.style.borderRight = "1px solid var(--color-border)";
  const content = el("div");
  content.style.flex = "1";
  content.style.padding = "24px 28px";
  content.style.overflowY = "auto";
  body.appendChild(sidebar);
  body.appendChild(content);
  shell.appendChild(body);

  const renderHands = () => {
    pageTitle(content, tr("dap.settings.page.hands"), tr("dap.settings.hands_desc"));
    checkboxField(
      content,
      tr("dap.settings.hand_rendering"),
      tr("dap.settings.hand_rendering_help"),
      settings.handRenderingEnabled,
      (value) => {
        settings.handRenderingEnabled = value;
        if (value) ensureHandRig(settings);
        else setHandRigVisibility(settings);
        persist();
        content.innerHTML = "";
        renderHands();
      }
    );
    const versionNotice = el("div", tr("dap.hand.skin_version_help"));
    versionNotice.className = "dap-hand-version-notice";
    versionNotice.style.cssText = "margin:12px 0;padding:12px;border:1px solid var(--color-warning);border-radius:6px;";
    content.appendChild(versionNotice);
    if (!settings.handRenderingEnabled) return;

    const shaderNotice = el("div");
    shaderNotice.className = "dap-hand-shader-notice";
    shaderNotice.style.cssText = "margin:12px 0;padding:12px;border:1px solid var(--color-warning);border-radius:6px;";
    const shaderBadge = el("strong", tr("dap.hand.shader_incompatible"));
    shaderBadge.style.color = "var(--color-warning)";
    shaderNotice.appendChild(shaderBadge);
    shaderNotice.appendChild(el("p", tr("dap.hand.shader_incompatible_help")));
    content.appendChild(shaderNotice);

    const actions = el("div");
    actions.className = "dap-hand-actions";
    const actionButton = (label: string, click: () => void, danger = false) => {
      const button = el("button", label);
      if (danger) {
        button.style.color = "#e25d68";
        button.style.marginLeft = "auto";
      }
      button.onclick = click;
      actions.appendChild(button);
    };
    actionButton(tr("dap.hand.delete"), () => {
      Blockbench.showMessageBox({
        title: tr("dap.hand.delete_title"), message: tr("dap.hand.delete_message"), icon: "warning",
        buttons: [tr("dap.export.cancel"), tr("dap.hand.delete_confirm")], confirmIndex: 1, cancelIndex: 0,
      }, (button) => {
        if (button !== 1) return;
        deleteHandRig(settings);
        settings.handRenderingEnabled = false;
        persist();
        content.innerHTML = "";
        renderHands();
      });
    }, true);
    content.appendChild(actions);
  };

  const pages: Array<[string, string, () => void]> = [
    ["settings", tr("dap.settings.page.general"), function renderGeneral() {
      pageTitle(content, tr("dap.settings.page.general"), tr("dap.settings.general_desc"));
      textField(content, tr("dap.export.pack_name"), settings.packName, (v) => { settings.packName = v; persist(); }, identifierValidation);
      textField(content, tr("dap.export.project_name"), settings.projectName, (v) => { settings.projectName = v; persist(); }, identifierValidation);
      selectField(
        content,
        tr("dap.export.base_item"),
        settings.handRenderingEnabled ? "minecraft:player_head" : settings.baseItem,
        VANILLA_ITEM_IDS.map((id) => [`minecraft:${id}`, `minecraft:${id}`]),
        (v) => { settings.baseItem = v; persist(); },
        settings.handRenderingEnabled
      );
      textField(content, tr("dap.export.display_name"), settings.displayName, (v) => { settings.displayName = v; persist(); });
      checkboxField(content, tr("dap.settings.developer_tips"), tr("dap.settings.developer_tips_help"), settings.debugEnabled === true, (v) => { settings.debugEnabled = v; persist(); });
    }],
    ["pan_tool", tr("dap.settings.page.hands"), renderHands],
    ["animation", tr("dap.settings.page.animations"), function renderAnimations() {
      pageTitle(content, tr("dap.settings.page.animations"), tr("dap.settings.animations_desc"));
      const selectedAnimations = animations.filter((animation) => settings.selectedAnimationUuids.includes(animation.uuid));
      const conflicts = findAnimationKeyConflicts(selectedAnimations);
      const selectionStatus = validationLine();
      showValidation(selectionStatus, !selectedAnimations.length
        ? { state: "error", message: tr("dap.settings.animations_empty") }
        : conflicts.length
          ? { state: "error", message: tr("dap.settings.animations_invalid", { details: conflicts.map((item) => `${item.key || tr("dap.export.invalid_key")}: ${item.animationNames.join(", ")}`).join("; ") }) }
          : { state: "valid", message: tr("dap.settings.animations_valid", { count: selectedAnimations.length }) });
      selectionStatus.style.marginBottom = "12px";
      content.appendChild(selectionStatus);
      checkboxField(
        content,
        tr("dap.settings.exact_bounds_export"),
        tr("dap.settings.exact_bounds_export_help"),
        settings.exactBoundsOnExport,
        (value) => { settings.exactBoundsOnExport = value; persist(); }
      );
      // One model fingerprint is shared by every status badge on this page;
      // recomputing it per animation rescans the whole model each time.
      const modelFingerprint = modelBoundsFingerprint();
      for (const animation of animations) {
        const row = fieldWrap();
        row.style.padding = "10px";
        row.style.border = "1px solid var(--color-border)";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = settings.selectedAnimationUuids.includes(animation.uuid);
        checkbox.onchange = () => {
          settings.selectedAnimationUuids = checkbox.checked
            ? [...new Set([...settings.selectedAnimationUuids, animation.uuid])]
            : settings.selectedAnimationUuids.filter((uuid) => uuid !== animation.uuid);
          if (!settings.selectedAnimationUuids.includes(settings.defaultAnimationUuid)) settings.defaultAnimationUuid = settings.selectedAnimationUuids[0] ?? "";
          persist();
          content.innerHTML = "";
          renderAnimations();
        };
        row.appendChild(checkbox);
        const label = el("span", ` ${animation.name}  →  ${animationKeyFromName(animation.name) || tr("dap.export.invalid_key")}`);
        label.style.flex = "1";
        row.appendChild(label);
        const status = detectionStatus(Project as unknown as object, animation, modelFingerprint);
        const statusKey = status.exact
          ? (status.exact.hits.length ? "dap.bounds.status.exact_failed" : "dap.bounds.status.exact_passed")
          : status.quick
            ? (status.quick.hits.length ? "dap.bounds.status.quick_failed" : "dap.bounds.status.quick_passed")
            : status.stale ? "dap.bounds.status.stale" : "dap.bounds.status.unchecked";
        const badge = el("span", tr(statusKey));
        badge.style.fontSize = "inherit";
        badge.style.color = status.exact || status.quick ? "var(--color-accent)" : "var(--color-subtle_text)";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "7px";
        row.appendChild(badge);
        content.appendChild(row);
      }
      if (selectedAnimations.length) {
        selectField(content, tr("dap.export.default_animation"), settings.defaultAnimationUuid, selectedAnimations.map((a) => [a.uuid, `${a.name} (${animationKeyFromName(a.name)})`]), (v) => { settings.defaultAnimationUuid = v; persist(); });
      }
    }],
    ["folder", tr("dap.settings.page.files"), function renderFiles() {
      pageTitle(content, tr("dap.settings.page.files"), tr("dap.settings.files_desc"));
      const rerender = () => { content.innerHTML = ""; renderFiles(); };
      selectField<ExportWriteMode>(content, tr("dap.export.write_mode"), settings.writeMode, [
        ["create", tr("dap.export.write_mode.create")],
        ["insert", tr("dap.export.write_mode.insert")],
      ], (v) => { settings.writeMode = v; persist(); rerender(); });
      selectField<ExportOutputMode>(content, tr("dap.export.output"), settings.outputMode, [
        ["both_default", tr("dap.export.mode.both_default")],
        ["both_separate", tr("dap.export.mode.both_separate")],
        ["resource_only", tr("dap.export.mode.resource_only")],
        ["datapack_only", tr("dap.export.mode.datapack_only")],
      ], (v) => { settings.outputMode = v; persist(); rerender(); });

      if (settings.outputMode === "both_default") {
        folderField(content, tr("dap.settings.shared_root"), settings.sharedRoot, "display_anim_settings_shared", (v) => folderValidation(v, "shared", settings.writeMode === "insert", settings.packName), (v) => { settings.sharedRoot = v; persist(); });
      } else {
        if (settings.outputMode !== "datapack_only") {
          folderField(content, tr("dap.settings.resource_folder"), settings.resourcePackFolder, "display_anim_settings_resource", (v) => folderValidation(v, "resource", settings.writeMode === "insert"), (v) => { settings.resourcePackFolder = v; persist(); });
        }
        if (settings.outputMode !== "resource_only") {
          folderField(content, tr("dap.settings.datapack_folder"), settings.datapackFolder, "display_anim_settings_datapack", (v) => folderValidation(v, "datapack", settings.writeMode === "insert"), (v) => { settings.datapackFolder = v; persist(); });
        }
      }
    }],
    ["database", tr("dap.settings.page.datapack"), () => {
      pageTitle(content, tr("dap.settings.page.datapack"), tr("dap.settings.datapack_desc"));
      textField(content, tr("dap.export.frame_objective"), settings.frameObjective, (v) => { settings.frameObjective = v; persist(); }, objectiveNameValidation);
      textField(content, tr("dap.export.mode_objective"), settings.modeObjective, (v) => { settings.modeObjective = v; persist(); }, objectiveNameValidation);
      textField(content, tr("dap.export.max_frame_objective"), settings.maxFrameObjective, (v) => { settings.maxFrameObjective = v; persist(); }, objectiveNameValidation);
      textField(content, tr("dap.export.playing_tag"), settings.playingTag, (v) => { settings.playingTag = v; persist(); }, playingTagValidation);
    }],
    ["code", tr("dap.settings.page.api"), () => {
      pageTitle(content, tr("dap.settings.page.api"), tr("dap.settings.api_desc"));
      const project = settings.projectName || "<project>";
      const animationPlaceholder = `<${tr("dap.settings.api_animation_placeholder")}>`;
      const playerPlaceholder = `<${tr("dap.settings.api_player_placeholder")}>`;
      copyableCode(content, tr("dap.settings.api_item"), tr("dap.settings.api_item_note"), `${EXPORT_NAMESPACE}:${project}`);
      copyableCode(content, tr("dap.settings.api_common"), tr("dap.settings.api_common_note"), `/function ${EXPORT_NAMESPACE}:${project}/give\n/function ${EXPORT_NAMESPACE}:${project}/stop`);
      copyableCode(content, tr("dap.settings.api_short"), tr("dap.settings.api_short_note"), `/function ${EXPORT_NAMESPACE}:${project}/play/${animationPlaceholder}\n/function ${EXPORT_NAMESPACE}:${project}/loop/${animationPlaceholder}\n/function ${EXPORT_NAMESPACE}:${project}/frame/${animationPlaceholder} {frame:12}`);
      copyableCode(content, tr("dap.settings.api_macro"), tr("dap.settings.api_macro_note"), `/function ${EXPORT_NAMESPACE}:${project}/play {animation:\"${animationPlaceholder}\",mode:\"once\"}\n/function ${EXPORT_NAMESPACE}:${project}/play {animation:\"${animationPlaceholder}\",mode:\"loop\"}\n/function ${EXPORT_NAMESPACE}:${project}/frame {animation:\"${animationPlaceholder}\",frame:12}`);
      copyableCode(content, tr("dap.settings.api_context"), tr("dap.settings.api_context_note"), `execute as ${playerPlaceholder} run function ${EXPORT_NAMESPACE}:${project}/play/${animationPlaceholder}`);
      const reference = el("p", tr("dap.settings.api_reference", { project }));
      reference.style.color = "var(--color-subtle_text)";
      reference.style.lineHeight = "1.55";
      content.appendChild(reference);
    }],
  ];

  const sidebarButtons: HTMLElementLike[] = [];
  let activePage = 0;
  const showPage = (index: number, render: () => void) => {
    activePage = index;
    content.innerHTML = "";
    sidebarButtons.forEach((button, buttonIndex) => {
      button.style.background = buttonIndex === index ? "var(--color-selected)" : "transparent";
      button.style.borderLeft = buttonIndex === index ? "5px solid var(--color-accent)" : "5px solid transparent";
      button.style.color = buttonIndex === index ? "var(--color-text)" : "var(--color-subtle_text)";
    });
    render();
  };
  pages.forEach(([icon, title, render], index) => {
    const button = el("button");
    button.className = "dap-sidebar-button";
    button.innerHTML = `<i class="material-icons" style="font-size:18px">${icon}</i><span>${title}</span>`;
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.gap = "9px";
    button.style.width = "100%";
    button.style.height = "50px";
    button.style.padding = "0 18px";
    button.style.marginBottom = "0";
    button.style.textAlign = "left";
    button.style.border = "0";
    button.style.borderLeft = "5px solid transparent";
    button.style.borderRadius = "0";
    button.onmouseenter = () => {
      button.style.color = "var(--color-text)";
      if (activePage !== index) button.style.background = "var(--color-back)";
    };
    button.onmouseleave = () => {
      button.style.color = activePage === index ? "var(--color-text)" : "var(--color-subtle_text)";
      button.style.background = activePage === index ? "var(--color-selected)" : "transparent";
    };
    button.onclick = () => showPage(index, render);
    sidebarButtons.push(button);
    sidebar.appendChild(button);
  });

  const footer = el("div");
  footer.style.padding = "10px 18px";
  footer.style.borderTop = "1px solid var(--color-border)";
  footer.style.display = "flex";
  footer.style.justifyContent = "space-between";
  footer.appendChild(el("span", tr("dap.settings.saved_hint")));
  const close = el("button", tr("dap.settings.close"));
  close.style.minWidth = "96px";
  close.style.height = "38px";
  close.style.borderRadius = "0";
  close.onclick = disposeProjectSettingsDialog;
  footer.appendChild(close);
  shell.appendChild(footer);
  overlay.appendChild(shell);
  document.body.appendChild(overlay);
  showPage(0, pages[0][2]);
}
