# Changelog

## 1.1.2 — 2026-10-04

- Document the six-page project settings panel, first-person animation authoring preview, and player-skin arm workflow. Add the supplied editor screenshots to the README and usage guide.

### Preview and cancellation

- Open the display-animation preview automatically for new Java Display Animation projects, preserving existing display animation switches.
- Cancel the bounds-mode chooser with the close button or Escape without starting a scan.
- Use the native cancellation indices for export confirmations and hand-rig deletion as well.
- Show the Minecraft Java 1.21.11+ player-skin arm notice before enabling arms.

### Menu organization

- Group Project Settings, display preview, first-person preview, bounds checks and pack export under **Tools > Java Display Animator**.
- Keep the first-person preview entry in Animate mode and retain **File > Export** and command search.
- Register the Tools menu once to avoid duplicate entries from the legacy menu alias.
- Remove stale first-person timeline buttons during plugin reloads, keeping one button.

### Maintainer feedback

- Hide internal animation and export object properties from Blockbench's native project form. The settings remain saved in `.bbmodel` files.
- Add **Export Resource Pack and Datapack** to **File > Export**, retaining the existing Tools entry and command search.
- Use Blockbench's inherited text size for small panel labels, hints and bounds results.

### Features since the official 1.0.0 release

- Dockable first-person preview synchronized with the official animation timeline.
- Multiple animation tracks and configurable sampling at 1–20 FPS.
- Optional player-skin arms in first-person views. Generated core shaders are incompatible with shader packs; arm scale animation is unsupported.
- Quick and exact bounds checks with isolated baking, model deduplication and transactional insertion into existing packs.

This update retains the functionality of the supplied 1.1.2 test build. The unfinished 1.1.3 model library and component slots are outside this release.

## 1.0.0

The initial official plugin was merged into `JannisX11/blockbench-plugins` on October 3, 2026, through [PR #968](https://github.com/JannisX11/blockbench-plugins/pull/968).
