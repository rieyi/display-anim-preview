# Usage · 用法

Full walkthrough for Java Display Animator. For the short overview, see [README.md](../README.md).

## Steps

### 1. Create or open a project

1. Select **File → New → Java Display Animation**.
2. Create the item geometry, groups, and textures.
3. Create one or more group animations in Blockbench's **Animate** mode. The preview panel continues
   to play the currently selected single animation; choose the animations to export in the separate
   export list.
4. Set a project animation rate from 1 to 20 FPS. It controls preview, export sampling, bounds checks, and in-game playback.

The format uses Minecraft's non-centered item-model grid. Do not convert the project to a centered
format before export, because that changes the coordinate basis used by Display transforms.

### 2. Configure Minecraft display transforms

1. Switch to Blockbench's **Display** mode.
2. Adjust rotation, translation, and scale for GUI, first person, third person, ground, head, item
   frame, and any other available display contexts.
3. Save the project before a large export.

The exporter snapshots Blockbench's current compiled `display` settings at export start and applies
the same snapshot to every baked frame. The in-game position should therefore match the current
Display-mode preview rather than an older per-frame transform.

### 3. Choose which display contexts animate

1. Open the Command Palette with `Ctrl+P` on Windows/Linux or `Cmd+P` on macOS.
2. Run **Open Display Animation Preview**.
3. Select a display context in the panel.
4. In Display mode, enable or disable **Animate Current Display Context**.
5. Repeat for every context you need.

A common setup is:

| Display context | Suggested setting |
|---|---|
| GUI / inventory | Off |
| Third-person hands | Off |
| First-person hands | On |
| Ground, head, item frame | Off unless animation is intended there |

Each switch is saved independently in the `.bbmodel`. Turning animation off pauses that context,
returns it to frame 0, and disables its preview play button. The animation switch is intentionally
shown only in Display mode.

### 4. Preview playback

- Use Play/Pause in the plugin panel or Blockbench's official animation controls; both control the
  same timeline.
- Use Loop to change the official loop state.
- Use Low FPS to quantize the preview to the animation snapping rate and approximate non-interpolated
  in-game playback.
- Scrub the panel timeline to inspect individual poses.

### 5. Check model bounds

Run **Check Animation Model Bounds** from the Command Palette, then choose Quick Math Check or Exact
Isolated Check. Quick mode avoids Undo and is intended for fast authoring feedback. Exact mode clones
the project into a disposable in-memory project and validates final Java models, whose coordinates must
remain between `-16` and `32`. Both modes show cancellable progress and reuse unchanged per-animation
results during the current Blockbench session.
The multi-animation export report identifies every out-of-range frame with the animation's original
name, generated key, and local frame. Inspect it in Minecraft with
`frame/<key> {frame:<frame>}` before reducing the affected motion in Blockbench.

### 6. Export the resource pack and datapack

1. Run **Export Resource Pack and Datapack** from the Command Palette.
2. On the first page, select the animations to export from the persistent checklist. Each row shows
   the original name, generated key, duration, source FPS, and 20 FPS output-frame count. **Select
   All** and **Select None** are also available. For example, `TPS Reload` becomes `tps_reload`.
3. Select at least one animation. An empty key, `.` or `..`, or a key collision after sanitization
   prevents export until the conflicting animations are renamed.
4. On the second page, select the default animation from the checked animations. Static display
   contexts and invalid animation keys use frame 0 of this animation.
5. Choose an output mode:
   - Resource Pack + Datapack under one shared root;
   - Resource Pack + Datapack under separate parent folders;
   - Resource Pack only;
   - Datapack only.
6. Choose **Create New Pack** or **Insert into Existing Pack**, then review the pack name, project
   name, mapped item, display name, scoreboards, and playback tag. Both packs use the fixed `jsb` namespace.
7. Create mode selects a parent and creates the named pack folder. Insert mode selects an existing
   unpacked pack containing a valid `pack.mcmeta`, which is preserved.
8. The animation page can enable or disable **Run exact bounds check before export**. Resource models
   are isolated in a disposable project either way; disabling it suppresses range warnings and status.
