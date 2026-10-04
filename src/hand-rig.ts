/** Persistent, idempotent Blockbench preview rig for animated player arms. */

import defaultTextureDataUrl from "./assets/missing.png";
import type { StoredExportAnimationSettings } from "./export-animation-settings";
import { tr } from "./i18n";

const ROLE_PROPERTY = "display_anim_hand_role";
const GENERATED_PROPERTY = "display_anim_hand_generated";
export const PREVIEW_TEXTURE_PROPERTY = "display_anim_hand_preview_texture";
const ROOT_ROLE = "root";
const LEFT_ROLE = "left_arm";
const RIGHT_ROLE = "right_arm";
const DEFAULT_TEXTURE_NAME = "missing.png";
/** Preview texture name used before the switch to the built-in 16×16 default. */
export const LEGACY_TEXTURE_NAME = "DAP_Default_Player_Skin.png";

let groupRoleProperty: PropertyInstance | null = null;
let groupGeneratedProperty: PropertyInstance | null = null;
let cubeRoleProperty: PropertyInstance | null = null;
let cubeGeneratedProperty: PropertyInstance | null = null;
let texturePreviewProperty: PropertyInstance | null = null;

export interface HandRigGroups {
  root: GroupInstance | null;
  left: GroupInstance;
  right: GroupInstance;
}

export function registerHandRigProperties(): void {
  if (!Group.properties?.[ROLE_PROPERTY]) {
    groupRoleProperty = new Property(Group, "string", ROLE_PROPERTY, { default: "" });
  }
  if (!Group.properties?.[GENERATED_PROPERTY]) {
    groupGeneratedProperty = new Property(Group, "boolean", GENERATED_PROPERTY, { default: false });
  }
  if (!Cube.properties?.[ROLE_PROPERTY]) {
    cubeRoleProperty = new Property(Cube, "string", ROLE_PROPERTY, { default: "" });
  }
  if (!Cube.properties?.[GENERATED_PROPERTY]) {
    cubeGeneratedProperty = new Property(Cube, "boolean", GENERATED_PROPERTY, { default: false });
  }
  if (!Texture.properties?.[PREVIEW_TEXTURE_PROPERTY]) {
    texturePreviewProperty = new Property(Texture, "boolean", PREVIEW_TEXTURE_PROPERTY, { default: false });
  }
}

export function unregisterHandRigProperties(): void {
  for (const property of [groupRoleProperty, groupGeneratedProperty, cubeRoleProperty, cubeGeneratedProperty, texturePreviewProperty]) {
    property?.delete();
  }
  groupRoleProperty = groupGeneratedProperty = cubeRoleProperty = cubeGeneratedProperty = null;
  texturePreviewProperty = null;
}

function roleOf(node: OutlinerNodeLike): string {
  return String((node as unknown as Record<string, unknown>)[ROLE_PROPERTY] ?? "");
}

function setRole(node: OutlinerNodeLike, role: string, generated: boolean): void {
  const record = node as unknown as Record<string, unknown>;
  record[ROLE_PROPERTY] = role;
  record[GENERATED_PROPERTY] = generated;
}

function isGenerated(node: OutlinerNodeLike): boolean {
  return (node as unknown as Record<string, unknown>)[GENERATED_PROPERTY] === true;
}

function findGroup(uuid: string | undefined, role: string, compatibleName: string): GroupInstance | null {
  return (
    (uuid ? Group.all.find((group) => group.uuid === uuid) : undefined) ??
    Group.all.find((group) => roleOf(group) === role) ??
    Group.all.find((group) => group.name.toLowerCase() === compatibleName)
  ) ?? null;
}

export function resolveHandRig(settings: StoredExportAnimationSettings): HandRigGroups | null {
  const left = findGroup(settings.handLeftGroupUuid, LEFT_ROLE, "lefthand");
  const right = findGroup(settings.handRightGroupUuid, RIGHT_ROLE, "righthand");
  if (!left || !right) return null;
  const root = findGroup(settings.handRigRootUuid, ROOT_ROLE, "dap_playerhands");
  return { root, left, right };
}

export function resolveProjectHandRig(): HandRigGroups | null {
  const settings = Project?.display_anim_export_settings as Partial<StoredExportAnimationSettings> | undefined;
  if (!settings?.handRenderingEnabled) return null;
  return resolveHandRig(settings as StoredExportAnimationSettings);
}

