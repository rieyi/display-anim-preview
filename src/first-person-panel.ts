/** Independent first-person view of the live animation pose. */
import { FORMAT_ID } from "./format";
import { tr } from "./i18n";

// User-approved reference viewport: 1986 × 1112 pixels.
export const FIRST_PERSON_ASPECT = 993 / 556;

export type FirstPersonSide = "right" | "left";

/** Matches the native monitor reference and display camera in Blockbench 5.1.6. */
export function firstPersonFocalLength(aspect: number): number {
  return aspect > 1.7 ? 18 / aspect : aspect > 1 ? 16.57 - 3.57 * aspect : 13 * aspect;
}

/** Fits the complete display view without changing its framing. */
export function fitFirstPersonViewport(width: number, height: number, aspect: number): { width: number; height: number } {
  return width / height > aspect
    ? { width: height * aspect, height }
    : { width, height: width / aspect };
}

export function applyFirstPersonDisplay(
  base: THREE.Object3D,
  entry: DisplaySettingsEntry | undefined,
  side: FirstPersonSide,
): void {
  const sign = side === "left" ? -1 : 1;
  const rotation = entry?.rotation ?? [0, 0, 0];
  const translation = entry?.translation ?? [0, 0, 0];
  const scale = entry?.scale ?? [1, 1, 1];
  const mirror = entry?.mirror ?? [false, false, false];
  base.rotation.set(rotation[0] * Math.PI / 180, sign * rotation[1] * Math.PI / 180, sign * rotation[2] * Math.PI / 180);
  base.position.set(sign * translation[0], translation[1], translation[2]);
  base.scale.set((scale[0] || 0.001) * (mirror[0] ? -1 : 1), (scale[1] || 0.001) * (mirror[1] ? -1 : 1), (scale[2] || 0.001) * (mirror[2] ? -1 : 1));
  const pivot = new THREE.Vector3().fromArray(entry?.rotation_pivot ?? [0, 0, 0]).multiplyScalar(16);
  const original = new THREE.Vector3().copy(pivot);
  base.position.sub(pivot.applyEuler(base.rotation).sub(original));
  pivot.fromArray(entry?.scale_pivot ?? [0, 0, 0]).multiplyScalar(16).applyEuler(base.rotation);
  pivot.x *= 1 - scale[0];
  pivot.y *= 1 - scale[1];
  pivot.z *= 1 - scale[2];
  base.position.add(pivot);
}

/** Applies the user-approved 131% framing to the native projection. */
export function applyFirstPersonScale(matrix: THREE_Matrix4): void {
  matrix.elements[0] *= 1.31;
  matrix.elements[5] *= 1.31;
}

let panel: Panel | null = null;
let frame: number | null = null;
let disposeView: (() => void) | null = null;