9. If frame-rate, texture-resolution, or enabled model-bounds issues exist, the plugin combines every
   warning into one dialog. Files are generated only after **Export Anyway** is selected. Cancelling
   or closing the dialog writes nothing and displays an explicit cancellation message.

Open **Java Display Animator Project Settings** to edit general, animation, pack-file, datapack, and
developer-API pages while authoring. The first project state initially selects only Blockbench's
current animation. Changes are written immediately to the `.bbmodel` `display_anim_export_settings`
v6 property and mark the project as unsaved, but never save or overwrite it automatically. Resource
pack and datapack folders are remembered independently; an empty field asks during export.
A datapack-only export must be paired with a resource pack generated from the same animation-key and
frame-count mapping.

Every item created by `give` is unstackable and stores its animation, frame, mode, maximum frame, and
phase in its own `minecraft:custom_data.jsb`. Identical model items therefore keep independent state.
A one-shot `play` item resets after leaving the main hand; a `loop` item keeps its progress and resumes
when that same item is held again. `stop` resets only the currently held item.

The default shared-root layout is:

```text
selected-root/
├── resource-packs/<pack-name>/
└── datapacks/<pack-name>/
```

An animated display context first selects an animation key with
`custom_model_data.strings[0]`, then selects that animation's local frame with
`custom_model_data.floats[0]`. Static contexts directly use frame 0 of the default animation, and an
invalid key falls back to the default track. If every display context has animation disabled, the
exporter warns that the other selected animations will not be visible and writes only frame 0 of
the default animation. Model JSON is deduplicated globally across all animations while each
animation retains its own local frame sequence and statistics.

Resource files use `assets/jsb/items/<project>.json`,
`assets/jsb/models/<project>/<animation>/<slot>/<frame>.json`, `_generated` unique models, and
`assets/jsb/textures/<project>/...`. Only animated contexts create abbreviated slot folders; their
frame files are lightweight parent references. The resource-pack root uses `assets.jsbmeta`, while
the datapack root uses `data.jsbmeta`. These independent centralized manifests track project-owned
resource and driver files, allowing either format to evolve separately. Reinsertion updates only
manifest-owned project files, merges load/tick tags, blocks unmanaged collisions, and rolls back a
failed transaction.

Files have been written and verified only when the **Export Complete** dialog appears. It reports
animation keys and per-animation frame statistics, unique model files, deduplicated frames, model
JSON size, omitted untextured faces, output locations, and copyable in-game commands.

### 7. Install and test in Minecraft

1. Place the generated resource-pack directory in the Minecraft `resourcepacks` folder or the test
   server's configured resource-pack location.
2. Place the generated datapack directory in `<world>/datapacks/`.
3. Open **Options → Resource Packs**, move the newly copied pack to the selected side, and choose
   **Done**. Copying a directory into `resourcepacks` or pressing `F3+T` does not enable a pack that
   has not been selected.
4. Once the pack is enabled, use `F3+T` after re-exporting. Reload the datapack or reopen the world.
5. Replace `<project>` with the exported project name and use the short entries for normal testing:

```mcfunction
/function jsb:<project>/give
/function jsb:<project>/play/reload
/function jsb:<project>/loop/fire
/function jsb:<project>/frame/reload {frame:12}
/function jsb:<project>/stop
```

For dynamic map functions, use the macro API:

```mcfunction
/function jsb:<project>/play {animation:"reload",mode:"once"}
/function jsb:<project>/play {animation:"fire",mode:"loop"}
/function jsb:<project>/frame {animation:"reload",frame:12}
```

Replace `reload` and `fire` with keys shown in the Export Complete dialog. `mode` accepts only
`once` or `loop`. `give` and `stop` restore frame 0 of the default animation. `once` also restores
the default after showing its last frame for one game tick. `frame` stops automatic playback and
clamps the requested frame to the selected animation's valid range. Version 1.1.0 no longer generates
`play_loop`, `play_once`, `next`, `prev`, or `reset`.

Check GUI, first person, third person, ground, head, and item-frame views. Only display contexts whose
animation switch is enabled should change frames. Also test switching, looping, one-shot reset, and
manual frame selection with at least two animations of different lengths.