export function assertNoHandScaleKeyframes(animation: Animation, rig: HandRigGroups): void {
  for (const hand of [rig.left, rig.right]) {
    let group: OutlinerNodeLike | "root" | null = hand;
    while (group && group !== "root") {
      const animator = animation.animators?.[group.uuid];
      const hasScale = animator?.keyframes?.some((keyframe) => keyframe.channel === "scale") === true;
      if (hasScale) {
        throw new Error(tr("dap.hand.scale_unsupported", { animation: animation.name, group: group.name }));
      }
      group = group.parent;
    }
  }
}

type FaceName = "north" | "east" | "south" | "west" | "up" | "down";

/**
 * Standard arm placeholder measured from the user's reference model: an integer
 * 4×4×12 cube (pixel-exact arm proportions) lying along -Z from a pivot at its
 * rear end. The Blockbench model is a position placeholder only; exported hand
 * placement comes from the calibrated constants in hand-pose.ts.
 */
export function armPlaceholder(side: "left" | "right"): { pivot: [number, number, number]; from: [number, number, number]; to: [number, number, number] } {
  return side === "right"
    ? { pivot: [14, 2, 16], from: [12, 0, 4], to: [16, 4, 16] }
    : { pivot: [2, 2, 16], from: [0, 0, 4], to: [4, 4, 16] };
}

/**
 * The preview arms use box UV (the Java item default) at the texture origin, so
 * every face maps a single uv_offset instead of six per-face rectangles. The
 * 16×16 placeholder texture is uniform, so the shared origin needs no side offset.
 */
export function armBoxUvOffset(): [number, number, number] {
  return [0, 0, 0];
}

function applyArmTexture(cube: OutlinerNodeLike, texture: TextureInstance): void {
  cube.applyTexture?.(texture, true);
  cube.box_uv = true;
  (cube as unknown as Record<string, unknown>).uv_offset = armBoxUvOffset().slice();
  for (const faceName of Object.keys(cube.faces ?? {}) as FaceName[]) {
    const face = cube.faces?.[faceName];
    if (!face) continue;
    face.texture = texture.uuid;
  }
}

function createArmCube(group: GroupInstance, texture: TextureInstance, side: "left" | "right"): OutlinerNodeLike {
  const placeholder = armPlaceholder(side);
  const cube = new Cube({
    name: `DAP_${side === "right" ? "Right" : "Left"}Arm_Skin`,
    from: placeholder.from.slice(),
    to: placeholder.to.slice(),
    origin: placeholder.pivot.slice(),
    inflate: 0,
    export: false,
    visibility: true,
    autouv: 0,
  }).init().addTo(group);
  setRole(cube, `${side}_skin`, true);
  applyArmTexture(cube, texture);
  return cube;
}

function armCubes(group: GroupInstance, side: "left" | "right"): { skin: OutlinerNodeLike | null; stale: OutlinerNodeLike[] } {
  const descendants: OutlinerNodeLike[] = [];
  group.forEachChild?.((child) => descendants.push(child));
  const direct = group.children ?? [];
  const all = descendants.length ? descendants : direct;
  const skin = all.find((node) => roleOf(node) === `${side}_skin`) ??
    all.find((node) => node instanceof Cube && (node.inflate ?? 0) < 0.1) ?? null;
  // Older rigs generated sleeve overlay cubes; they are no longer part of the
  // standard and are removed when the rig is refreshed.
  const stale = all.filter((node) =>
    node !== skin && node instanceof Cube &&
    (roleOf(node) === `${side}_sleeve` || roleOf(node) === "")
  );
  return { skin, stale };
}

function ensureDefaultTexture(settings: StoredExportAnimationSettings): TextureInstance {
  const existing = Texture.all.find((texture) => texture.uuid === settings.handPreviewTextureUuid) ??
    Texture.all.find((texture) =>
      (texture as unknown as Record<string, unknown>)[PREVIEW_TEXTURE_PROPERTY] === true
    );
  if (existing) {
    (existing as unknown as Record<string, unknown>)[PREVIEW_TEXTURE_PROPERTY] = true;
    return existing;
  }
  // 16×16 placeholder shipped with Blockbench itself (assets/missing.png).
  const texture = new Texture({ name: DEFAULT_TEXTURE_NAME }).fromDataURL(defaultTextureDataUrl).add(false);
  (texture as unknown as Record<string, unknown>)[PREVIEW_TEXTURE_PROPERTY] = true;
  return texture;
}

/** Re-applies the standard geometry/texture to one arm (create or refresh). */
function refreshArm(group: GroupInstance, texture: TextureInstance, side: "left" | "right", settings: StoredExportAnimationSettings): void {
  setRole(group, side === "left" ? LEFT_ROLE : RIGHT_ROLE, isGenerated(group));
  if (!isGenerated(group)) return;
  group.visibility = settings.handRenderingEnabled;
  const cubes = armCubes(group, side);
  if (cubes.skin && !isGenerated(cubes.skin)) return;
  const skin = cubes.skin ?? createArmCube(group, texture, side);
  setRole(skin, `${side}_skin`, true);
  skin.export = false;
  skin.visibility = settings.handRenderingEnabled;
  if (!cubes.skin) applyArmTexture(skin, texture);
}

