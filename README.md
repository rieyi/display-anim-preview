# Java Display Animator

**In Blockbench, preview item animations per display context (Edit / Paint / Animate / Display), then export a Minecraft Java resource pack and datapack.** Also works on an open `java_block_sequence` project for preview/export without taking over that format.

> 中文用户[点击此处](doc/README.zh-CN.md)查看介绍

<p align="center">
  <img src="assets/icon.png" alt="Java Display Animator" width="96">
</p>

![Version](https://img.shields.io/github/v/release/rieyi/display-anim-preview?label=Version&color=2ea44f)
![Blockbench](https://img.shields.io/badge/Blockbench-5.1.5%2B-3b82f6)
![Minecraft](https://img.shields.io/badge/Minecraft_Java-26.2-62b47a)
![Node](https://img.shields.io/badge/Node-20%2B_build_only-e76f00)

## Download · 下载

[![GitHub Releases](https://img.shields.io/badge/GitHub-Releases-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/rieyi/display-anim-preview/releases)
[![Blockbench Plugins](https://img.shields.io/badge/Blockbench-Plugins-3b82f6?style=for-the-badge&logo=blockbench&logoColor=white)](https://blockbench.net/plugins)

Download from [GitHub Releases](https://github.com/rieyi/display-anim-preview/releases). The [Blockbench Plugins](https://blockbench.net/plugins) listing is still under review.

Releases ship **Universal** (follows Blockbench language) and **Simplified Chinese** (always zh-CN). Same plugin ID — install only one.

## Demos · 演示

<p align="center">
  <img src="assets/blockbench-preview.jpg" alt="Blockbench preview" width="48%" />
  &nbsp;
  <img src="assets/minecraft-result.jpg" alt="In-game result" width="48%" />
</p>

<p align="center">
  <img src="assets/blockbench-preview.gif" alt="Blockbench preview animation" width="48%" />
  &nbsp;
  <img src="assets/minecraft-result.gif" alt="In-game animation" width="48%" />
</p>

<p align="center">
  <sub>Left: Blockbench · Right: Minecraft</sub>
</p>

## Features · 特性

- Shares play / pause / loop / time with Blockbench’s official timeline
- Per-context animation switches (GUI, first person, third person, ground, head, item frame, and more)
- Disabled contexts stay on frame 0; enabled ones follow exported `custom_model_data` frames
- Project rate 1–20 FPS for preview, bake, bounds checks, and in-game playback
- Pre-export checks for bounds, texture resolution, missing textures, and particle textures
- Multi-animation export with generated keys and one default animation
- Fixed `jsb` namespace, short commands, plus `play` / `frame` macros
- Independent playback state on each unstackable generated item

## Requirements · 环境

- Blockbench Desktop 5.1.5+
- Minecraft Java 26.2 for the generated packs
- Node.js 20+ only when building from source

## Install · 安装

1. Download Universal or Simplified Chinese ZIP from [Releases](https://github.com/rieyi/display-anim-preview/releases)
2. Extract it (do not load the ZIP as a plugin)
3. Blockbench → **File → Plugins → Load Plugin from File**
4. Pick `display_anim_preview.js`
5. Confirm **Java Display Animator** is installed

## Quick start · 快速上手

1. **File → New → Java Display Animation**
2. Build the item and animate groups in **Animate**
3. In **Display**, set transforms and toggle which contexts animate
4. Command Palette → **Export Resource Pack and Datapack**
5. Enable the packs in Minecraft 26.2 and test with the generated `jsb:…` commands

Full guide: [doc/USAGE.md](doc/USAGE.md) · [中文](doc/USAGE.zh-CN.md)  
Troubleshooting: [doc/TROUBLESHOOTING.md](doc/TROUBLESHOOTING.md) · [中文](doc/TROUBLESHOOTING.zh-CN.md)

## Build · 构建

```bash
npm ci
npm test
npm run typecheck
npm run build:release
npm run build:official
```

## Contributing · 贡献

Fork + PR only. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Copyright · 版权

Copyright © 2026 rieyi. See [COPYRIGHT.md](COPYRIGHT.md). Publicly viewable; not an open-source license.
