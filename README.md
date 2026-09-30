# Java Display Animator

[简体中文 · Java 逐帧显示动画](README.zh-CN.md)

Java Display Animator is a Blockbench plugin for creating, previewing, and exporting frame-baked
Minecraft Java item animations in the Desktop app. Configure animation playback per display
context, then export a resource pack and datapack together. Make first-person hand-held item
animations while keeping third-person views or GUI inventory icons still.

<p align="center">
  <img src="assets/icon.png" alt="Java Display Animator" width="96">
</p>

**Current stable release: 1.1.0.** Blockbench Desktop 5.1.5+ is required. Minecraft Java 26.2 is the
version tested during plugin development. Node.js 20+ is needed only to build from source.

![Version](https://img.shields.io/github/v/release/rieyi/display-anim-preview?label=Version&color=2ea44f)
![Blockbench](https://img.shields.io/badge/Blockbench-5.1.5%2B-3b82f6)
![Minecraft](https://img.shields.io/badge/Minecraft_Java-26.2_tested-62b47a)
![Node](https://img.shields.io/badge/Node-20%2B_build_only-e76f00)

## Download

[![GitHub Releases](https://img.shields.io/badge/GitHub-Releases-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/rieyi/display-anim-preview/releases)

| Package | Language behavior |
|---|---|
| [Universal 1.1.0](https://github.com/rieyi/display-anim-preview/releases/download/v1.1.0/java-display-animator-v1.1.0-universal.zip) | English base interface; follows Blockbench's Simplified Chinese language setting |
| [Simplified Chinese 1.1.0](https://github.com/rieyi/display-anim-preview/releases/download/v1.1.0/java-display-animator-v1.1.0-zh-CN.zip) | Always uses Simplified Chinese |

Both packages provide the same features and share the `display_anim_preview` plugin ID. Install
only one. Verify downloads with [SHA256SUMS.txt](https://github.com/rieyi/display-anim-preview/releases/download/v1.1.0/SHA256SUMS.txt).
The [official plugin-store submission](https://github.com/JannisX11/blockbench-plugins/pull/968)
is still under review; use GitHub Releases to install the plugin.

## Demos

<p align="center">
  <img src="assets/blockbench-preview.jpg" alt="Blockbench display-context item animation preview" width="48%" />
  &nbsp;
  <img src="assets/minecraft-result.jpg" alt="Minecraft Java in-game item animation result" width="48%" />
</p>

<p align="center">
  <img src="assets/blockbench-preview.gif" alt="Animated Blockbench display-context preview" width="48%" />
  &nbsp;
  <img src="assets/minecraft-result.gif" alt="Animated Minecraft Java in-game item result" width="48%" />
</p>

<p align="center">
  <sub>Left: Blockbench · Right: Minecraft</sub>
</p>

Open the full videos: [Blockbench preview](assets/blockbench-preview.mp4) ·
[Minecraft in-game result](assets/minecraft-result.mp4).

## Features

- **Preview while authoring.** Preview item animations in Edit, Paint, Animate, and Display modes,
  sharing play, pause, loop, and time with Blockbench's official timeline.
- **Control each display context.** Set independent animation switches for first-person,
  third-person, GUI, ground, head, item frame, and other supported contexts. Disabled contexts
  stay on frame 0; for example, animate a hand-held item while keeping its inventory icon still.
- **Export a resource pack and datapack together.** Generate model resources and their animation
  driver for Minecraft Java 26.2, with resource-only and datapack-only export choices as well.
- **Use multiple animations and commands.** Select animation tracks and one default animation;
  use short `play`, `loop`, `stop`, and `frame` entries or the dynamic `play` / `frame` macro APIs.
- **Choose 1–20 FPS with model-frame deduplication.** One project rate controls preview, baking,
  bounds checks, and playback. Identical model frames are deduplicated across animations to reduce
  repeated model files.
- **Check before export.** Check model bounds, project/texture resolution mismatches, missing
  texture references, and particle textures before writing packs.
- **Integrate into existing packs.** Create new packs or insert a manifest-managed project into
  existing unpacked packs. Reinsertion updates project-owned files, blocks unmanaged path
  conflicts, and rolls back failed writes.
- **Keep item state independent and preview compatible projects.** Each unstackable generated
  item stores its own playback state. An already open `java_block_sequence` project can also be
  previewed and exported without taking ownership of the other plugin's format.

The resource pack uses `display_context` to choose the view, then `custom_model_data.strings[0]`
to choose an animation and `custom_model_data.floats[0]` to choose its local frame. The fixed `jsb`
namespace provides the matching commands. See the [complete usage guide](doc/USAGE.md).
Compatibility with `java_block_sequence` relies on an available Java model compiler in Blockbench;
the removed legacy model-sequence ZIP exporter is not provided.

## Install and quick start

1. Download one ZIP above and extract it; do not load the ZIP itself as a plugin.
2. In **Blockbench → File → Plugins → Load Plugin from File**, select `display_anim_preview.js`.
3. Confirm **Java Display Animator 1.1.0** is installed.
4. Create **File → New → Java Display Animation**, model and texture the item, then animate its
   groups in **Animate**.
5. In **Display**, adjust transforms. Run **Open Display Animation Preview** from the Command
   Palette and toggle which display contexts animate.
6. Run **Java Display Animator Project Settings**, select animations, a default animation,
   project FPS, and pack settings; then run **Export Resource Pack and Datapack**.
7. Enable the resource pack and install the datapack in Minecraft Java 26.2. Use the commands shown
   in the Export Complete dialog, starting with `/function jsb:<project>/give`.

## Guides

- [Complete usage guide](doc/USAGE.md) · [Chinese guide](doc/USAGE.zh-CN.md)
- [Troubleshooting](doc/TROUBLESHOOTING.md) · [Chinese troubleshooting](doc/TROUBLESHOOTING.zh-CN.md)

## Version compatibility and limitations

In principle, the approach can support Minecraft Java versions that provide item-model mapping.
**Minecraft Java 26.2 is the version tested during plugin development and confirmed as the stable
support target.** Version 1.1.0 generates packs targeting 26.2; other versions may require adapting
pack metadata, item-model routing, components, and datapack commands. The theoretical compatibility
does not mean the exported packs load unchanged on every version.

Java model bounds still apply. Preview-only colors do not replace assigned textures. A datapack-only
export needs a matching resource pack with the same animation keys and frame mapping. This release
animates item models; it does not add animated player-skin arms.

## Build from source

```bash
npm ci
npm test
npm run typecheck
npm run build:release
npm run build:official
```

| Build artifact | Purpose |
|---|---|
| `dist/display_anim_preview.js` | Universal build |
| `dist/display_anim_preview.zh-CN.js` | Fixed Simplified Chinese build |
| `dist/display_anim_preview.official.js` | Official repository build; About comes from `about.md` |

The Chinese Release ZIP names its plugin file `display_anim_preview.js`, because Blockbench requires
the loaded filename to match the plugin ID. The official build is also distributed under that name
in the official repository. Node.js is not required to install a Release ZIP.

## Contributing

Read the [contribution guidelines](CONTRIBUTING.md) before making substantial changes or submitting
a Pull Request. Contributions use the controlled Fork + PR workflow.

## Copyright

Copyright © 2026 rieyi. All rights reserved. See [COPYRIGHT.md](COPYRIGHT.md).
This repository is publicly viewable but does not grant an open-source license.
