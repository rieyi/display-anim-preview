// Minimal Blockbench global API declarations — only what this plugin uses.
// Verified live against a running Blockbench 5.1.6 instance via the
// Blockbench MCP plugin (risky_eval) before writing this file — see the
// commit history / chat log for the verification transcript. Do NOT extend
// this speculatively; if a new global is needed, verify it live first.

declare global {
  const Language: {
    addTranslations(language: string, translations: Record<string, string>): void;
  };
  function tl(key: string): string;

  interface Console {
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    log(...args: unknown[]): void;
  }
  const console: Console;

  interface PluginOptions {
    title: string;
    author: string;
    description: string;
    about?: string;
    icon: string;
    version: string;
    min_version?: string;
  creation_date?: string;
    has_changelog?: boolean;
    repository?: string;
    bug_tracker?: string;
    variant: "both" | "desktop" | "web";
    tags?: string[];
    await_loading?: boolean;
    contributes?: {
      formats?: string[];
    };
    onload?: () => void;
    onunload?: () => void;
  }

  interface ModelFormatOptions {
    id: string;
    name: string;
    icon: string;
    category?: string;
    target?: string;
    description?: string;
    show_in_start_screen?: boolean;
    box_uv?: boolean;
    optional_box_uv?: boolean;
    single_texture?: boolean;
    render_sides?: "front" | "double" | "auto";
    model_identifier?: boolean;
    parent_model_id?: boolean;
    vertex_color_ambient_occlusion?: boolean;
    uv_rotation?: boolean;
    java_cube_shading_properties?: boolean;
    java_face_properties?: boolean;
    cullfaces?: boolean;
    animated_textures?: boolean;
    select_texture_for_particles?: boolean;
    texture_mcmeta?: boolean;
    texture_folder?: boolean;
    animation_controllers?: boolean;
    animation_files?: boolean;
    bone_rig?: boolean;
    centered_grid?: boolean;
    rotate_cubes?: boolean;
    integer_size?: boolean;
    animation_mode?: boolean;
    display_mode?: boolean;
    codec?: unknown;
  }

  interface ModelFormatInstance {
    id: string;
    name: string;
    codec?: { compile?(options?: { prevent_dialog?: boolean }): string } | null;
    new?(): boolean;
    select?(): void;
    delete(): void;
  }

  const ModelFormat: {
    new (id: string, options: ModelFormatOptions): ModelFormatInstance;
  };

  const Formats: Record<string, ModelFormatInstance | undefined>;
  const Format: ModelFormatInstance;
  const Canvas: {
    scene: THREE.Scene;
    updateAll(): void;
  };

  interface PropertyInstance {
    delete(): void;
  }

  interface PropertyOptions {
    exposed?: boolean;
    default?: unknown;
    label?: string;
    description?: string;
  }

  const Property: {
    new (
      targetClass: { properties?: Record<string, PropertyInstance> },
      type: "object" | "string" | "boolean",
      name: string,
      options?: PropertyOptions
    ): PropertyInstance;
  };

  interface ModelProjectInstance {
    uuid: string;
    name: string;
    format?: ModelFormatInstance;
    saved: boolean;
    save_path?: string;
    export_path?: string;
    select(): boolean;
    close(force?: boolean): Promise<boolean>;
  }

  const ModelProject: {
    new (options?: { format?: ModelFormatInstance }, uuid?: string): ModelProjectInstance;
    all: ModelProjectInstance[];
    properties?: Record<string, PropertyInstance>;
  };

  const Plugin: {
    register(id: string, options: PluginOptions): void;
  };

  interface ActionOptions {
    name: string;
    description?: string;
    icon: string;
    category?: string;
    condition?: () => boolean;
    children?: Array<Action | string>;
    searchable?: boolean;
    click?(): void;
  }

  class Action {
    readonly id: string;
    constructor(id: string, options: ActionOptions);
    delete(): void;
  }

  const Toolbars: { timeline: { children: Array<Action | string>; add(action: Action, index?: number): void } };

  const MenuBar: {
    addAction(action: Action, path: string): void;
    removeAction(path: string): void;
  };

  const Blockbench: {
    version: string;
    on(event: string, callback: (data?: unknown) => void): void;
    removeListener(event: string, callback: (data?: unknown) => void): void;
    showQuickMessage(message: string, ms?: number): void;
    setProgress(progress: number, time?: number, statusBar?: boolean): void;
    setStatusBarText(text?: string): void;
    showMessageBox(
      options: {
        title: string;
        message: string;
        icon?: string;
        buttons?: string[];
        confirmIndex?: number;
        cancelIndex?: number;
      },
      callback?: (buttonIndex: number) => void
    ): void;
    /**
     * Desktop-only directory picker; remembers the last location per
     * `resource_id`. Returns null/undefined when cancelled.
     */
    pickDirectory(options: { resource_id?: string; title?: string; startpath?: string }): string | null | undefined;
    /**
     * Writes one file. Verified live: this does NOT create parent
     * directories — mkdir them first or it fails with ENOENT.
     * `savetype: "image"` decodes a `data:image/png;base64,…` content string.
     */
    writeFile(path: string, options: { content: string; savetype?: "text" | "image" | "zip" }): void;
    /** Verified live against Blockbench 5.1.6: desktop file picker callback receives file descriptors. */
    import(
      options: { resource_id?: string; title?: string; type: string; extensions: string[]; multiple?: boolean },
      callback: (files: BlockbenchFile[]) => void
    ): void;
    export(options: {
      resource_id?: string;
      type: string;
      extensions: string[];
      name: string;
      content: unknown;
      savetype: "zip";
    }): void;
  };

  class JSZip {
    file(name: string, content: string): void;
    generateAsync(options: { type: "blob" }): Promise<unknown>;
  }

  // --- Node modules, exposed to plugins through a permission-scoped require ---
  // Verified live that `requireNativeModule("fs", {scope})` returns a handle
  // restricted to that directory, prompting the user once and remembering the
  // grant. Only the members this plugin uses are declared.
  interface NodeDirent {
    name: string;
    isDirectory(): boolean;
  }
  interface NodeFs {
    mkdirSync(path: string, options?: { recursive?: boolean }): void;
    existsSync(path: string): boolean;
    readdirSync(path: string, options: { withFileTypes: true }): NodeDirent[];
    readFileSync(path: string, encoding: "utf8"): string;
    unlinkSync(path: string): void;
    rmdirSync(path: string): void;
    renameSync(oldPath: string, newPath: string): void;
    rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  }
  interface NodePath {
    join(...parts: string[]): string;
    dirname(path: string): string;
    basename(path: string): string;
  }
  function requireNativeModule(
    module: "fs" | "path" | "clipboard",
    options?: { scope?: string; message?: string; show_permission_dialog?: boolean }
  ): unknown;

  // --- Model / animation runtime ---

  interface GroupInstance extends OutlinerNodeLike {
    /**
     * Official "Resolve Group" operation: re-parents children one level up
     * while composing the parent's rotation into each child and shifting
     * from/to/origin to match. Reusing this is what lets baking avoid
     * hand-rolled hierarchy math. `undo = false` skips its own Undo
     * bookkeeping so the caller can wrap a whole frame in one transaction.
     */
    resolve(undo?: boolean): OutlinerNodeLike[];
    init(): GroupInstance;
    addTo(parent: GroupInstance | "root"): GroupInstance;
    remove(): void;
    forEachChild(callback: (child: OutlinerNodeLike) => void): void;
  }
  const Group: {
    all: GroupInstance[];
    properties?: Record<string, PropertyInstance>;
    new (...args: unknown[]): GroupInstance;
  };
  type Group = GroupInstance;

  interface BoneAnimatorInstance {
    channels: { rotation?: unknown; position?: unknown; scale?: unknown };
    keyframes?: KeyframeInstance[];
    select(): BoneAnimatorInstance;
    interpolate(channel: "rotation" | "position" | "scale"): number[] | null;
  }

  interface AnimationInstance {
    uuid: string;
    name: string;
    selected: boolean;
    length: number;
    playing: false | true | "locked";
    /** Animation FPS grid used by frame baking. */
    snapping: number;
    /** Molang expression string when set; used as a blend multiplier. */
    blend_weight?: string;
    /** Bone animators keyed by group uuid — this is where keyframes live. */
    animators?: Record<string, BoneAnimatorInstance | undefined>;
    select(): void;
    getBoneAnimator(node: OutlinerNodeLike): BoneAnimatorInstance | null;
  }
  const Animation: { all: AnimationInstance[]; selected: AnimationInstance | null };
  type Animation = AnimationInstance;

  const Animator: {
    open: boolean;
    animations: AnimationInstance[];
    MolangParser: { parse(expression: string): number };
    showDefaultPose(no_matrix_update?: boolean): void;
    preview(in_loop?: boolean): void;
  };

  // --- Outliner / baking surface ---
  // Blockbench extends Array.prototype with these vector helpers; the baking
  // code uses them so the arithmetic matches the official
  // bake_animation_into_model Action exactly.
  interface Array<T> {
    V3_add(vector: number[]): number[];
    V3_multiply(vector: number[]): number[];
  }

  /**
   * The common surface of the outliner nodes baking touches (Groups and
   * Cubes). Coordinate fields are optional because which ones exist depends
   * on the node type.
   */
  interface OutlinerNodeLike {
    uuid: string;
    name: string;
    parent: OutlinerNodeLike | "root" | null;
    children: OutlinerNodeLike[];
    from?: number[];
    to?: number[];
    origin?: number[];
    rotation?: number[];
    inflate?: number;
    box_uv?: boolean;
    uv_offset?: number[];
    export?: boolean;
    visibility?: boolean;
    selected: boolean;
    mesh: THREE_Object3D;
    faces?: Record<string, { uv: number[]; texture: string | null }>;
    constructor: { animator?: unknown };
    getTypeBehavior(behavior: string): boolean;
    init(): OutlinerNodeLike;
    addTo(parent: GroupInstance | "root"): OutlinerNodeLike;
    remove(): void;
    applyTexture?(texture: TextureInstance, blank?: boolean): void;
  }

  const Outliner: { root: OutlinerNodeLike[]; elements: OutlinerNodeLike[]; selected: OutlinerNodeLike[] };
  function unselectAllElements(): void;
  function updateSelection(): void;

  interface KeyframeInstance {
    time: number;
    channel: string;
    selected: boolean;
    animator: BoneAnimatorInstance;
    interpolation?: string;
    data_points?: unknown[];
    bezier_left_time?: number[];
    bezier_left_value?: number[];
    bezier_right_time?: number[];
    bezier_right_value?: number[];
    select(): KeyframeInstance;
  }
  const Keyframe: { selected: KeyframeInstance[] };

  const Cube: {
    all: OutlinerNodeLike[];
    properties?: Record<string, PropertyInstance>;
    new (options?: Record<string, unknown>, uuid?: string): OutlinerNodeLike;
    [Symbol.hasInstance](value: unknown): boolean;
  };

  /**
   * Project textures. Verified live: `id` is a numeric string matching the
   * keys of a compiled model's `textures` map, `getDataURL()` returns a
   * `data:image/png;base64,…` string, and `javaTextureLink()` returns the bare
   * in-project path (e.g. `block/texture`) that has to be rewritten for
   * export.
   */
  interface TextureInstance {
    id: string;
    uuid: string;
    name: string;
    folder: string;
    width: number;
    height: number;
    getDataURL(): string;
    javaTextureLink(): string;
    fromFile(file: BlockbenchFile): TextureInstance;
    fromDataURL(dataUrl: string): TextureInstance;
    add(undo?: boolean, uvSizeFromResolution?: boolean): TextureInstance;
    remove(undo?: boolean): void;
    getActiveCanvas(): CanvasLike;
  }
  const Texture: {
    all: TextureInstance[];
    properties?: Record<string, PropertyInstance>;
    new (options?: Record<string, unknown>, uuid?: string): TextureInstance;
  };

  interface BlockbenchFile {
    name: string;
    path?: string;
    content?: string | ArrayBuffer;
  }

  interface CanvasLike {
    getContext(type: "2d"): Canvas2DContextLike;
  }

  interface Canvas2DContextLike {
    getImageData(x: number, y: number, width: number, height: number): { data: ArrayLike<number> };
  }

  /**
   * `Undo.cancelEdit(true)` reverts to the pre-edit snapshot WITHOUT adding a
   * history entry, unlike finishEdit()+undo() which truncates the user's redo
   * branch.
   *
   * CRITICAL: the snapshot only covers the aspects you declare. Baking
   * removes groups (via Group.resolve()), and keyframes are stored on those
   * groups' bone animators, so `animations` MUST be declared or the rollback
   * silently returns empty groups and destroys the user's keyframes.
   */
  const Undo: {
    current_save: unknown;
    initEdit(aspects: {
      elements?: OutlinerNodeLike[];
      groups?: GroupInstance[];
      textures?: TextureInstance[];
      outliner?: boolean;
      animations?: AnimationInstance[];
    }): unknown;
    finishEdit(message: string, aspects?: {
      elements?: OutlinerNodeLike[];
      groups?: GroupInstance[];
      textures?: TextureInstance[];
      outliner?: boolean;
      animations?: AnimationInstance[];
    }): void;
    cancelEdit(revert_changes?: boolean): void;
  };

  const Codecs: {
    java_block?: { compile(options?: { prevent_dialog?: boolean }): string };
    project: {
      compile(options?: Record<string, unknown>): Record<string, unknown>;
      parse(model: Record<string, unknown>, path?: string): void;
    };
    [key: string]: { compile?(options?: { prevent_dialog?: boolean }): string } | unknown;
  };

  const Timeline: {
    time: number;
    playing: boolean;
    start(): void;
    pause(): void;
    /** Advances time, applies loop/hold/once behavior, and calls Animator.preview(). */
    loop(): void;
    setTime(time: number, editing?: boolean): void;
    /**
     * `1 / snapping` of the selected animation (falling back to the global
     * animation_snap setting) — i.e. the duration of one frame on the
     * animation's own FPS grid. Verified live: returns 0.05 for a
     * snapping-20 animation.
     */
    getStep(): number;
  };

  interface ToggleBarItem {
    value: boolean;
    set(value: boolean): void;
  }

  const BarItems: {
    looped_animation_playback: ToggleBarItem;
  };

  interface DisplaySettingsEntry {
    rotation_pivot?: [number, number, number];
    scale_pivot?: [number, number, number];
    mirror?: [boolean, boolean, boolean];
    rotation: [number, number, number];
    translation: [number, number, number];
    scale: [number, number, number];
  }

  const Project: ({
    model_3d: THREE.Object3D;
    name?: string;
    saved: boolean;
    /**
     * UV resolution the codec scales face UVs against. Can differ from the
     * actual texture pixel size, which silently produces wrong UVs on export —
     * the dialog warns when they disagree.
     */
    texture_width: number;
    texture_height: number;
    display_settings: Record<string, DisplaySettingsEntry>;
  } & Record<string, unknown>) | null;

  // --- Display Mode (the official Java block/item display editor) ---
  // `DisplayMode.load(slot)` both applies the slot's static transform to
  // `display_base` AND jumps the main viewport camera to that slot's preset
  // angle — reusing it gives us the official camera presets / left-hand
  // mirroring / rotation+scale pivot handling directly.
  const DisplayMode: {
    display_slot: string;
    slots: string[];
    display_base: THREE_Object3D;
    load(slot: string): void;
    updateDisplayBase(entry?: DisplaySettingsEntry): void;
  };

  interface AppModeOption {
    id: string;
    select(): void;
  }
  const Modes: {
    selected: AppModeOption;
    /**
     * Keyed by mode id ("edit" / "animate" / "display" / "paint"). Baking
     * needs `animate`: verified live that `animator.interpolate()` returns
     * `false` rather than a vector in other modes.
     */
    options: Record<string, AppModeOption | undefined>;
  };

  // --- Minimal three.js object surface exposed by Blockbench ---
  interface THREE_Vector3 {
    x: number;
    y: number;
    z: number;
  }
  interface THREE_Euler {
    x: number;
    y: number;
    z: number;
  }
  interface THREE_Object3D {
    visible: boolean;
    position: THREE_Vector3;
    rotation: THREE_Euler;
    scale: THREE_Vector3;
    parent: THREE_Object3D | null;
    matrix: THREE_Matrix4;
    matrixWorld: THREE_Matrix4;
    updateMatrixWorld(force?: boolean): void;
  }

  interface THREE_Matrix4 {
    elements: number[];
    toArray(): number[];
  }

  // --- DOM surface for building the control panel (no DOM lib — see
  // sibling project's types/blockbench.d.ts for why DOM lib is excluded:
  // it collides with Blockbench's own Group/Cube/Animation/Plugin globals). ---
  interface HTMLElementLike {
    clientWidth: number;
    clientHeight: number;
    isConnected: boolean;
    appendChild(node: HTMLElementLike): void;
    style: Record<string, string>;
    remove(): void;
    blur(): void;
    innerHTML: string;
    innerText: string;
    title: string;
    onclick: (() => void) | null;
    onmouseenter: (() => void) | null;
    onmouseleave: (() => void) | null;
    className: string;
    id: string;
    dataset: Record<string, string | undefined>;
    parentElement: HTMLElementLike | null;
    click(): void;
    addEventListener(event: string, callback: () => void): void;
    querySelector(selector: string): HTMLElementLike | null;
    querySelectorAll(selector: string): HTMLElementLike[];
  }

  interface InputEventLike {
    target: HTMLInputElementLike;
  }

  interface HTMLSelectElementLike extends HTMLElementLike {
    value: string;
    disabled: boolean;
    onchange: ((event: InputEventLike) => void) | null;
  }

  interface HTMLInputElementLike extends HTMLElementLike {
    type: string;
    checked: boolean;
    value: string;
    min: string;
    max: string;
    step: string;
    placeholder: string;
    disabled: boolean;
    oninput: ((event: InputEventLike) => void) | null;
    onchange: ((event: InputEventLike) => void) | (() => void) | null;
  }

  interface HTMLOptionElementLike extends HTMLElementLike {
    value: string;
  }

  interface HTMLTextAreaElementLike extends HTMLElementLike {
    value: string;
    readOnly: boolean;
  }

  interface Document {
    body: HTMLElementLike;
    activeElement: HTMLElementLike | null;
    querySelector(selector: string): HTMLElementLike | null;
    createElement(tag: "input"): HTMLInputElementLike;
    createElement(tag: "select"): HTMLSelectElementLike;
    createElement(tag: "option"): HTMLOptionElementLike;
    createElement(tag: "textarea"): HTMLTextAreaElementLike;
    createElement(tag: string): HTMLElementLike;
  }
  const document: Document;

  function requestAnimationFrame(cb: (timestamp: number) => void): number;
  function cancelAnimationFrame(handle: number): void;
  function setTimeout(callback: () => void, delay: number): number;
  function setInterval(callback: () => void, delay: number): number;
  function clearInterval(handle: number): void;

  interface PanelOptions {
    name: string;
    icon: string;
    condition?: { modes?: string[]; formats?: string[]; features?: string[] };
    growable?: boolean;
    resizable?: boolean;
    default_position?: { slot: string; height: number; width: number; float_position?: [number, number]; float_size?: [number, number] };
    min_height?: number;
    onResize?: () => void;
  }

  class Panel {
    constructor(id: string, options: PanelOptions);
    node: HTMLElementLike;
    slot: string;
    moveTo(slot: string): void;
    fold(folded: boolean): void;
    selectTab(): void;
    moveToFront(): void;
    isVisible(): boolean;
    update(): void;
    delete(): void;
  }

  /**
   * Dialog form fields. `type: "text"` with a `list` renders a native
   * datalist — free typing plus a filtered dropdown of suggestions, which is
   * what the base-item picker uses (verified live).
   */
  interface DialogFormField {
    label?: string;
    type?: "text" | "number" | "select" | "checkbox" | "info" | "buttons";
    value?: string | number | boolean;
    text?: string;
    list?: string[];
    options?: Record<string, string>;
    buttons?: string[];
    click?(index: number): void;
    min?: number;
    max?: number;
    step?: number;
    description?: string;
    full_width?: boolean;
  }

  interface DialogOptions<T> {
    title: string;
    form?: Record<string, DialogFormField>;
    onConfirm?(result: T): boolean | void;
    onCancel?(): void;
  }

  class Dialog<T = Record<string, never>> {
    constructor(id: string, options: DialogOptions<T>);
    show(): void;
    setFormValues(values: Record<string, string | number | boolean>): void;
    delete(): void;
  }
}

export {};
