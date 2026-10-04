/** Minecraft 26.2 first-person player-skin hand rendering assets. */

import entityFragmentShader from "./shaders/entity.fsh";
import entityVertexShader from "./shaders/entity.vsh";
import {
  animatedHandDisplay,
  previewAlignedHandDisplay,
  type HandDisplayTransform,
  handSpecialTransformation,
  type HandPoseMatrix,
} from "./hand-pose";

export const HAND_SHADER_PATHS = new Set([
  "assets/minecraft/shaders/core/entity.vsh",
  "assets/minecraft/shaders/core/entity.fsh",
]);

const HIDDEN_CONTEXTS = [
  "gui",
  "fixed",
  "ground",
  "thirdperson_righthand",
  "thirdperson_lefthand",
  "head",
  "on_shelf",
];

function hiddenDisplays(): Record<string, { scale: number[] }> {
  return Object.fromEntries(HIDDEN_CONTEXTS.map((context) => [context, { scale: [0, 0, 0] }]));
}

export interface HandBasePaths {
  left: string;
  right: string;
}

export function handBaseModel(
  side: "left" | "right",
  particleTexture: string,
  pose?: HandPoseMatrix,
  display?: Record<string, Partial<HandDisplayTransform>>
): Record<string, unknown> {
  const animated = animatedHandDisplay(side, pose);
  return {
    textures: { particle: particleTexture },
    display: {
      firstperson_righthand: pose && display ? previewAlignedHandDisplay(side, pose, display.firstperson_righthand) : animated,
      firstperson_lefthand: pose && display ? previewAlignedHandDisplay(side, pose, display.firstperson_lefthand ?? display.firstperson_righthand, true) : animated,
      ...hiddenDisplays(),
    },
  };
}

export function playerSkinHands(model: unknown, projectName: string, bases?: HandBasePaths): unknown {
  const special = (side: "left" | "right") => ({
    type: "minecraft:special",
    base: bases?.[side] ?? `jsb:${projectName}/_hand/${side}`,
    model: { type: "minecraft:player_head" },
    transformation: handSpecialTransformation(),
  });
  return {
    type: "minecraft:composite",
    models: [model, special("left"), special("right")],
  };
}

export function handRenderingFiles(projectName: string, particleTexture: string): Array<{ path: string; content: string }> {
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  return [
    {
      path: `assets/jsb/models/${projectName}/_hand/left.json`,
      content: json(handBaseModel("left", particleTexture)),
    },
    {
      path: `assets/jsb/models/${projectName}/_hand/right.json`,
      content: json(handBaseModel("right", particleTexture)),
    },
    { path: "assets/minecraft/shaders/core/entity.vsh", content: entityVertexShader },
    { path: "assets/minecraft/shaders/core/entity.fsh", content: entityFragmentShader },
  ];
}
