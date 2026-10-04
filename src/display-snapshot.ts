export type CompiledDisplay = Record<string, unknown>;

export function cloneCompiledDisplay(
  display: CompiledDisplay | undefined
): CompiledDisplay | undefined {
  return display
    ? (JSON.parse(JSON.stringify(display)) as CompiledDisplay)
    : undefined;
}

/**
 * Replaces potentially stale frame display data with the export-start snapshot.
 * Operates on the already-parsed model object; the snapshot is shared by
 * reference across all frames of a bake batch and must stay frozen —
 * consumers may rewrite `textures` and `elements` but never `display`.
 */
export function applyCompiledDisplaySnapshot<T extends { display?: CompiledDisplay }>(
  model: T,
  display: CompiledDisplay | undefined
): T {
  if (!display) return model;
  model.display = display;
  return model;
}
