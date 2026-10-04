/** Builds a complete Minecraft Java resource pack from baked animation sequences. */

import type { BakedFrame } from "./bake";
import { DISPLAY_CONTEXT_PATHS, EXPORT_NAMESPACE } from "./export-layout";
import {
  handBaseModel,
  handRenderingFiles,
  playerSkinHands,
  type HandBasePaths,
} from "./hand-rendering";
import { PREVIEW_TEXTURE_PROPERTY } from "./hand-rig";
import { tr } from "./i18n";

const RESOURCE_PACK_FORMAT: [number, number] = [88, 0];

export interface PackOptions {
  packName: string;
  projectName: string;
  description: string;
  defaultAnimationKey: string;
  displayContexts: PackDisplayContext[];
  handRenderingEnabled?: boolean;
}

export interface PackAnimationSequence {
  key: string;
  sourceName: string;
  frames: BakedFrame[];
}

export interface PackDisplayContext {
  context: string;
  animated: boolean;
}

export interface PackBuildReport {
  sampledFrames: number;
  uniqueModels: number;
  duplicateFrames: number;
  modelBytesBefore: number;
  modelBytesAfter: number;
  omittedUntexturedFaces: number;
  omittedEmptyElements: number;
  animatedContextFolders: string[];
  handRenderingEnabled: boolean;
  animations: PackAnimationReport[];
}

export interface PackAnimationReport {
  key: string;
  sourceName: string;
  sampledFrames: number;
}

export interface PackBuildResult {
  files: PackFile[];
  report: PackBuildReport;
}

export interface PackFile {
  path: string;
  /** Text content, or a PNG data URL when `isImage` is true. */
  content: string;
  isImage?: boolean;
}

interface ExportTexture {
  id: string;
  name: string;
  link: string;
  dataUrl: string;
}

