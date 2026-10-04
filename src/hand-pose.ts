/** Pure matrix helpers and user-calibrated first-person constants for animated player arms. */

export interface HandPoseMatrix {
  /** Column-major rigid transform of the arm group in Blockbench model space. */
  matrix: number[];
  /** Animated preview center in model pixels, independent of the group pivot. */
  center?: number[];
}

export interface BakedHandPoses {
  left: HandPoseMatrix;
  right: HandPoseMatrix;
}

export const IDENTITY_MATRIX = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export function multiplyMatrices(left: number[], right: number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let index = 0; index < 4; index++) {
        result[column * 4 + row] += left[index * 4 + row] * right[column * 4 + index];
      }
    }
  }
  return result;
}

export function invertRigidMatrix(matrix: number[]): number[] {
  if (matrix.length !== 16) throw new Error("Expected a 4×4 hand matrix.");
  const result = IDENTITY_MATRIX.slice();
  // Hand scaling is rejected before export, so the inverse is transpose(R) + translated origin.
  for (let column = 0; column < 3; column++) {
    for (let row = 0; row < 3; row++) result[column * 4 + row] = matrix[row * 4 + column];
  }
  const x = matrix[12], y = matrix[13], z = matrix[14];
  result[12] = -(result[0] * x + result[4] * y + result[8] * z);
  result[13] = -(result[1] * x + result[5] * y + result[9] * z);
  result[14] = -(result[2] * x + result[6] * y + result[10] * z);
  return result;
}

/** Rigid motion of an arm group since its bind pose: current ∘ bind⁻¹. */
export function relativeHandMatrix(current: number[], bind: number[]): HandPoseMatrix {
  return { matrix: multiplyMatrices(current, invertRigidMatrix(bind)) };
}

function assertRigidHandPose(pose?: HandPoseMatrix): number[] {
  const matrix = pose?.matrix ?? IDENTITY_MATRIX;
  if (matrix.length !== 16 || matrix.some((value) => !Number.isFinite(value))) {
    throw new Error("Expected a finite 4×4 hand matrix.");
  }
  for (let column = 0; column < 3; column++) {
    for (let other = 0; other < 3; other++) {
      const dot = [0, 1, 2].reduce((sum, row) => sum + matrix[column * 4 + row] * matrix[other * 4 + row], 0);
      if (Math.abs(dot - (column === other ? 1 : 0)) > 0.0001) {
        throw new Error("Hand pose contains scale or shear; only position and rotation are supported.");
      }
    }
  }
  const determinant = matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6])
    - matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2])
    + matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
  if (Math.abs(determinant - 1) > 0.0001 || [3, 7, 11].some((i) => Math.abs(matrix[i]) > 0.0001)
      || Math.abs(matrix[15] - 1) > 0.0001) {
    throw new Error("Hand pose must be a proper rigid affine transform.");
  }
  return matrix;
}

/**
 * Bind-pose display values measured directly in Minecraft 26.2 with the standard
 * 4×4×12 arm placeholder. The rotations differ per side so no head face points
 * straight at the camera (that face would shimmer in first person). Translation
 * follows the display-adjust page axes: horizontal x, vertical y, depth z.
 */
export const HAND_CALIBRATION: Record<"left" | "right", { rotation: number[]; translation: number[] }> = {
  left: { rotation: [0, 180, 0], translation: [-20.3, 5.5, 1.7] },
  right: { rotation: [180, 0, 0], translation: [-1, 1.4, 1.5] },
};

/**
 * Fixed left/right marker scales consumed by the patched entity shader. Hands are
 * identified by their rig group naming; these values are never derived from
 * Blockbench and must not be edited.
 */
export const HAND_MARKER_SCALE: Record<"left" | "right", number[]> = {
  left: [0.471, 0.515, 1.515],
  right: [0.46629, 0.50985, 1.49985],
};

/**
 * The player-head special must keep the reference transform byte-for-byte stable.
 * Translation is in block units and only re-centers the special on the item.
 */
export function handSpecialTransformation(): Record<string, number[]> {
  return {
    left_rotation: [1, 0, 0, 0],
    right_rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    translation: [0.5, 0, 0.5],
  };
}

function degrees(value: number): number {
  return value * Math.PI / 180;
}

/**
 * Minecraft item-display XYZ Euler convention, stored column-major.
 * Exported for tests: equivalent Euler triples must compare by matrix, not text.
 */
export function eulerXyzMatrix(rotation: number[], translation: number[] = [0, 0, 0], scale: number[] = [1, 1, 1]): number[] {
  const x = degrees(rotation[0]);
  const y = degrees(rotation[1]);
  const z = degrees(rotation[2]);
  const a = Math.cos(x), b = Math.sin(x);
  const c = Math.cos(y), d = Math.sin(y);
  const e = Math.cos(z), f = Math.sin(z);
  return [
    c * e * scale[0],
    (a * f + b * e * d) * scale[0],
    (b * f - a * e * d) * scale[0],
    0,
    -c * f * scale[1],
    (a * e - b * f * d) * scale[1],
    (b * e + a * f * d) * scale[1],
    0,
    d * scale[2],
    -b * c * scale[2],
    a * c * scale[2],
    0,
    translation[0], translation[1], translation[2], 1,
  ];
}

function radiansToDegrees(value: number): number {
  return value * 180 / Math.PI;
}

function cleanNumber(value: number): number {
  if (Math.abs(value) < 1e-10) return 0;
  return Number(value.toFixed(8));
}