/** Creates or refreshes the standard rig in one visible, undoable edit. */
export function ensureHandRig(settings: StoredExportAnimationSettings): HandRigGroups {
  if (!Project) throw new Error(tr("dap.settings.no_project"));
  const beforeGroups = Group.all.slice();
  const beforeElements = Outliner.elements.slice();
  const beforeTextures = Texture.all.slice();
  Undo.initEdit({ elements: beforeElements, groups: beforeGroups, textures: beforeTextures, outliner: true, animations: Animation.all.slice() });
  try {
    const texture = ensureDefaultTexture(settings);
    let root = findGroup(settings.handRigRootUuid, ROOT_ROLE, "dap_playerhands");
    let left = findGroup(settings.handLeftGroupUuid, LEFT_ROLE, "lefthand");
    let right = findGroup(settings.handRightGroupUuid, RIGHT_ROLE, "righthand");
    if (!left || !right) {
      root = root ?? new Group({ name: "DAP_PlayerHands", origin: [8, 8, 8] }).init();
      setRole(root, ROOT_ROLE, true);
      if (!right) {
        right = new Group({ name: "DAP_RightArm", origin: armPlaceholder("right").pivot.slice() }).init().addTo(root);
        setRole(right, RIGHT_ROLE, true);
      }
      if (!left) {
        left = new Group({ name: "DAP_LeftArm", origin: armPlaceholder("left").pivot.slice() }).init().addTo(root);
        setRole(left, LEFT_ROLE, true);
      }
      if (!right || !left) throw new Error("Unable to create player hand groups.");
      setRole(right, RIGHT_ROLE, isGenerated(right));
      setRole(left, LEFT_ROLE, isGenerated(left));
    } else {
      // Compatible lefthand/righthand groups are adopted in place so their existing keyframes survive.
      setRole(left, LEFT_ROLE, isGenerated(left));
      setRole(right, RIGHT_ROLE, isGenerated(right));
    }
    refreshArm(left, texture, "left", settings);
    refreshArm(right, texture, "right", settings);
    settings.handRigRootUuid = root?.uuid;
    settings.handLeftGroupUuid = left.uuid;
    settings.handRightGroupUuid = right.uuid;
    settings.handPreviewTextureUuid = texture.uuid;
    Undo.finishEdit(tr("dap.hand.undo_create"), { elements: Outliner.elements.slice(), groups: Group.all.slice(), textures: Texture.all.slice(), outliner: true, animations: Animation.all.slice() });
    Canvas.updateAll();
    return { root, left, right };
  } catch (error) {
    Undo.cancelEdit(true);
    throw error;
  }
}

export function setHandRigVisibility(settings: StoredExportAnimationSettings): void {
  const rig = resolveHandRig(settings);
  if (!rig) return;
  for (const [side, group] of [["left", rig.left], ["right", rig.right]] as const) {
    if (!isGenerated(group)) continue;
    group.visibility = settings.handRenderingEnabled;
    const cubes = armCubes(group, side);
    if (cubes.skin) cubes.skin.visibility = settings.handRenderingEnabled;
  }
  Canvas.updateAll();
}

export function deleteHandRig(settings: StoredExportAnimationSettings): void {
  const rig = resolveHandRig(settings);
  if (!rig) return;
  Undo.initEdit({ elements: Outliner.elements.slice(), groups: Group.all.slice(), outliner: true, animations: Animation.all.slice() });
  try {
    // Unbind authored groups without altering their children or animation tracks.
    for (const group of [rig.left, rig.right]) {
      if (isGenerated(group)) {
        const descendants: OutlinerNodeLike[] = [];
        group.forEachChild?.(node => descendants.push(node));
        if (descendants.every(isGenerated)) group.remove();
        else setRole(group, "", false);
      } else setRole(group, "", false);
    }
    if (rig.root && isGenerated(rig.root) && rig.root.children.length === 0) rig.root.remove();
    settings.handRigRootUuid = undefined;
    settings.handLeftGroupUuid = undefined;
    settings.handRightGroupUuid = undefined;
    Undo.finishEdit(tr("dap.hand.undo_delete"), { elements: Outliner.elements.slice(), groups: Group.all.slice(), outliner: true, animations: Animation.all.slice() });
    Canvas.updateAll();
  } catch (error) {
    Undo.cancelEdit(true);
    throw error;
  }
}
