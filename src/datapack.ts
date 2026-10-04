/** Builds the Minecraft 26.2 datapack that drives baked JSB item animations. */

import { EXPORT_NAMESPACE, MAX_EXPORT_FPS, phaseObjectiveFor } from "./export-layout";
import { isValidAnimationKey } from "./animation-export-plan";
import { tr } from "./i18n";

const DATA_PACK_FORMAT: [number, number] = [107, 1];

export interface DatapackAnimation {
  key: string;
  displayName: string;
  frameCount: number;
}

export interface DatapackOptions {
  packName: string;
  projectName: string;
  baseItem: string;
  itemDisplayName: string;
  frameObjective: string;
  modeObjective: string;
  maxFrameObjective: string;
  playingTag: string;
  playbackFps: number;
  animations: DatapackAnimation[];
  defaultAnimationKey: string;
  description: string;
  debugEnabled?: boolean;
  handRenderingEnabled?: boolean;
}

export interface DatapackFile {
  path: string;
  content: string;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function lines(...commands: string[]): string {
  return `${commands.join("\n")}\n`;
}

function prefix(options: DatapackOptions): string {
  return JSON.stringify({ text: `[${options.packName}] `, color: "gold" });
}

function tellraw(
  options: DatapackOptions,
  message: string,
  color: string,
  target = "@s"
): string {
  return `tellraw ${target} [${prefix(options)},{"text":${JSON.stringify(message)},"color":"${color}"}]`;
}

function dynamicErrorTellraw(
  options: DatapackOptions,
  translationKey: string,
  placeholder: string,
  storagePath: string,
  runtimeStorage: string
): string {
  const marker = "__JSB_DYNAMIC_ARGUMENT__";
  const translated = tr(translationKey, { [placeholder]: marker });
  const parts = translated.includes(marker) ? translated.split(marker) : [`${translated}: `, ""];
  const components: Array<Record<string, unknown>> = [
    { text: `[${options.packName}] `, color: "gold" },
  ];
  parts.forEach((part, index) => {
    if (part) components.push({ text: part, color: "red" });
    if (index < parts.length - 1) {
      components.push({ nbt: storagePath, storage: runtimeStorage, color: "yellow" });
    }
  });
  return `tellraw @s ${JSON.stringify(components)}`;
}

function customNameComponent(name: string): string {
  const component = JSON.stringify({ text: name, color: "gold", italic: false });
  return `minecraft:custom_name=${component}`;
}

function customModelData(animationKey: string, frame: number): string {
  return `{strings:[${JSON.stringify(animationKey)}],floats:[${frame.toFixed(1)}]}`;
}

function itemAnimationState(
  projectName: string,
  animationKey: string,
  frame: number,
  mode: number,
  max: number,
  phase: number
): string {
  const state = itemAnimationStateValue(projectName, animationKey, frame, mode, max, phase);
  return `{jsb:{project:${JSON.stringify(state.jsb.project)},animation:${JSON.stringify(state.jsb.animation)},frame:${state.jsb.frame},mode:${state.jsb.mode},max:${state.jsb.max},phase:${state.jsb.phase}}}`;
}

function itemAnimationStateValue(
  projectName: string,
  animationKey: string,
  frame: number,
  mode: number,
  max: number,
  phase: number
): { jsb: { project: string; animation: string; frame: number; mode: number; max: number; phase: number } } {
  return { jsb: { project: projectName, animation: animationKey, frame, mode, max, phase } };
}

function frameModifier(frameObjective: string, animationKey?: string): Record<string, unknown> {
  const modifier: Record<string, unknown> = {
    function: "minecraft:set_custom_model_data",
    floats: {
      values: [{ type: "minecraft:score", target: "this", score: frameObjective }],
      mode: "replace_all",
    },
  };
  if (animationKey !== undefined) {
    modifier.strings = { values: [animationKey], mode: "replace_all" };
  }
  return modifier;
}

function fixedFrameModifier(animationKey: string, frame: number): Record<string, unknown> {
  return {
    function: "minecraft:set_custom_model_data",
    strings: { values: [animationKey], mode: "replace_all" },
    floats: { values: [frame], mode: "replace_all" },
  };
}

function validateAnimations(options: DatapackOptions): Map<string, DatapackAnimation> {
  if (!options.animations.length) throw new Error("At least one animation is required");
  const animations = new Map<string, DatapackAnimation>();
  for (const animation of options.animations) {
    if (!isValidAnimationKey(animation.key)) {
      throw new Error(`Unsafe animation key: ${JSON.stringify(animation.key)}`);
    }
    if (!Number.isInteger(animation.frameCount) || animation.frameCount < 1) {
      throw new Error(`Animation ${JSON.stringify(animation.key)} has no frames`);
    }
    if (animations.has(animation.key)) {
      throw new Error(`Duplicate animation key: ${JSON.stringify(animation.key)}`);
    }
    animations.set(animation.key, animation);
  }
  if (!animations.has(options.defaultAnimationKey)) {
    throw new Error(`Default animation key was not exported: ${options.defaultAnimationKey}`);
  }
  return animations;
}

export function buildDatapack(options: DatapackOptions): DatapackFile[] {
  if (!Number.isInteger(options.playbackFps) || options.playbackFps < 1 || options.playbackFps > MAX_EXPORT_FPS) {
    throw new Error(`Playback FPS must be an integer from 1 to ${MAX_EXPORT_FPS}: ${options.playbackFps}`);
  }
  const animations = validateAnimations(options);
  const ns = EXPORT_NAMESPACE;
  const root = options.projectName;
  const id = (path: string): string => `${ns}:${root}/${path}`;
  const runtimeStorage = `${ns}:${root}/runtime`;
  const itemModelId = `${ns}:${root}`;
  const heldItem = `*[minecraft:item_model="${itemModelId}"]`;
  const ifHeld = `execute if items entity @s weapon.mainhand ${heldItem} run`;
  const unlessHeld = `execute unless items entity @s weapon.mainhand ${heldItem} run`;
  const frameScore = options.frameObjective;
  const modeScore = options.modeObjective;
  const maxFrameScore = options.maxFrameObjective;
  const phaseScore = phaseObjectiveFor(frameScore);
  const playbackFps = options.playbackFps;
  const tag = options.playingTag;
  // With developer tips off the datapack is fully silent: no tellraw feedback
  // or error messages, while command control flow (return codes) stays intact.
  const tips = options.debugEnabled === true;
  const holdItemLines = tips
    ? [`${unlessHeld} ${tellraw(options, tr("dap.datapack.hold_item"), "red")}`]
    : [];
  const defaultAnimation = animations.get(options.defaultAnimationKey)!;
  const defaultLastFrame = defaultAnimation.frameCount - 1;
  const inventorySlots = [
    ...Array.from({ length: 9 }, (_, slot) => `hotbar.${slot}`),
    ...Array.from({ length: 27 }, (_, slot) => `inventory.${slot}`),
    "weapon.offhand",
  ];
  const onceItem = `*[minecraft:item_model="${itemModelId}",minecraft:custom_data~{jsb:{project:${JSON.stringify(root)},mode:2}}]`;
  const files: DatapackFile[] = [];
  const fn = (path: string, content: string): void => {
    files.push({ path: `data/${ns}/function/${root}/${path}.mcfunction`, content });
  };

  files.push({
    path: "pack.mcmeta",
    content: json({
      pack: {
        description: options.description,
        min_format: DATA_PACK_FORMAT,
        max_format: DATA_PACK_FORMAT,
      },
    }),
  });

  fn(
    "load",
    lines(
      `scoreboard objectives add ${frameScore} dummy`,
      `scoreboard objectives add ${modeScore} dummy`,
      `scoreboard objectives add ${maxFrameScore} dummy`,
      `scoreboard objectives add ${phaseScore} dummy`,
      ...(options.debugEnabled ? [tellraw(options, tr("dap.datapack.loaded", { namespace: `${ns}:${root}` }), "green", "@a")] : [])
    )
  );
  fn(
    "tick",
    lines(
      `execute as @a if items entity @s weapon.mainhand ${heldItem} run function ${id("_internal/sync_held")}`,
      `execute as @a[tag=${tag}] unless items entity @s weapon.mainhand ${heldItem} run function ${id("_internal/leave_held")}`
    )
  );

  fn(
    "_internal/load_held_state",
    lines(
      `scoreboard players set @s ${frameScore} 0`,
      `scoreboard players set @s ${modeScore} 0`,
      `scoreboard players set @s ${maxFrameScore} ${defaultLastFrame}`,
      `scoreboard players set @s ${phaseScore} 0`,
      `data modify storage ${runtimeStorage} held set value ${itemAnimationState(root, defaultAnimation.key, 0, 0, defaultLastFrame, 0).slice(5, -1)}`,
      `execute store result score @s ${frameScore} run data get entity @s SelectedItem.components."minecraft:custom_data".jsb.frame 1`,
      `execute store result score @s ${modeScore} run data get entity @s SelectedItem.components."minecraft:custom_data".jsb.mode 1`,
      `execute store result score @s ${maxFrameScore} run data get entity @s SelectedItem.components."minecraft:custom_data".jsb.max 1`,
      `execute store result score @s ${phaseScore} run data get entity @s SelectedItem.components."minecraft:custom_data".jsb.phase 1`,
      ...Array.from(animations.values(), (animation) =>
        `execute if items entity @s weapon.mainhand *[minecraft:item_model="${itemModelId}",minecraft:custom_data~{jsb:{project:${JSON.stringify(root)},animation:${JSON.stringify(animation.key)}}}] run data modify storage ${runtimeStorage} held.animation set value ${JSON.stringify(animation.key)}`
      )
    )
  );
  fn(
    "_internal/save_scores_to_storage",
    lines(
      `execute store result storage ${runtimeStorage} held.frame int 1 run scoreboard players get @s ${frameScore}`,
      `execute store result storage ${runtimeStorage} held.mode int 1 run scoreboard players get @s ${modeScore}`,
      `execute store result storage ${runtimeStorage} held.max int 1 run scoreboard players get @s ${maxFrameScore}`,
      `execute store result storage ${runtimeStorage} held.phase int 1 run scoreboard players get @s ${phaseScore}`
    )
  );
  fn(
    "_internal/apply_animation_from_storage",
    lines(...Array.from(animations.values(), (animation) =>
      `execute if data storage ${runtimeStorage} {held:{animation:${JSON.stringify(animation.key)}}} run item modify entity @s weapon.mainhand ${id(`set_frame/${animation.key}`)}`
    ))
  );
  fn(
    "_internal/save_held_state",
    lines(
      `function ${id("_internal/save_scores_to_storage")}`,
      `item modify entity @s weapon.mainhand ${id("state/copy_from_storage")}`,
      `function ${id("_internal/apply_animation_from_storage")}`
    )
  );
  fn(
    "_internal/reset_inactive_once",
    lines(...inventorySlots.map((slot) =>
      `execute if items entity @s ${slot} ${onceItem} run item modify entity @s ${slot} ${id("state/reset_default")}`
    ))
  );
  fn(
    "_internal/sync_held",
    lines(
      `function ${id("_internal/load_held_state")}`,
      `execute if entity @s[tag=${tag}] run function ${id("_internal/reset_inactive_once")}`,
      `function ${id("_internal/save_held_state")}`,
      `execute if score @s ${modeScore} matches 1..2 run tag @s add ${tag}`,
      `execute unless score @s ${modeScore} matches 1..2 run tag @s remove ${tag}`,
      `execute if score @s ${modeScore} matches 1..2 run function ${id("_internal/tick_player")}`
    )
  );
  fn(
    "_internal/leave_held",
    lines(
      `function ${id("_internal/reset_inactive_once")}`,
      `function ${id("_internal/cancel")}`
    )
  );

  fn(
    "_internal/tick_player",
    lines(
      `scoreboard players add @s ${phaseScore} ${playbackFps}`,
      `execute if score @s ${phaseScore} matches 20.. if score @s ${modeScore} matches 2 if score @s ${frameScore} = @s ${maxFrameScore} run function ${id("_internal/reset_default")}`,
      `execute if entity @s[tag=${tag}] if score @s ${phaseScore} matches 20.. run scoreboard players add @s ${frameScore} 1`,
      `execute if entity @s[tag=${tag}] if score @s ${phaseScore} matches 20.. run scoreboard players remove @s ${phaseScore} 20`,
      `execute if entity @s[tag=${tag}] if score @s ${maxFrameScore} matches 0 if score @s ${frameScore} > @s ${maxFrameScore} run scoreboard players set @s ${frameScore} 0`,
      `execute if entity @s[tag=${tag}] if score @s ${maxFrameScore} matches 1.. if score @s ${frameScore} > @s ${maxFrameScore} run scoreboard players set @s ${frameScore} 1`,
      `execute if entity @s[tag=${tag}] run function ${id("_internal/save_held_state")}`
    )
  );
  fn(
    "_internal/cancel",
    lines(
      `tag @s remove ${tag}`,
      `scoreboard players set @s ${frameScore} 0`,
      `scoreboard players set @s ${modeScore} 0`,
      `scoreboard players set @s ${maxFrameScore} ${defaultLastFrame}`,
      `scoreboard players set @s ${phaseScore} 0`
    )
  );
  fn(
    "_internal/reset_default",
    lines(
      `function ${id("_internal/cancel")}`,
      `${ifHeld} item modify entity @s weapon.mainhand ${id("state/reset_default")}`
    )
  );

  fn(
    "give",
    lines(
      options.handRenderingEnabled
        ? `loot give @s loot ${id("give")}`
        : `give @s ${options.baseItem}[minecraft:item_model="${itemModelId}",minecraft:custom_model_data=${customModelData(defaultAnimation.key, 0)},minecraft:custom_data=${itemAnimationState(root, defaultAnimation.key, 0, 0, defaultLastFrame, 0)},minecraft:max_stack_size=1,${customNameComponent(options.itemDisplayName)}]`,
      ...(options.debugEnabled ? [tellraw(options, tr("dap.datapack.item_given", {
        namespace: `${ns}:${root}`,
        animation: defaultAnimation.key,
      }), "green")] : [])
    )
  );
  if (options.handRenderingEnabled) {
    files.push({
      path: `data/${ns}/loot_table/${root}/give.json`,
      content: json({
        type: "minecraft:command",
        pools: [{
          rolls: 1,
          entries: [{
            type: "minecraft:item",
            name: "minecraft:player_head",
            functions: [
              {
                function: "minecraft:set_components",
                components: {
                  "minecraft:item_model": itemModelId,
                  "minecraft:custom_model_data": { strings: [defaultAnimation.key], floats: [0] },
                  "minecraft:custom_data": itemAnimationStateValue(root, defaultAnimation.key, 0, 0, defaultLastFrame, 0),
                  "minecraft:max_stack_size": 1,
                  "minecraft:custom_name": { text: options.itemDisplayName, color: "gold", italic: false },
                },
              },
              { function: "minecraft:fill_player_head", entity: "this" },
            ],
          }],
        }],
      }),
    });
  }
  fn(
    "_internal/validate_animation",
    lines(
      `data modify storage ${runtimeStorage} request.valid_animation set value 0b`,
      ...Array.from(animations.values(), (animation) =>
        `execute if data storage ${runtimeStorage} {request:{animation:${JSON.stringify(animation.key)}}} run data modify storage ${runtimeStorage} request.valid_animation set value 1b`
      )
    )
  );
  fn(
    "_internal/validate_mode",
    lines(
      `data modify storage ${runtimeStorage} request.valid_mode set value 0b`,
      `execute if data storage ${runtimeStorage} {request:{mode:"loop"}} run data modify storage ${runtimeStorage} request.valid_mode set value 1b`,
      `execute if data storage ${runtimeStorage} {request:{mode:"once"}} run data modify storage ${runtimeStorage} request.valid_mode set value 1b`
    )
  );
  fn(
    "_internal/error/invalid_animation",
    lines(
      ...(tips
        ? [
            dynamicErrorTellraw(
              options,
              "dap.datapack.invalid_animation",
              "animation",
              "request.animation",
              runtimeStorage
            ),
          ]
        : ["return 0"])
    )
  );
  fn(
    "_internal/error/invalid_mode",
    lines(
      ...(tips
        ? [
            dynamicErrorTellraw(
              options,
              "dap.datapack.invalid_mode",
              "mode",
              "request.mode",
              runtimeStorage
            ),
          ]
        : ["return 0"])
    )
  );

  fn(
    "play",
    lines(
      ...holdItemLines,
      `${unlessHeld} return 0`,
      `data remove storage ${runtimeStorage} request`,
      `$data modify storage ${runtimeStorage} request.animation set value "$(animation)"`,
      `$data modify storage ${runtimeStorage} request.mode set value "$(mode)"`,
      `function ${id("_internal/validate_animation")}`,
      `execute unless data storage ${runtimeStorage} {request:{valid_animation:1b}} run function ${id("_internal/error/invalid_animation")}`,
      `execute unless data storage ${runtimeStorage} {request:{valid_animation:1b}} run return 0`,
      `function ${id("_internal/validate_mode")}`,
      `execute unless data storage ${runtimeStorage} {request:{valid_mode:1b}} run function ${id("_internal/error/invalid_mode")}`,
      `execute unless data storage ${runtimeStorage} {request:{valid_mode:1b}} run return 0`,
      `$function ${id("_internal/play/$(animation)/$(mode)")}`
    )
  );
  fn(
    "frame",
    lines(
      ...holdItemLines,
      `${unlessHeld} return 0`,
      `data remove storage ${runtimeStorage} request`,
      `$data modify storage ${runtimeStorage} request.animation set value "$(animation)"`,
      `function ${id("_internal/validate_animation")}`,
      `execute unless data storage ${runtimeStorage} {request:{valid_animation:1b}} run function ${id("_internal/error/invalid_animation")}`,
      `execute unless data storage ${runtimeStorage} {request:{valid_animation:1b}} run return 0`,
      `$function ${id("_internal/frame/$(animation)")} {frame:$(frame)}`
    )
  );
  fn(
    "stop",
    lines(
      ...holdItemLines,
      `${unlessHeld} return 0`,
      `function ${id("_internal/reset_default")}`,
      ...(tips ? [tellraw(options, tr("dap.datapack.stopped"), "yellow")] : [])
    )
  );

  for (const animation of animations.values()) {
    const lastFrame = animation.frameCount - 1;
    const firstMotionFrame = lastFrame >= 1 ? 1 : 0;
    const start = [
      `scoreboard players set @s ${frameScore} ${firstMotionFrame}`,
      `scoreboard players set @s ${maxFrameScore} ${lastFrame}`,
      `scoreboard players set @s ${phaseScore} 0`,
      `data modify storage ${runtimeStorage} held set value {project:${JSON.stringify(root)},animation:${JSON.stringify(animation.key)},frame:${firstMotionFrame},mode:0,max:${lastFrame},phase:0}`,
    ];
    const finish = [
      `function ${id("_internal/save_held_state")}`,
      `tag @s add ${tag}`,
    ];
    fn(
      `_internal/play/${animation.key}/loop`,
      lines(
        ...start,
        `scoreboard players set @s ${modeScore} 1`,
        ...finish,
        ...(tips
          ? [tellraw(options, tr("dap.datapack.loop_started", {
              animation: animation.displayName,
              fps: options.playbackFps,
              last_frame: lastFrame,
            }), "green")]
          : [])
      )
    );
    fn(
      `_internal/play/${animation.key}/once`,
      lines(
        ...start,
        `scoreboard players set @s ${modeScore} 2`,
        ...finish,
        ...(tips
          ? [tellraw(options, tr("dap.datapack.once_started", {
              animation: animation.displayName,
              last_frame: lastFrame,
            }), "green")]
          : [])
      )
    );
    fn(
      `_internal/frame/${animation.key}`,
      lines(
        `tag @s remove ${tag}`,
        `scoreboard players set @s ${modeScore} 0`,
        `scoreboard players set @s ${maxFrameScore} ${lastFrame}`,
        `scoreboard players set @s ${frameScore} 0`,
        `scoreboard players set @s ${phaseScore} 0`,
        `data modify storage ${runtimeStorage} held set value {project:${JSON.stringify(root)},animation:${JSON.stringify(animation.key)},frame:0,mode:0,max:${lastFrame},phase:0}`,
        `$scoreboard players set @s ${frameScore} $(frame)`,
        `execute if score @s ${frameScore} matches ..-1 run scoreboard players set @s ${frameScore} 0`,
        `execute if score @s ${frameScore} > @s ${maxFrameScore} run scoreboard players operation @s ${frameScore} = @s ${maxFrameScore}`,
        `function ${id("_internal/save_held_state")}`
      )
    );

    // Short, discoverable developer/test entry points.
    fn(
      `play/${animation.key}`,
      lines(`function ${id("play")} {animation:${JSON.stringify(animation.key)},mode:"once"}`)
    );
    fn(
      `loop/${animation.key}`,
      lines(`function ${id("play")} {animation:${JSON.stringify(animation.key)},mode:"loop"}`)
    );
    fn(
      `frame/${animation.key}`,
      lines(`$function ${id("frame")} {animation:${JSON.stringify(animation.key)},frame:$(frame)}`)
    );

    files.push({
      path: `data/${ns}/item_modifier/${root}/set_frame/${animation.key}.json`,
      content: json(frameModifier(frameScore, animation.key)),
    });
  }

  files.push({
    path: `data/${ns}/item_modifier/${root}/set_frame.json`,
    content: json(frameModifier(frameScore)),
  });
  files.push({
    path: `data/${ns}/item_modifier/${root}/state/copy_from_storage.json`,
    content: json({
      function: "minecraft:copy_custom_data",
      source: { type: "minecraft:storage", source: runtimeStorage },
      ops: [{ source: "held", target: "jsb", op: "replace" }],
    }),
  });
  files.push({
    path: `data/${ns}/item_modifier/${root}/state/reset_default.json`,
    content: json([
      {
        function: "minecraft:set_custom_data",
        tag: itemAnimationState(root, defaultAnimation.key, 0, 0, defaultLastFrame, 0),
      },
      fixedFrameModifier(defaultAnimation.key, 0),
    ]),
  });
  files.push({
    path: "data/minecraft/tags/function/load.json",
    content: json({ values: [id("load")] }),
  });
  files.push({
    path: "data/minecraft/tags/function/tick.json",
    content: json({ values: [id("tick")] }),
  });
  return files;
}