interface SequenceModelPaths {
  key: string;
  sourceName: string;
  modelPaths: string[];
  handBasePaths: Array<HandBasePaths | undefined>;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sanitizeTextureName(name: string, fallbackIndex: number): string {
  const safe = name
    .replace(/\.png$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || `texture_${fallbackIndex}`;
}

function collectTextures(): ExportTexture[] {
  const used = new Set<string>();
  const previewTextureUuid = typeof Project === "undefined"
    ? undefined
    : (Project?.display_anim_export_settings as { handPreviewTextureUuid?: string } | undefined)?.handPreviewTextureUuid;
  return Texture.all.filter((texture) =>
    (!previewTextureUuid || texture.uuid !== previewTextureUuid) &&
    (texture as unknown as Record<string, unknown>)[PREVIEW_TEXTURE_PROPERTY] !== true &&
    texture.name !== "DAP_Default_Player_Skin.png" &&
    texture.name !== "missing.png"
  ).map((texture, index) => {
    const base = sanitizeTextureName(texture.name, index);
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}_${suffix++}`;
    used.add(name);
    return {
      id: String(texture.id),
      name,
      link: texture.javaTextureLink(),
      dataUrl: texture.getDataURL(),
    };
  });
}

/**
 * Rewrites raw texture references onto the generated jsb texture paths.
 * Mutates `model.textures` in place; the input frame model is single-use.
 */
function rewriteTextureRefs(
  model: { textures?: Record<string, string> },
  projectName: string,
  textures: ExportTexture[]
): void {
  if (!model.textures) return;

  for (const key of Object.keys(model.textures)) {
    const value = model.textures[key];
    if (value.startsWith("#")) continue;
    const valueStem = value.split("/").pop()?.replace(/\.png$/i, "");
    const texture = textures.find(
      (candidate) =>
        candidate.id === key ||
        candidate.link === value ||
        candidate.name === key ||
        candidate.name === valueStem
    );
    if (texture) model.textures[key] = `${EXPORT_NAMESPACE}:item/${projectName}/${texture.name}`;
  }
  if (!model.textures.particle) {
    const firstTextureKey = Object.keys(model.textures).find(
      (key) => key !== "particle" && !model.textures![key].startsWith("#")
    );
    if (firstTextureKey) model.textures.particle = `#${firstTextureKey}`;
  }
}

function sanitizeTextureRefs(
  model: {
    textures?: Record<string, string>;
    elements?: Array<{ name?: string; faces?: Record<string, { texture?: string }> }>;
  },
  projectName: string,
  textureNames: Set<string>
): { omittedFaces: number; omittedElements: number } {
  const prefix = `${EXPORT_NAMESPACE}:item/${projectName}/`;
  const textures = model.textures ?? {};
  let omittedFaces = 0;
  let omittedElements = 0;

  const validateResolvedTexture = (value: string, label: string): void => {
    if (!value.startsWith(prefix)) {
      throw new Error(tr("dap.error.external_texture", { label, value }));
    }
    const stem = value.slice(prefix.length);
    if (!textureNames.has(stem)) {
      throw new Error(tr("dap.error.texture_not_generated", { value }));
    }
  };

  const resolveTexture = (reference: string): string | null => {
    let value = reference;
    const visited = new Set<string>();
    while (value.startsWith("#")) {
      const key = value.slice(1);
      if (!key || key === "missing" || visited.has(key) || !textures[key]) return null;
      visited.add(key);
      value = textures[key];
    }
    return value;
  };

  for (const [key, rawValue] of Object.entries(textures)) {
    const value = resolveTexture(rawValue);
    if (value) validateResolvedTexture(value, `#${key}`);
  }
  for (const element of model.elements ?? []) {
    for (const [faceName, face] of Object.entries(element.faces ?? {})) {
      const value = face.texture ? resolveTexture(face.texture) : null;
      if (!value) {
        delete element.faces?.[faceName];
        omittedFaces++;
      } else {
        validateResolvedTexture(value, face.texture ?? faceName);
      }
    }
  }
  if (model.elements) {
    model.elements = model.elements.filter((element) => {
      if (Object.keys(element.faces ?? {}).length) return true;
      omittedElements++;
      return false;
    });
  }
  return { omittedFaces, omittedElements };
}

function animatedModel(sequence: SequenceModelPaths, projectName: string, includeHands: boolean): unknown {
  const frameModel = (frame: number): unknown => {
    const model = { type: "minecraft:model", model: sequence.modelPaths[frame] };
    return includeHands ? playerSkinHands(model, projectName, sequence.handBasePaths[frame]) : model;
  };
  if ([...new Set(sequence.modelPaths)].length === 1 &&
      (!includeHands || sequence.handBasePaths.every((paths) => JSON.stringify(paths) === JSON.stringify(sequence.handBasePaths[0])))) {
    return frameModel(0);
  }
  return {
    type: "minecraft:range_dispatch",
    property: "minecraft:custom_model_data",
    index: 0,
    fallback: frameModel(0),
    entries: sequence.modelPaths.map((_model, frame) => ({
      threshold: frame,
      model: frameModel(frame),
    })),
  };
}

function selectableAnimationModel(
  sequences: SequenceModelPaths[],
  defaultAnimationKey: string,
  projectName: string,
  includeHands: boolean
): unknown {
  const fallback = sequences.find((sequence) => sequence.key === defaultAnimationKey);
  if (!fallback) throw new Error(`Unknown default animation key: ${defaultAnimationKey}`);
  return {
    type: "minecraft:select",
    property: "minecraft:custom_model_data",
    index: 0,
    cases: sequences.map((sequence) => ({
      when: sequence.key,
      model: animatedModel(sequence, projectName, includeHands),
    })),
    fallback: animatedModel(fallback, projectName, includeHands),
  };
}

function buildItemDefinition(
  options: PackOptions,
  staticModelPath: string,
  contextSequences: Map<string, SequenceModelPaths[]>,
  defaultHandBases?: HandBasePaths
): string {
  const staticModel = { type: "minecraft:model", model: staticModelPath };
  const cases = options.displayContexts.map((route) => {
    const includeHands = options.handRenderingEnabled === true &&
      (route.context === "firstperson_righthand" || route.context === "firstperson_lefthand");
    const routedModel = route.animated
      ? selectableAnimationModel(
          contextSequences.get(route.context) ?? [],
          options.defaultAnimationKey,
          options.projectName,
          includeHands
        )
      : includeHands ? playerSkinHands(staticModel, options.projectName, defaultHandBases) : staticModel;
    return {
      when: route.context,
      model: routedModel,
    };
  });
  return json({
    model: {
      type: "minecraft:select",
      property: "minecraft:display_context",
      cases,
      fallback: staticModel,
    },
    swap_animation_scale: 0,
  });
}

export function buildResourcePack(
  sequences: PackAnimationSequence[],
  options: PackOptions
): PackBuildResult {
  if (!sequences.length || sequences.some((sequence) => !sequence.frames.length)) {
    throw new Error(tr("dap.error.no_models"));
  }
  const keys = new Set<string>();
  for (const sequence of sequences) {
    if (!sequence.key || keys.has(sequence.key)) {
      throw new Error(`Duplicate or empty animation key: ${sequence.key || "<empty>"}`);
    }
    keys.add(sequence.key);
  }
  if (!keys.has(options.defaultAnimationKey)) {
    throw new Error(`Unknown default animation key: ${options.defaultAnimationKey}`);
  }

  const files: PackFile[] = [];
  const assetRoot = `assets/${EXPORT_NAMESPACE}`;
  const modelRoot = `${assetRoot}/models/${options.projectName}`;
  const textures = collectTextures();
  const textureNames = new Set(textures.map((texture) => texture.name));
  const uniqueModels = new Map<string, string>();
  const basePaths = new Map<string, string[]>();
  let sampledFrames = 0;
  let modelBytesBefore = 0;
  let modelBytesAfter = 0;
  let omittedUntexturedFaces = 0;
  let omittedEmptyElements = 0;
  let particleTexture = "minecraft:block/white_concrete";

  files.push({
    path: "pack.mcmeta",
    content: json({
      pack: {
        description: options.description,
        min_format: RESOURCE_PACK_FORMAT,
        max_format: RESOURCE_PACK_FORMAT,
      },
    }),
  });
  if (options.handRenderingEnabled) {
    particleTexture = textures[0]
      ? `${EXPORT_NAMESPACE}:item/${options.projectName}/${textures[0].name}`
      : "minecraft:block/white_concrete";
    files.push(...handRenderingFiles(options.projectName, particleTexture));
  }

  const handModelPaths = new Map<string, HandBasePaths>();
  const resolveHandBasePaths = (frame?: BakedFrame): HandBasePaths | undefined => {
    if (!options.handRenderingEnabled || !frame?.hands) return undefined;
    const key = JSON.stringify([frame.hands, frame.model.display]);
    const cached = handModelPaths.get(key);
    if (cached) return cached;
    const index = handModelPaths.size;
    const paths: HandBasePaths = {
      left: `${EXPORT_NAMESPACE}:${options.projectName}/_hand/_generated/left_${index}`,
      right: `${EXPORT_NAMESPACE}:${options.projectName}/_hand/_generated/right_${index}`,
    };
    for (const side of ["left", "right"] as const) {
      files.push({
        path: `${modelRoot}/_hand/_generated/${side}_${index}.json`,
        content: json(handBaseModel(side, particleTexture, frame.hands[side], (frame.model.display ?? {}) as Parameters<typeof handBaseModel>[3])),
      });
    }
    handModelPaths.set(key, paths);
    return paths;
  };

  for (const sequence of sequences) {
    const paths: string[] = [];
    for (const frame of sequence.frames) {
      rewriteTextureRefs(frame.model, options.projectName, textures);
      const sanitized = sanitizeTextureRefs(frame.model, options.projectName, textureNames);
      omittedUntexturedFaces += sanitized.omittedFaces;
      omittedEmptyElements += sanitized.omittedElements;
      // Serialize once: the canonical string is the dedup key, the byte count,
      // and the written file content.
      const finalJson = JSON.stringify(frame.model);
      sampledFrames++;
      modelBytesBefore += finalJson.length;

      let modelPath = uniqueModels.get(finalJson);
      if (!modelPath) {
        const index = uniqueModels.size;
        modelPath = `${EXPORT_NAMESPACE}:${options.projectName}/_generated/model_${index}`;
        uniqueModels.set(finalJson, modelPath);
        modelBytesAfter += finalJson.length;
        files.push({
          path: `${modelRoot}/_generated/model_${index}.json`,
          content: `${finalJson}\n`,
        });
      }
      paths.push(modelPath);
    }
    basePaths.set(sequence.key, paths);
  }

  const contextSequences = new Map<string, SequenceModelPaths[]>();
  const animatedContextFolders: string[] = [];
  for (const route of options.displayContexts) {
    if (!route.animated) continue;
    const shortName = DISPLAY_CONTEXT_PATHS[route.context];
    if (!shortName) throw new Error(`Unknown display context: ${route.context}`);
    animatedContextFolders.push(shortName);
    const routedSequences: SequenceModelPaths[] = [];
    for (const sequence of sequences) {
      const paths = basePaths.get(sequence.key)!;
      const aliases = paths.map((parent, frame) => {
        const alias = `${EXPORT_NAMESPACE}:${options.projectName}/${sequence.key}/${shortName}/${frame}`;
        const content = json({ parent });
        modelBytesAfter += content.length;
        files.push({
          path: `${modelRoot}/${sequence.key}/${shortName}/${frame}.json`,
          content,
        });
        return alias;
      });
      routedSequences.push({
        key: sequence.key,
        sourceName: sequence.sourceName,
        modelPaths: aliases,
        handBasePaths: sequence.frames.map((frame) => resolveHandBasePaths(frame)),
      });
    }
    contextSequences.set(route.context, routedSequences);
  }

  const defaultPath = basePaths.get(options.defaultAnimationKey)?.[0];
  if (!defaultPath) throw new Error(tr("dap.error.no_models"));
  files.push({
    path: `${assetRoot}/items/${options.projectName}.json`,
    content: buildItemDefinition(
      options,
      defaultPath,
      contextSequences,
      resolveHandBasePaths(
        sequences.find((sequence) => sequence.key === options.defaultAnimationKey)?.frames[0]
      )
    ),
  });
  for (const texture of textures) {
    files.push({
      path: `${assetRoot}/textures/item/${options.projectName}/${texture.name}.png`,
      content: texture.dataUrl,
      isImage: true,
    });
  }

  return {
    files,
    report: {
      sampledFrames,
      uniqueModels: uniqueModels.size,
      duplicateFrames: sampledFrames - uniqueModels.size,
      modelBytesBefore,
      modelBytesAfter,
      omittedUntexturedFaces,
      omittedEmptyElements,
      animatedContextFolders,
      handRenderingEnabled: options.handRenderingEnabled === true,
      animations: sequences.map((sequence) => ({
        key: sequence.key,
        sourceName: sequence.sourceName,
        sampledFrames: sequence.frames.length,
      })),
    },
  };
}
