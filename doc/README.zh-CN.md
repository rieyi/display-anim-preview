# Java 逐帧显示动画

**在 Blockbench 里按显示位置预览物品动画（编辑 / 绘画 / 动画 / 显示调整），并导出 Minecraft Java 版资源包与数据包。** 对其他插件的 `java_block_sequence` 工程也可预览/导出，不会接管对方格式。

[English](../README.md)

<p align="center">
  <img src="../assets/icon.png" alt="Java 逐帧显示动画" width="96">
</p>

![Version](https://img.shields.io/github/v/release/rieyi/display-anim-preview?label=Version&color=2ea44f)
![Blockbench](https://img.shields.io/badge/Blockbench-5.1.5%2B-3b82f6)
![Minecraft](https://img.shields.io/badge/Minecraft_Java-26.2-62b47a)
![Node](https://img.shields.io/badge/Node-20%2B_build_only-e76f00)

## 下载 · Download

[![GitHub Releases](https://img.shields.io/badge/GitHub-Releases-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/rieyi/display-anim-preview/releases)
[![Blockbench Plugins](https://img.shields.io/badge/Blockbench-Plugins-3b82f6?style=for-the-badge&logo=blockbench&logoColor=white)](https://blockbench.net/plugins)

请从 [GitHub Releases](https://github.com/rieyi/display-anim-preview/releases) 下载安装。[Blockbench 插件商店](https://blockbench.net/plugins)仍在审核中。

Release 提供**通用语言版**（跟随 Blockbench 语言）和**固定简体中文版**。共用同一个插件 ID，只能装其中一个。

## 演示 · Demos

<p align="center">
  <img src="../assets/blockbench-preview.jpg" alt="Blockbench 预览" width="48%" />
  &nbsp;
  <img src="../assets/minecraft-result.jpg" alt="游戏内效果" width="48%" />
</p>

<p align="center">
  <img src="../assets/blockbench-preview.gif" alt="Blockbench 预览动画" width="48%" />
  &nbsp;
  <img src="../assets/minecraft-result.gif" alt="游戏内动画" width="48%" />
</p>

<p align="center">
  <sub>左：Blockbench · 右：Minecraft</sub>
</p>

## 特性 · Features

- 与 Blockbench 官方时间轴共用播放 / 暂停 / 循环 / 时间
- 各显示位置独立动画开关（GUI、第一人称、第三人称、地面、头部、展示框等）
- 关闭的位置固定第 0 帧；开启的跟随导出的 `custom_model_data` 帧
- 工程帧率 1–20 FPS，统一用于预览、烘焙、范围检查和游戏内播放
- 导出前检查坐标范围、纹理分辨率、缺失纹理与粒子纹理
- 可勾选多段动画导出，生成 Minecraft key，并指定默认动画
- 固定 `jsb` 命名空间，短命令以及 `play` / `frame` 宏
- 每件不可堆叠物品独立保存播放进度

## 环境 · Requirements

- Blockbench 桌面版 5.1.5+
- 导出结果需 Minecraft Java 26.2
- 仅从源码构建时需要 Node.js 20+

## 安装 · Install

1. 从 [Releases](https://github.com/rieyi/display-anim-preview/releases) 下载通用版或简体中文版 ZIP
2. 解压（不要直接把 ZIP 当插件加载）
3. Blockbench → **文件 → 插件 → 从文件加载插件**
4. 选择 `display_anim_preview.js`
5. 确认已安装 **Java Display Animator**（简体中文专版显示为 **Java 逐帧显示动画**）

## 快速上手 · Quick start

1. **文件 → 新建 → Java 逐帧显示动画**
2. 做好物品，在**动画**模式里做骨骼组动画
3. 在**显示调整**里设变换，并开关各位置是否播放
4. 命令面板 → **导出资源包和数据包**
5. 在 Minecraft 26.2 启用资源包/数据包，用生成的 `jsb:…` 命令测试

完整教程：[USAGE.zh-CN.md](USAGE.zh-CN.md) · [English](USAGE.md)  
问题排查：[TROUBLESHOOTING.zh-CN.md](TROUBLESHOOTING.zh-CN.md) · [English](TROUBLESHOOTING.md)

## 构建 · Build

```bash
npm ci
npm test
npm run typecheck
npm run build:release
npm run build:official
```

## 贡献 · Contributing

仅接受受控的 Fork + Pull Request。见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 版权 · Copyright

Copyright © 2026 rieyi。详见 [COPYRIGHT.md](COPYRIGHT.md)。仓库可公开浏览，不附开源许可。
