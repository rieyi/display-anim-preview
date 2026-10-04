/** Create disposable in-memory projects for compilation that flattens the hierarchy. */

export interface SourceEditorState {
  project: ModelProjectInstance;
  projectUuid: string;
  mode: string;
  timelineTime: number;
  animationUuid: string | null;
  playing: Array<{ uuid: string; playing: false | true | "locked" }>;
  saved: boolean;
}

function cloneProjectModel(): Record<string, unknown> {
  const compiled = Codecs.project.compile({ raw: true, absolute_paths: true, editor_state: false });
  return JSON.parse(JSON.stringify(compiled)) as Record<string, unknown>;
}

function captureSourceState(): SourceEditorState {
  if (!Project) throw new Error("No active Blockbench project.");
  return {
    project: Project as unknown as ModelProjectInstance,
    projectUuid: String((Project as unknown as { uuid: string }).uuid),
    mode: Modes.selected.id,
    timelineTime: Timeline.time,
    animationUuid: Animation.selected?.uuid ?? null,
    playing: Animation.all.map((animation) => ({ uuid: animation.uuid, playing: animation.playing })),
    saved: Project.saved,
  };
}

function restoreSourceState(state: SourceEditorState): void {
  if (!ModelProject.all.includes(state.project)) {
    throw new Error("The source Blockbench project was closed during isolated checking.");
  }
  state.project.select();
  if (Project?.uuid !== state.projectUuid) {
    throw new Error("Blockbench did not restore the source project after isolated checking.");
  }
  Modes.options[state.mode]?.select();
  for (const animation of Animation.all) animation.selected = false;
  Animation.selected = state.animationUuid
    ? Animation.all.find((animation) => animation.uuid === state.animationUuid) ?? null
    : null;
  if (Animation.selected) Animation.selected.selected = true;
  for (const item of state.playing) {
    const animation = Animation.all.find((candidate) => candidate.uuid === item.uuid);
    if (animation) animation.playing = item.playing;
  }
  Timeline.setTime(state.timelineTime);
  Animator.preview();
  Project.saved = state.saved;
}

export async function withIsolatedProject<T>(
  operation: (scratch: ModelProjectInstance, sourceState: SourceEditorState) => Promise<T>
): Promise<T> {
  const sourceState = captureSourceState();
  const snapshot = cloneProjectModel();
  const formatId = (snapshot.meta as { model_format?: string } | undefined)?.model_format;
  const format = (formatId ? Formats[formatId] : undefined) ?? sourceState.project.format ?? Formats.free;
  if (!format) throw new Error(`The source project format "${formatId ?? "unknown"}" is not available.`);

  const scratch = new ModelProject({ format });
  let result: T | undefined;
  let operationError: unknown;
  try {
    if (!scratch.select()) throw new Error("Blockbench refused to select the isolated check project.");
    Codecs.project.parse(snapshot);
    scratch.name = `[JDA Check] ${(snapshot.name as string | undefined) ?? "Project"}`;
    scratch.save_path = "";
    scratch.export_path = "";
    scratch.saved = true;
    result = await operation(scratch, sourceState);
  } catch (error) {
    operationError = error;
  } finally {
    // Closing the scratch project and restoring the source project must be
    // independent: a close failure must not skip source restoration.
    try {
      if (ModelProject.all.includes(scratch)) await scratch.close(true);
    } catch (closeError) {
      console.error("Failed to close the isolated check project", closeError);
    }
    try {
      restoreSourceState(sourceState);
    } catch (restoreError) {
      if (!operationError) operationError = restoreError;
      else console.error("Failed to restore the source project after an isolated check", restoreError);
    }
  }
  if (operationError) throw operationError;
  return result as T;
}
