/** Per-display-context animation settings persisted in the .bbmodel project. */

import { tr } from "./i18n";

export interface DisplayAnimationSetting {
  animated: boolean;
}

export interface DisplayContextDefinition {
  id: string;
  label: string;
  defaultAnimated: boolean;
}

export const DISPLAY_CONTEXTS: DisplayContextDefinition[] = [
  { id: "thirdperson_righthand", label: "Third Person - Right Hand", defaultAnimated: false },
  { id: "thirdperson_lefthand", label: "Third Person - Left Hand", defaultAnimated: false },
  { id: "firstperson_righthand", label: "First Person - Right Hand", defaultAnimated: true },
  { id: "firstperson_lefthand", label: "First Person - Left Hand", defaultAnimated: true },
  { id: "head", label: "Head", defaultAnimated: false },
  { id: "gui", label: "GUI / Inventory", defaultAnimated: false },
  { id: "ground", label: "Ground", defaultAnimated: false },
  { id: "fixed", label: "Item Frame", defaultAnimated: false },
];

const PROPERTY_NAME = "display_anim_variants";
let settingsProperty: PropertyInstance | null = null;

type StoredSetting = {
  animated?: boolean;
  /** Removed in 0.7.0; retained only while reading older projects. */
  groupUuid?: string;
};

function projectSettings(): Record<string, StoredSetting> {
  if (!Project) return {};
  const value = Project[PROPERTY_NAME];
  return value && typeof value === "object"
    ? (value as Record<string, StoredSetting>)
    : {};
}

export function registerDisplayAnimationProperty(): void {
  if (ModelProject.properties?.[PROPERTY_NAME]) return;
  settingsProperty = new Property(ModelProject, "object", PROPERTY_NAME, {
    default: {},
    exposed: false,
    label: tr("dap.property.name"),
    description: tr("dap.property.description"),
  });
}

export function unregisterDisplayAnimationProperty(): void {
  settingsProperty?.delete();
  settingsProperty = null;
}

export function getDisplayAnimationEnabled(slot: string): boolean {
  const stored = projectSettings()[slot];
  if (typeof stored?.animated === "boolean") return stored.animated;
  return (
    DISPLAY_CONTEXTS.find((context) => context.id === slot)?.defaultAnimated ??
    false
  );
}

export function setDisplayAnimationEnabled(
  slot: string,
  animated: boolean
): void {
  if (!Project) return;

  const cleaned: Record<string, DisplayAnimationSetting> = {};
  for (const context of DISPLAY_CONTEXTS) {
    const stored = projectSettings()[context.id];
    if (typeof stored?.animated === "boolean") {
      cleaned[context.id] = { animated: stored.animated };
    }
  }
  cleaned[slot] = { animated };
  Project[PROPERTY_NAME] = cleaned;
  Project.saved = false;
}

export function configuredDisplayAnimations(): Array<{
  context: DisplayContextDefinition;
  animated: boolean;
}> {
  return DISPLAY_CONTEXTS.map((context) => ({
    context,
    animated: getDisplayAnimationEnabled(context.id),
  }));
}