function matrixEulerXyz(matrix: number[]): number[] {
  const sx = Math.hypot(matrix[0], matrix[1], matrix[2]) || 1;
  const sy = Math.hypot(matrix[4], matrix[5], matrix[6]) || 1;
  const sz = Math.hypot(matrix[8], matrix[9], matrix[10]) || 1;
  const m00 = matrix[0] / sx;
  const m01 = matrix[4] / sy;
  const m11 = matrix[5] / sy;
  const m21 = matrix[6] / sy;
  const m02 = Math.max(-1, Math.min(1, matrix[8] / sz));
  const m12 = matrix[9] / sz;
  const m22 = matrix[10] / sz;
  let x: number;
  const y = Math.asin(m02);
  let z: number;
  if (Math.abs(m02) < 0.9999999) {
    x = Math.atan2(-m12, m22);
    z = Math.atan2(-m01, m00);
  } else {
    x = Math.atan2(m21, m11);
    z = 0;
  }
  return [x, y, z].map((value) => cleanNumber(radiansToDegrees(value)));
}

export interface HandDisplayTransform {
  rotation: number[];
  translation: number[];
  scale: number[];
}

/** Fixed authoring anchors, independent of edited rest poses and preview cube sizes. */
export const HAND_REFERENCE_PIVOT: Record<"left" | "right", number[]> = {
  left: [2, 2, 16],
  right: [14, 2, 16],
};

/** Capture absolute group placement against the fixed authoring reference, never the edited bind pose. */
export function captureHandPose(side: "left" | "right", current: number[]): HandPoseMatrix {
  assertRigidHandPose({ matrix: current });
  return relativeHandMatrix(current, eulerXyzMatrix([0, 0, 0], HAND_REFERENCE_PIVOT[side]));
}

/**
 * Map model-space rigid motion to the calibrated display-space anchor.
 * Position axes remain parallel; the per-side 180-degree face correction applies
 * to geometry only, never to the user's translation. Conjugation moves the
 * rotation pivot into display space before applying motion to the base display.
 * The reference arm extends six pixels forward from its rear pivot to its center.
 * This anchor is a coordinate convention, not a measurement of preview geometry.
 */
export function animatedHandDisplay(side: "left" | "right", pose?: HandPoseMatrix): HandDisplayTransform {
  const delta = assertRigidHandPose(pose);
  const calibration = HAND_CALIBRATION[side];
  if (delta.every((value, index) => Math.abs(value - IDENTITY_MATRIX[index]) < 1e-9)) {
    return {
      rotation: calibration.rotation.slice(),
      translation: calibration.translation.slice(),
      scale: HAND_MARKER_SCALE[side].slice(),
    };
  }
  const base = eulerXyzMatrix(calibration.rotation, calibration.translation);
  // In 26.2 the fixed special and item centering put the head center at
  // (0, -4 * markerScale.y, 0) pixels before the base rotation.
  const centerY = -4 * HAND_MARKER_SCALE[side][1];
  const pivotOffset = [base[4] * centerY, base[5] * centerY, base[6] * centerY + 6];
  const anchorTranslation = calibration.translation.map((value, axis) =>
    value + pivotOffset[axis] - HAND_REFERENCE_PIVOT[side][axis]);
  const anchor = eulerXyzMatrix([0, 0, 0], anchorTranslation);
  const motion = multiplyMatrices(multiplyMatrices(anchor, delta), invertRigidMatrix(anchor));
  const combined = multiplyMatrices(motion, base);
  return {
    rotation: matrixEulerXyz(combined),
    translation: [combined[12], combined[13], combined[14]].map(cleanNumber),
    scale: HAND_MARKER_SCALE[side].slice(),
  };
}

/** Position the fixed-size game arm in the same item/display space as the preview. */
export function previewAlignedHandDisplay(
  side: "left" | "right", pose: HandPoseMatrix,
  display: Partial<HandDisplayTransform> = {}, leftContext = false
): HandDisplayTransform {
  const delta = assertRigidHandPose(pose);
  const group = multiplyMatrices(delta, eulerXyzMatrix([0, 0, 0], HAND_REFERENCE_PIVOT[side]));
  const rotation = (display.rotation ?? [0, 0, 0]).slice();
  const translation = (display.translation ?? [0, 0, 0]).slice();
  if (leftContext) {
    translation[0] *= -1;
    rotation[1] *= -1;
    rotation[2] *= -1;
  }
  const displayRotation = eulerXyzMatrix(rotation);
  const displayMatrix = eulerXyzMatrix(rotation, translation, display.scale ?? [1, 1, 1]);
  // Java item coordinates are centered on [8,8,8]. The authored arm anchor
  // is six pixels forward of the rear group pivot; preview size is not sampled.
  const center = pose.center
    ? pose.center.map(value => value - 8)
    : [0, 1, 2].map(axis => group[12 + axis] - 6 * group[8 + axis] - 8);
  const target = [0, 1, 2].map(axis => displayMatrix[12 + axis]
    + center.reduce((sum, value, column) => sum + displayMatrix[column * 4 + axis] * value, 0));
  const orientation = multiplyMatrices(multiplyMatrices(displayRotation, group),
    eulerXyzMatrix(HAND_CALIBRATION[side].rotation));
  // Item centering + fixed special transform put the unrotated head center
  // at [0,-4*scale.y,0]. Remove that offset to solve the display translation.
  const offset = -4 * HAND_MARKER_SCALE[side][1];
  const resultTranslation = target.map((value, axis) => cleanNumber(value - orientation[4 + axis] * offset));
  const resultRotation = matrixEulerXyz(orientation);
  if (leftContext) {
    resultTranslation[0] *= -1;
    resultRotation[1] *= -1;
    resultRotation[2] *= -1;
  }
  return { rotation: resultRotation, translation: resultTranslation, scale: HAND_MARKER_SCALE[side].slice() };
}
