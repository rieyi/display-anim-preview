import { registerFirstPersonPanel, disposeFirstPersonPanel, openFirstPersonPanel } from "./first-person-panel";
import { openControlPanel, disposeControlPanel } from "./control-panel";
import { enterDisplaySlot, currentSlot } from "./slot-controller";
import { runBoundsCheck, disposeBoundsCheckPanel } from "./bounds-check-panel";
import { openExportDialog } from "./export-dialog";
import { openProjectSettingsDialog, disposeProjectSettingsDialog } from "./project-settings-dialog";
import {
  registerModelFormat,
  unregisterModelFormat,
  FORMAT_ID,
} from "./format";
import { isChineseOnlyBuild, registerTranslations, tr } from "./i18n";
import { initializePlaybackSync, disposePlaybackSync } from "./playback";
import {
  registerDisplayAnimationProperty,
  unregisterDisplayAnimationProperty,
} from "./display-animation-settings";
import {
  registerExportAnimationSettingsProperty,
  unregisterExportAnimationSettingsProperty,
} from "./export-animation-settings";
import { registerHandRigProperties, unregisterHandRigProperties } from "./hand-rig";

declare const __DAP_OFFICIAL_REPOSITORY__: boolean | undefined;

const OPEN_ACTION_ID = "display_anim_preview_open_action";
const CHECK_BOUNDS_ACTION_ID = "display_anim_preview_check_bounds";
const EXPORT_ACTION_ID = "display_anim_preview_export_packs";
const SETTINGS_ACTION_ID = "display_anim_preview_project_settings";
const TOOLS_MENU_ID = "display_anim_preview_tools";
const FIRST_PERSON_ACTION_ID = "display_anim_first_person_open";

let firstPersonAction: Action | null = null;
let openAction: Action | null = null;
let checkBoundsAction: Action | null = null;
let exportAction: Action | null = null;
let settingsAction: Action | null = null;
let toolsMenu: Action | null = null;

function openNewProjectPreview(data?: unknown): void {
  const event = data as { project?: { format?: { id?: string } } } | undefined;
  if (event?.project?.format?.id === FORMAT_ID) openControlPanel();
}

const ABOUT_EN = `Java Display Animator creates frame-baked Minecraft Java item animations directly in Blockbench.

## Features

- Preview the current animation across GUI, first-person, third-person, ground, head, item-frame, embedded, and shelf display contexts.
- Enable or disable animation independently for each display context.
- Use Blockbench's official timeline for synchronized playback and scrubbing.
- Select and export multiple named animations, with a visible Minecraft key and configurable default animation.
- Set a project animation rate from 1 to 20 FPS for preview, bounds checks, isolated baking, and Minecraft playback; deduplicate identical model frames across all tracks.
- Create new packs or transactionally insert a project module into existing unpacked packs.
- Export under the fixed jsb namespace with short per-animation commands and a dynamic macro API.
- Keep playback state independently on each unstackable generated item, so identical model items do not share animation progress.
- Choose quick mathematical or exact isolated model-bounds checks with progress, cancellation, and per-animation status.
- Create editable Classic/Slim player-arm bindings and export their sampled animation in both first-person views while using the current player's skin.

## Quick Start

1. Create or open a **Java Display Animation** project. New projects open the display preview panel automatically.
2. Build and animate the model in Blockbench's Animation mode.
3. Configure item transforms in Display mode.
4. Use **Tools > Java Display Animator** to open Project Settings and the display-animation preview.
5. Run **Export Resource Pack and Datapack**, select the animations and default, then create packs or insert the project into existing packs.

Requires Blockbench Desktop 5.1.5 or newer. Generated packs target Minecraft Java 26.2. Player-skin arms currently require Minecraft Java 1.21.11 or newer.

[Source and full documentation](https://github.com/rieyi/display-anim-preview) | [Report an issue](https://github.com/rieyi/display-anim-preview/issues)`;

const ABOUT_ZH = `Java 逐帧显示动画可以直接在 Blockbench 中制作 Minecraft Java 版物品逐帧烘焙动画。

## 主要功能

- 在 GUI、第一人称、第三人称、地面、头部、展示框、内嵌和展示架等显示位置中预览当前动画。
- 为每个显示位置独立开启或关闭动画。
- 使用 Blockbench 官方时间轴同步播放和拖动预览。
- 导出时选择多段命名动画、预览其 Minecraft key，并指定默认动画。
- 每段动画按工程设置的 1～20 FPS 独立烘焙，并在全部动画轨之间去重相同模型帧。
- 创建新包，或以事务方式把当前项目模块插入已有的解压资源包和数据包。
- 固定导出到 jsb 命名空间，并提供逐动画短命令和动态函数宏接口。
- 可选择快速数学或精确隔离模型范围检测，并提供进度、取消和逐动画状态。
- 创建可编辑的宽臂/细臂玩家手臂绑定，并将手臂动画逐帧导出到左右第一人称视角；游戏内使用当前玩家皮肤。

## 快速开始

1. 新建或打开“**Java 逐帧显示动画**”工程；新建工程会自动打开显示位置动画预览面板。
2. 在 Blockbench 动画模式中制作模型和动画。
3. 在显示调整模式中配置物品变换。
4. 在“**工具 → Java 逐帧显示动画**”中打开项目设置与显示位置动画预览。
5. 运行“**导出资源包和数据包**”，勾选动画与默认段，再选择创建新包或插入现有包。

需要 Blockbench 桌面版 5.1.5 或更高版本。生成的资源包和数据包面向 Minecraft Java 26.2。手臂皮肤目前仅支持 Minecraft Java 1.21.11 及以上版本。

[源码与完整文档](https://github.com/rieyi/display-anim-preview) | [报告问题](https://github.com/rieyi/display-anim-preview/issues)`;

