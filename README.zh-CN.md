# Java 帧物品动画

[English · Java Display Animator](README.md)

Java 帧物品动画是一款 Blockbench 插件，适用于 Blockbench 桌面版，用于制作、预览并导出
Minecraft Java 版物品逐帧动画。可分别控制第一人称、第三人称、GUI 等显示位置是否播放动画，
并一键导出资源包和数据包。

需要制作 java 手部物品模型动画时，可以在第一人称播放手持物品的动作，让第三人称或背包图标
保持静止。这类手部物品动画控制的是手持物品模型本身的物品动画。

<p align="center">
  <img src="assets/icon.png" alt="Java 逐帧显示动画" width="96">
</p>

**版本：1.1.2。** 需要 Blockbench 桌面版 5.1.5 或更高版本；Minecraft Java 26.2
是插件开发过程中经过测试的版本。只有从源码构建时才需要 Node.js 20 或更高版本。

![Version](https://img.shields.io/github/v/release/rieyi/display-anim-preview?label=Version&color=2ea44f)
![Blockbench](https://img.shields.io/badge/Blockbench-5.1.5%2B-3b82f6)
![Minecraft](https://img.shields.io/badge/Minecraft_Java-26.2_tested-62b47a)
![Node](https://img.shields.io/badge/Node-20%2B_build_only-e76f00)

本次更新内容见[更新日志](CHANGELOG.zh-CN.md)。插件选项集中在“**工具 → Java 逐帧显示动画**”二级菜单；导出也可从“**文件 → 导出**”调用。

## 下载

[![GitHub Releases](https://img.shields.io/badge/GitHub-Releases-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/rieyi/display-anim-preview/releases)

| 安装包 | 语言行为 |
|---|---|
| [通用语言版 1.1.2](https://github.com/rieyi/display-anim-preview/releases/download/v1.1.2/java-display-animator-v1.1.2-universal.zip) | 以英文为基础，跟随 Blockbench 的简体中文语言设置 |
| [固定简体中文版 1.1.2](https://github.com/rieyi/display-anim-preview/releases/download/v1.1.2/java-display-animator-v1.1.2-zh-CN.zip) | 始终使用简体中文 |

两种安装包功能相同，共用 `display_anim_preview` 插件 ID，只需安装其中一种。

## 演示效果

<p align="center">
  <img src="assets/blockbench-preview.jpg" alt="Blockbench 显示位置动画预览" width="48%" />
  &nbsp;
  <img src="assets/minecraft-result.jpg" alt="Minecraft 游戏内物品动画效果" width="48%" />
</p>

<p align="center">
  <img src="assets/blockbench-preview.gif" alt="Blockbench 显示位置动画预览动图" width="48%" />
  &nbsp;
  <img src="assets/minecraft-result.gif" alt="Minecraft 游戏内物品动画效果动图" width="48%" />
</p>

<p align="center">
  <sub>左：Blockbench · 右：Minecraft</sub>
</p>

打开完整视频：[Blockbench 预览](assets/blockbench-preview.mp4) ·
[Minecraft 游戏内效果](assets/minecraft-result.mp4)。

## 功能管理面板、第一人称动画预览与玩家皮肤手臂

### 插件功能管理面板

从“**工具 → Java 逐帧显示动画 → Java 显示动画器项目设置**”打开侧栏分页窗口，集中管理“常规、玩家手臂、动画、包文件、数据包、开发接口”六页设置。可以设置物品与项目名称，勾选动画和默认显示，配置输出目录，并查看生成的命令示例。

修改会立即更新当前工程的设置；需要保存 `.bbmodel` 才能保留到磁盘，关闭面板不会自动保存模型。

<img src="assets/project-settings-panel.png" alt="包含六个功能分页的项目设置面板" style="zoom: 33%;" />

### 动画制作页的第一人称视角预览

在“**动画**”模式中，侧栏“**第一人称动画预览**”可以显示物品的第一人称左手或右手视角，可以在制作动画时更方便的预览实际效果

![动画制作页中的第一人称预览与可编辑手臂占位模型](assets/first-person-preview-player-arms.png)

图片展示编辑器中的手臂占位模型和预览构图，不是 Minecraft 游戏内皮肤渲染效果。

### 玩家皮肤手臂

在“**项目设置 → 玩家手臂**”开启皮肤手臂，创建可编辑的左右手臂绑定，与物品一起制作位置和旋转动画，并在制作过程中预览姿态。

**手臂皮肤目前仅支持 Minecraft Java 1.21.11 及以上版本。**因为使用原版着色器所以此功能不支持光影；

## 功能点

- **第一人称预览**：支持动画模式中第一人称视场动画预览；

- **玩家手臂：** 可制作基于玩家皮肤动态显示的玩家手臂动画（皮肤手臂依赖原版核心着色器，与光影包不兼容）。

- **制作过程中查看动画：** 在编辑、绘画、动画和显示调整模式中进行播放物品动画，与 Blockbench
  官方时间轴共用播放、暂停、循环和时间状态。
- **显示位置动画独立开关：** 第一人称、第三人称、GUI、地面、头部、展示框等位置分别保存
  动画开关；关闭的位置固定第 0 帧，例如第一人称播放动作、背包图标保持静止。
- **一键导出资源包与数据包：** 同时生成模型资源和配套动画驱动；也可选择仅导出资源包或仅导出数据包。
- **多段动画与命令控制：** 勾选多段动画并指定默认段，使用 `play`、`loop`、`stop`、`frame`
  短入口播放、循环、停止或指定帧，也可通过 `play` / `frame` 宏动态选择动画。
- **1～20 FPS 与模型帧去重：** 工程帧率统一控制预览、烘焙、范围检查和游戏播放；跨动画去重
  内容相同的模型帧，减少重复模型文件。
- **导出前检查：** 检查模型坐标范围、工程与纹理分辨率、缺失纹理引用和粒子纹理。
- **安全插入现有包：** 可创建新包或插入已有解压包；使用清单管理本项目生成的文件，重复插入
  时更新受管理文件，阻止非托管路径冲突，并在写入失败时回滚。
- **物品独立进度** 每件生成的不可堆叠物品独立保存播放进度；
- **工程兼容：**可预览和导出已打开的 `java_block_sequence` 工程，兼容其他插件的工程格式。

资源包用 `display_context` 选择显示位置，再用 `custom_model_data.strings[0]` 选择动画，
用 `custom_model_data.floats[0]` 选择该段局部帧。配套命令使用固定 `jsb` 命名空间，详见
[完整使用教程](doc/USAGE.zh-CN.md)。`java_block_sequence` 兼容依赖 Blockbench 中可用的
Java 模型编译器；本插件不提供已经移除的旧式模型序列 ZIP 导出功能。

## 安装与快速上手

- 在官方插件仓库搜索：**Java Display Animator**
- 或者在本仓库构建文件中下载对应版本

1. 下载一种 ZIP 并解压，不能直接把 ZIP 当作插件加载。
2. 在“**Blockbench → 文件 → 插件 → 从文件加载插件**”中选择 `display_anim_preview.js`。
3. 确认已安装 **Java Display Animator**；固定简体中文版显示为 **Java 逐帧显示动画**。
4. 新建“**文件 → 新建 → Java 逐帧显示动画**”工程，完成物品模型和纹理，在“**动画**”模式制作骨骼组动画。
5. 在“**显示调整**”模式设置变换，命令面板运行“**打开显示位置动画预览**”，设置各位置动画开关。
6. 打开“**Java 显示动画器项目设置**”，对动画、文件目录等进行设置，再点击“**导出资源包和数据包**”对项目进行导出。
7. 在 Minecraft Java 中启用资源包并安装数据包，使用导出完成窗口显示的命令，先运行
   `/function jsb:<项目>/give`获取资源物品

## 教程与故障排查

- [完整使用教程](doc/USAGE.zh-CN.md) · [English guide](doc/USAGE.md)
- [故障排查](doc/TROUBLESHOOTING.zh-CN.md) · [English troubleshooting](doc/TROUBLESHOOTING.md)

## 版本兼容性与已知限制

从实现思路上，理论上可支持所有具备物品模型映射功能的 Minecraft Java 版本。
**Minecraft Java 26.2 是插件开发过程中经过测试、确认稳定支持的版本。**

Java 模型仍受坐标范围限制；编辑器预览颜色不能替代模型面上的纹理。仅导出数据包时，需要
配套动画 key 和帧映射一致的资源包。本版支持可选的玩家皮肤手臂动画，实现的依托是原版核心着色器，与光影不兼容；不支持手臂缩放。



## 贡献

- 动画模型由：[镇川](https://space.bilibili.com/10016652?spm_id_from=333.337.0.0) 提供
- 感谢 [毛豆](https://github.com/Sweda666) 、[镇川](https://space.bilibili.com/10016652?spm_id_from=333.337.0.0) 帮忙测试与提出优化建议

开始大型修改或提交 Pull Request 前，请阅读[贡献指南](CONTRIBUTING.md)。贡献使用受控的 Fork + PR 流程。

## 版权

Copyright © 2026 rieyi. All rights reserved. 详见 [COPYRIGHT.md](COPYRIGHT.md)。
