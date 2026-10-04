import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(new URL("../src/export-animation-settings.ts", import.meta.url));
const entry = `
  globalThis.tl = key => key;
  globalThis.Project = { saved: true, name: "Resin Gun" };
  globalThis.Animation = { all: [], selected: null };
  const { initialExportSettings, rememberExportSettings } = await import(${JSON.stringify(modulePath)});
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const animation = (uuid, name) => ({ uuid, name });
  const a = animation("a", "Reload"), b = animation("b", "Fire"), c = animation("c", "Inspect");
  const animations = [a, b, c];
  Animation.all = animations;

  delete Project.display_anim_export_settings;
  Animation.selected = b;
  let value = initialExportSettings(animations);
  assert(value.version === 7 && value.selectedAnimationUuids.join() === "b", "new project selection is wrong");
  assert(value.handRenderingEnabled === false, "hand rendering should default to disabled");
  assert(value.animationFps === 20, "new projects should default to Minecraft's 20 FPS limit");
  assert(value.exactBoundsOnExport === true, "exact export bounds check should default to enabled");
  assert(value.defaultAnimationUuid === "b", "new project default is wrong");
  assert(value.projectName === "resin_gun" && value.packName === "resin_gun", "project defaults are wrong");
  assert(value.writeMode === "create" && value.outputMode === "both_default", "mode defaults are wrong");
  assert(value.frameObjective.length <= 16 && value.modeObjective.length <= 16 && value.maxFrameObjective.length <= 16,
    "generated scoreboard names exceed Minecraft's limit");
  assert(new Set([value.frameObjective, value.modeObjective, value.maxFrameObjective]).size === 3,
    "generated scoreboards are not distinct");
  assert(value.playingTag.length > 16 && /^[A-Za-z0-9._+\\-]+$/.test(value.playingTag),
    "generated playback tag should remain valid without applying the objective-name limit");

  // Version 1 is deliberately incompatible and must not leak old namespaces or selections.
  Project.display_anim_export_settings = { version: 1, selectedAnimationUuids: ["a"], defaultAnimationUuid: "a", assetNamespace: "old" };
  value = initialExportSettings(animations);
  assert(value.selectedAnimationUuids.join() === "b", "legacy v1 settings were restored");
  assert(!("assetNamespace" in value) && !("dataNamespace" in value), "namespace fields remain in v2 settings");

  Project.display_anim_export_settings = {
    version: 2, selectedAnimationUuids: ["c", "deleted", "a"], defaultAnimationUuid: "deleted",
    packName: "map_pack", projectName: "resin_gun", outputMode: "resource_only", writeMode: "insert",
    baseItem: "minecraft:stick", displayName: "Test Gun", frameObjective: "frame", modeObjective: "mode",
    maxFrameObjective: "max", playingTag: "playing", sharedRoot: "/maps",
    resourcePackFolder: "/resource", datapackFolder: "/data"
  };
  Animation.selected = c;
  value = initialExportSettings(animations);
  assert(value.selectedAnimationUuids.join() === "c,a", "stored UUIDs were not filtered/restored");
  assert(value.defaultAnimationUuid === "c", "invalid default did not prefer current selected export");
  assert(value.packName === "map_pack" && value.writeMode === "insert" && value.baseItem === "minecraft:stick",
    "stored export fields were not restored");

  // The short-lived v5 test schema is accepted, but command-driven playback no longer stores its behavior field.
  Project.display_anim_export_settings = {
    ...Project.display_anim_export_settings, version: 5, heldItemBehavior: "resume"
  };
  value = initialExportSettings(animations);
  assert(value.version === 7 && !("heldItemBehavior" in value) && value.animationFps === 20,
    "v5 test settings were not normalized to v7");

  Project.display_anim_export_settings = {
    ...Project.display_anim_export_settings, version: 6, handRenderingEnabled: undefined
  };
  value = initialExportSettings(animations);
  assert(value.version === 7 && value.handRenderingEnabled === false,
    "v6 settings did not migrate with hand rendering disabled");

  Project.display_anim_export_settings = { ...Project.display_anim_export_settings, selectedAnimationUuids: ["deleted"], defaultAnimationUuid: "deleted" };
  value = initialExportSettings(animations);
  assert(value.selectedAnimationUuids.length === 0 && value.defaultAnimationUuid === "",
    "all-deleted remembered selection silently chose a new animation");

  const chosen = ["a", "c"];
  Project.saved = true;
  rememberExportSettings({
    selectedAnimationUuids: chosen, defaultAnimationUuid: "c", packName: "map_pack", projectName: "resin_gun",
    outputMode: "both_separate", writeMode: "insert", baseItem: "minecraft:stick", displayName: "Test Gun",
    frameObjective: "frame", modeObjective: "mode", maxFrameObjective: "max", playingTag: "playing",
    debugEnabled: true, handRenderingEnabled: true, handRigRootUuid: "root", handLeftGroupUuid: "left",
    handRightGroupUuid: "right", handPreviewTextureUuid: "skin",
    exactBoundsOnExport: false, animationFps: 12,
    sharedRoot: "/maps", resourcePackFolder: "/resource", datapackFolder: "/data"
  });
  chosen.push("b");
  const stored = Project.display_anim_export_settings;
  assert(Project.saved === false && stored.version === 7, "successful memory did not dirty project/write v7");
  assert(stored.selectedAnimationUuids.join() === "a,c", "stored UUID list was not cloned");
  assert(stored.projectName === "resin_gun" && stored.writeMode === "insert", "complete settings were not remembered");
  assert(stored.debugEnabled === true, "developer tips selection was not remembered");
  assert(stored.handRenderingEnabled === true, "hand rendering selection was not remembered");
  assert(stored.version === 7 && stored.handLeftGroupUuid === "left" && stored.handSkinModel === undefined && stored.handSleevesVisible === undefined,
    "v7 hand binding settings were not remembered");
  assert(stored.exactBoundsOnExport === false, "exact bounds export selection was not remembered");
  assert(stored.animationFps === 12, "animation FPS was not remembered");
  process.stdout.write(JSON.stringify(stored));
`;

await importTestBundle(entry, { sourcefile: "settings-test.ts", define: { __DAP_FORCE_LANGUAGE__: "null" } });
