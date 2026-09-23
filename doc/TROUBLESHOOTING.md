# Troubleshooting · 排查

## FAQ

### Purple-and-black missing texture

- First confirm that the exported pack is enabled under **Options → Resource Packs**. `F3+T` reloads
  enabled packs but does not enable a newly copied pack.
- Confirm every visible cube face has a project texture.
- A UV-resolution mismatch usually causes shifted, stretched, or cropped texture regions rather
  than a purple-and-black placeholder. Still confirm that Project Settings match the intended UV
  workflow.
- Re-export and reload resources with `F3+T`; leaving and re-entering a world does not necessarily
  reload the active resource pack.
- Inspect the client game directory's `logs/latest.log`, not the server log. Resource failures are
  commonly logged once during world entry or `F3+T`; search for `Missing texture`,
  `Unable to load model`, `Failed to load`, `item_model`, and `atlas`.
- The `Reloading ResourceManager` list should include the exported pack. A list containing only
  `vanilla` and mods means that the pack is not enabled.

### In-game position differs from Display mode

- Reopen Display mode and confirm the transform currently shown by Blockbench.
- Export again after the final transform change.
- Do not reuse generated models from an older export or convert the project to a centered-grid format.

### Animation does not play in one view

- Select that display context in Display mode and enable **Animate Current Display Context**.
- Confirm the datapack is loaded and run
  `play {animation:"<exported-key>",mode:"loop"}` while holding the generated item in the main hand.
- Confirm the key exactly matches the Export Complete dialog. An invalid key passed to `play`
  reports an error and rejects the new request. Only a missing or invalid `strings[0]` value in item
  data uses the resource-model fallback to the default animation track.
- Confirm the item uses the generated `minecraft:item_model` component.