/** Uses the export baking path so the bounds report matches exported models. */
Plugin.register("display_anim_preview", {
  title: isChineseOnlyBuild() ? "Java 逐帧显示动画" : "Java Display Animator",
  author: "rieyi",
  description: isChineseOnlyBuild()
    ? "按显示位置预览 Minecraft Java 逐帧烘焙物品动画，并将多段动画导出为完整资源包和动画驱动数据包。"
    : "Preview frame-baked Minecraft Java item animations per display context and export multiple " +
      "animations as complete resource packs and animation-driving datapacks.",
  ...(typeof __DAP_OFFICIAL_REPOSITORY__ !== "undefined" &&
  __DAP_OFFICIAL_REPOSITORY__
    ? {}
    : { about: isChineseOnlyBuild() ? ABOUT_ZH : ABOUT_EN }),
  icon: "icon.png",
  tags: ["Minecraft: Java Edition", "Animation", "Exporter"],
  version: "1.1.2",
  min_version: "5.1.5",
  variant: "desktop",
  creation_date: "2026-08-07",
  has_changelog: true,
  repository: "https://github.com/rieyi/display-anim-preview",
  bug_tracker: "https://github.com/rieyi/display-anim-preview/issues",
  await_loading: true,
  contributes: {
    formats: [FORMAT_ID],
  },
  onload() {
    registerTranslations();
    registerHandRigProperties();
    registerDisplayAnimationProperty();
    registerExportAnimationSettingsProperty();
    registerModelFormat();
    Blockbench.on("new_project", openNewProjectPreview);
    initializePlaybackSync();
    registerFirstPersonPanel();
    firstPersonAction = new Action(FIRST_PERSON_ACTION_ID, {
      name: tr("dap.fp.open"),
      description: tr("dap.fp.open_desc"),
      icon: "visibility",
      category: "animation",
      condition: () => Modes.selected.id === "animate" && [FORMAT_ID, "java_block_sequence"].includes(Format.id),
      click: openFirstPersonPanel,
    });
    // Persisted toolbar IDs can outlive deleted actions during a hot reload.
    const firstPersonIndex = Toolbars.timeline.children.findIndex(
      (item) => (typeof item === "string" ? item : item.id) === FIRST_PERSON_ACTION_ID
    );
    Toolbars.timeline.children = Toolbars.timeline.children.filter(
      (item) => (typeof item === "string" ? item : item.id) !== FIRST_PERSON_ACTION_ID
    );
    Toolbars.timeline.add(firstPersonAction, firstPersonIndex < 0 ? undefined : firstPersonIndex);
    MenuBar.addAction(firstPersonAction, "animation");

    openAction = new Action(OPEN_ACTION_ID, {
      name: tr("dap.action.open"),
      description: tr("dap.action.open_desc"),
      icon: "movie",
      category: "animation",
      click() {
        openControlPanel();
        enterDisplaySlot(currentSlot());
      },
    });
    checkBoundsAction = new Action(CHECK_BOUNDS_ACTION_ID, {
      name: tr("dap.action.bounds"),
      description: tr("dap.action.bounds_desc"),
      icon: "settings_overscan",
      category: "animation",
      click: () => runBoundsCheck(),
    });
    exportAction = new Action(EXPORT_ACTION_ID, {
      name: tr("dap.action.export"),
      description: tr("dap.action.export_desc"),
      icon: "inventory_2",
      category: "animation",
      click: openExportDialog,
    });
    settingsAction = new Action(SETTINGS_ACTION_ID, {
      name: tr("dap.action.settings"),
      description: tr("dap.action.settings_desc"),
      icon: "tune",
      category: "animation",
      click: openProjectSettingsDialog,
    });
    MenuBar.addAction(exportAction, "file.export");
    toolsMenu = new Action(TOOLS_MENU_ID, {
      name: tr("dap.menu.name"),
      icon: "movie",
      searchable: false,
      children: [settingsAction, openAction, firstPersonAction, checkBoundsAction, "_", exportAction],
    });
    MenuBar.addAction(toolsMenu, "tools");
  },
  onunload() {
    Blockbench.removeListener("new_project", openNewProjectPreview);
    toolsMenu?.delete();
    toolsMenu = null;
    firstPersonAction?.delete();
    firstPersonAction = null;
    disposeFirstPersonPanel();
    disposeControlPanel();
    disposePlaybackSync();
    disposeProjectSettingsDialog();
    disposeBoundsCheckPanel();
    openAction?.delete();
    openAction = null;
    checkBoundsAction?.delete();
    checkBoundsAction = null;
    exportAction?.delete();
    exportAction = null;
    settingsAction?.delete();
    settingsAction = null;
    unregisterModelFormat();
    unregisterDisplayAnimationProperty();
    unregisterExportAnimationSettingsProperty();
    unregisterHandRigProperties();
  },
});