export function registerFirstPersonPanel(): void {
  if (panel) return;
  let side: FirstPersonSide = "right";
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.height = "100%";
  wrapper.style.minHeight = "0";
  wrapper.style.minWidth = "0";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.overflow = "hidden";
  wrapper.style.gap = "4px";
  wrapper.style.padding = "4px";
  const select = document.createElement("select");
  select.title = tr("dap.fp.side");
  select.style.width = "100%";
  select.style.minWidth = "0";
  select.style.flex = "0 0 auto";
  for (const value of ["right", "left"]) {
    const option = document.createElement("option");
    option.value = value;
    option.innerText = tr(`dap.slot.firstperson_${value}hand`);
    select.appendChild(option);
  }
  select.onchange = () => { side = select.value === "left" ? "left" : "right"; };
  wrapper.appendChild(select);
  const viewport = document.createElement("div");
  viewport.className = "dap_first_person_viewport";
  viewport.style.position = "relative";
  viewport.style.flex = "0 0 auto";
  viewport.style.minHeight = "0";
  viewport.style.overflow = "hidden";
  viewport.style.background = "transparent";
  viewport.style.display = "flex";
  viewport.style.alignItems = "flex-start";
  viewport.style.justifyContent = "center";
  const picture = document.createElement("div");
  picture.className = "dap_first_person_frame";
  picture.style.position = "relative";
  picture.style.background = "var(--color-back)";
  picture.style.outline = "1px solid var(--color-border)";
  picture.style.flex = "0 0 auto";
  viewport.appendChild(picture);
  wrapper.appendChild(viewport);
  panel = new Panel("display_anim_first_person", {
    name: tr("dap.fp.name"), icon: "visibility",
    condition: { modes: ["animate"], formats: [FORMAT_ID, "java_block_sequence"] },
    growable: true, resizable: true, min_height: 190,
    default_position: { slot: "left_bar", height: 270, width: 340 },
  });
  panel.node.appendChild(wrapper);

  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const area = new THREE.Object3D();
  const base = new THREE.Object3D();
  const model = new THREE.Object3D();
  // Java item geometry is centered on [8, 8, 8] in Display mode.
  model.position.set(-8, -8, -8);
  scene.add(area); area.add(base); base.add(model);
  const camera = new THREE.PerspectiveCamera(70, 1, 1, 30000);
  camera.position.set(0, 24, 32.4);
  camera.aspect = FIRST_PERSON_ASPECT;
  camera.setFocalLength(firstPersonFocalLength(FIRST_PERSON_ASPECT));
  const inverseRoot = new THREE.Matrix4();
  const copies = new Map<THREE.Mesh, THREE.Mesh>();
  let sourceRoot: THREE.Object3D | null = null;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let lights: THREE.Object3D | null = null;

  function updateLayout(force = false): boolean {
    const aspect = FIRST_PERSON_ASPECT;
    const availableHeight = Math.max(0, wrapper.clientHeight - select.clientHeight - 12);
    const { width: nextWidth, height: nextHeight } = fitFirstPersonViewport(viewport.clientWidth, availableHeight, aspect);

    const nextPixelRatio = devicePixelRatio;
    if (force || nextWidth !== width || nextHeight !== height || pixelRatio !== nextPixelRatio) {
      pixelRatio = nextPixelRatio;
      renderer?.setPixelRatio(pixelRatio);
      width = nextWidth; height = nextHeight;
      viewport.style.height = `${height}px`;
      picture.style.width = `${width}px`;
      picture.style.height = `${height}px`;
      renderer?.setSize(width, height);
      if (renderer) {
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
      }
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    return width > 0 && height > 0;
  }
  const resizeObserver = new ResizeObserver(() => updateLayout());
  resizeObserver.observe(wrapper);

  function render(): void {
    frame = requestAnimationFrame(render);
    if (sourceRoot && sourceRoot !== Project?.model_3d) {
      model.clear(); copies.clear(); sourceRoot = null;
      if (lights) scene.remove(lights);
      lights = null;
    }
    if (!panel?.isVisible() || !panel.node.isConnected || Modes.selected.id !== "animate" || !Project || ![FORMAT_ID, "java_block_sequence"].includes(Format.id)) return;
    if (!updateLayout()) return;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.pointerEvents = "none";
      picture.appendChild(renderer.domElement);
      const crosshair = document.createElement("span");
      crosshair.innerText = "+";
      crosshair.style.position = "absolute";
      crosshair.style.left = "50%";
      crosshair.style.top = "50%";
      crosshair.style.transform = "translate(-50%, -50%)";
      crosshair.style.pointerEvents = "none";
      picture.appendChild(crosshair);
      updateLayout(true);
    }
    renderer.toneMapping = Preview.selected.renderer.toneMapping;
    if (sourceRoot !== Project.model_3d) {
      model.clear(); copies.clear();
      sourceRoot = Project.model_3d;
      if (lights) scene.remove(lights);
      lights = Canvas.scene.children.find(child => child.name === "lights")?.clone(true) ?? null;
      if (lights) scene.add(lights);
    }
    area.position.set(side === "left" ? -9.039 : 9.039, 24 - 8.318, 20.8);
    applyFirstPersonDisplay(base, Project.display_settings[`firstperson_${side}hand`], side);
    sourceRoot.updateMatrixWorld(true);
    inverseRoot.copy(sourceRoot.matrixWorld).invert();
    const active = new Set<THREE.Mesh>();
    for (const element of Outliner.elements) {
      const source = element.mesh;
      if (!(source instanceof THREE.Mesh)) continue;
      active.add(source);
      let copy = copies.get(source);
      if (!copy) {
        copy = new THREE.Mesh(source.geometry, source.material);
        copy.matrixAutoUpdate = false;
        copies.set(source, copy);
        model.add(copy);
      }
      copy.geometry = source.geometry;
      copy.material = source.material;
      copy.visible = element.visibility !== false;
      for (let ancestor: THREE.Object3D | null = source; ancestor && ancestor !== sourceRoot; ancestor = ancestor.parent) {
        if (!ancestor.visible) copy.visible = false;
      }
      copy.matrix.multiplyMatrices(inverseRoot, source.matrixWorld);
    }
    for (const [source, copy] of copies) {
      if (!active.has(source)) { model.remove(copy); copies.delete(source); }
    }
    // Keep native camera pose, but use the approved viewport dimensions.
    const nativePreview = Preview.all.find(preview => preview.id === "display");
    if (nativePreview && DisplayMode.display_slot.startsWith("firstperson_")) {
      camera.copy(nativePreview.camPers, false);
      camera.updateProjectionMatrix();
    }
    camera.aspect = FIRST_PERSON_ASPECT;
    camera.setFocalLength(firstPersonFocalLength(FIRST_PERSON_ASPECT));
    camera.updateProjectionMatrix();
    applyFirstPersonScale(camera.projectionMatrix);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    renderer.render(scene, camera);
  }
  disposeView = () => {
    resizeObserver.disconnect();
    copies.clear(); model.clear(); scene.clear();
    // Geometry, textures and materials belong to the project, not this view.
    renderer?.dispose(); renderer?.forceContextLoss();
    renderer = null;
  };
  frame = requestAnimationFrame(render);
}

export function disposeFirstPersonPanel(): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  disposeView?.(); disposeView = null;
  panel?.delete(); panel = null;
}

/** Reopens the view without moving a visible docked or floating panel. */
export function openFirstPersonPanel(): void {
  registerFirstPersonPanel();
  if (!panel) return;
  if (Modes.selected.id !== "animate") Modes.options.animate?.select();
  if (panel.slot === "hidden") panel.moveTo("left_bar");
  panel.fold(false);
  panel.selectTab();
  panel.moveToFront();
  panel.update();
}
