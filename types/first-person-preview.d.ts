/** Runtime surfaces verified against Blockbench Desktop 5.1.6. */
declare namespace THREE {
  class Vector3 {
    x: number; y: number; z: number;
    set(x: number, y: number, z: number): this;
    fromArray(values: number[]): this;
    copy(value: Vector3): this;
    multiplyScalar(value: number): this;
    applyEuler(value: Euler): this;
    sub(value: Vector3): this;
    add(value: Vector3): this;
  }
  class Euler {
    x: number; y: number; z: number;
    set(x: number, y: number, z: number): this;
  }
  class Matrix4 {
    elements: number[];
    toArray(): number[];
    copy(value: THREE_Matrix4): this;
    invert(): this;
    multiplyMatrices(a: Matrix4, b: THREE_Matrix4): this;
  }
  class Object3D {
    name: string;
    visible: boolean;
    parent: Object3D | null;
    children: Object3D[];
    position: Vector3;
    rotation: Euler;
    scale: Vector3;
    matrix: Matrix4;
    matrixWorld: Matrix4;
    matrixAutoUpdate: boolean;
    add(child: Object3D): this;
    remove(child: Object3D): this;
    clear(): this;
    updateMatrixWorld(force?: boolean): void;
    clone(recursive?: boolean): this;
  }
  class Mesh extends Object3D {
    constructor(geometry: unknown, material: unknown);
    geometry: unknown;
    material: unknown;
  }
  class Scene extends Object3D {}
  class PerspectiveCamera extends Object3D {
    constructor(fov: number, aspect: number, near: number, far: number);
    aspect: number;
    fov: number;
    projectionMatrix: Matrix4;
    projectionMatrixInverse: Matrix4;
    copy(source: PerspectiveCamera, recursive?: boolean): this;
    setFocalLength(value: number): void;
    updateProjectionMatrix(): void;
  }
  class WebGLRenderer {
    constructor(options: { alpha: boolean; antialias: boolean; preserveDrawingBuffer: boolean });
    domElement: HTMLElementLike;
    toneMapping: number;
    setSize(width: number, height: number): void;
    setPixelRatio(ratio: number): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
    forceContextLoss(): void;
  }
}
declare const Preview: {
  selected: { renderer: { toneMapping: number } };
  all: Array<{ id: string; width: number; height: number; camPers: THREE.PerspectiveCamera }>;
};

declare class ResizeObserver {
  constructor(callback: () => void);
  observe(element: HTMLElementLike): void;
  disconnect(): void;
}

declare const devicePixelRatio: number;
