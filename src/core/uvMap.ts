// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';

export const SKIN_TEX_SIZE = 64;

export type ModelType = 'classic' | 'slim';
export type LayerKind = 'base' | 'outer';
export type FaceName = 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back';

export type BasePartId = 'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export type OuterPartId = 'hat' | 'jacket' | 'rightSleeve' | 'leftSleeve' | 'rightPants' | 'leftPants';
export type PartId = BasePartId | OuterPartId;

/** [x, y, width, height] in 64x64 top-left pixel coordinates */
export type PixelRect = readonly [x: number, y: number, w: number, h: number];

export type CubeFacesUV = Record<FaceName, PixelRect>;

export interface SkinPartSpec {
  id: PartId;
  layer: LayerKind;
  /** Voxel dimensions [width(X), height(Y), depth(Z)] */
  size: readonly [number, number, number];
  /** Scale multiplier (1.0 for base, 1.12 for hat, 1.06 for jacket, etc.) */
  scale: number;
  /** Partner part for horizontal X-axis mirror symmetry */
  mirrorPartId: PartId;
  /**Corresponding base/outer counterpart on same body region */
  counterpartId: PartId;
  faces: CubeFacesUV;
}

export const BASE_PART_IDS: readonly BasePartId[] = [
  'head',
  'torso',
  'rightArm',
  'leftArm',
  'rightLeg',
  'leftLeg',
];

export const OUTER_PART_IDS: readonly OuterPartId[] = [
  'hat',
  'jacket',
  'rightSleeve',
  'leftSleeve',
  'rightPants',
  'leftPants',
];

export const ALL_PART_IDS: readonly PartId[] = [...BASE_PART_IDS, ...OUTER_PART_IDS];

export const FACE_NAMES: readonly FaceName[] = ['right', 'left', 'top', 'bottom', 'front', 'back'];

/**
 * Builds standard Minecraft 64x64 cuboid UV rects [x, y, w, h] from top-left origin (ox, oy)
 * and voxel dimensions (w, h, d).
 */
export function buildCuboidUV(ox: number, oy: number, w: number, h: number, d: number): CubeFacesUV {
  return {
    top: [ox + d, oy, w, d],
    bottom: [ox + d + w, oy, w, d],
    right: [ox, oy + d, d, h],
    front: [ox + d, oy + d, w, h],
    left: [ox + d + w, oy + d, d, h],
    back: [ox + d + w + d, oy + d, w, h],
  };
}

/**
 * Exact 64x64 UV mapping specification for all 6 Base parts and all 6 Outer parts,
 * supporting both Classic "Steve" (4px arms) and Slim "Alex" (3px arms).
 */
export function getSkinPartsSpec(model: ModelType): Record<PartId, SkinPartSpec> {
  const armW = model === 'slim' ? 3 : 4;

  return {
    // 1. Head (8x8x8) & Hat Outer (scale 1.12x, offset +32 on X)
    head: {
      id: 'head',
      layer: 'base',
      size: [8, 8, 8],
      scale: 1.0,
      mirrorPartId: 'head',
      counterpartId: 'hat',
      faces: {
        top: [8, 0, 8, 8],
        bottom: [16, 0, 8, 8],
        right: [0, 8, 8, 8],
        front: [8, 8, 8, 8],
        left: [16, 8, 8, 8],
        back: [24, 8, 8, 8],
      },
    },
    hat: {
      id: 'hat',
      layer: 'outer',
      size: [8, 8, 8],
      scale: 1.12,
      mirrorPartId: 'hat',
      counterpartId: 'head',
      faces: {
        top: [40, 0, 8, 8],
        bottom: [48, 0, 8, 8],
        right: [32, 8, 8, 8],
        front: [40, 8, 8, 8],
        left: [48, 8, 8, 8],
        back: [56, 8, 8, 8],
      },
    },

    // 2. Torso (8x12x4) & Jacket Outer (scale 1.06x at [16,32])
    torso: {
      id: 'torso',
      layer: 'base',
      size: [8, 12, 4],
      scale: 1.0,
      mirrorPartId: 'torso',
      counterpartId: 'jacket',
      faces: {
        top: [20, 16, 8, 4],
        bottom: [28, 16, 8, 4],
        right: [16, 20, 4, 12],
        front: [20, 20, 8, 12],
        left: [28, 20, 4, 12],
        back: [32, 20, 8, 12],
      },
    },
    jacket: {
      id: 'jacket',
      layer: 'outer',
      size: [8, 12, 4],
      scale: 1.06,
      mirrorPartId: 'jacket',
      counterpartId: 'torso',
      faces: buildCuboidUV(16, 32, 8, 12, 4),
    },

    // 3. Right Arm (Classic 4x12x4 at [40,16]; Slim 3x12x4 at [40,16]) & Sleeve Outer (+16 on Y)
    rightArm: {
      id: 'rightArm',
      layer: 'base',
      size: [armW, 12, 4],
      scale: 1.0,
      mirrorPartId: 'leftArm',
      counterpartId: 'rightSleeve',
      faces:
        model === 'slim'
          ? {
              top: [44, 16, 3, 4],
              bottom: [47, 16, 3, 4],
              right: [40, 20, 4, 12],
              front: [44, 20, 3, 12],
              left: [47, 20, 4, 12],
              back: [51, 20, 3, 12],
            }
          : buildCuboidUV(40, 16, 4, 12, 4),
    },
    rightSleeve: {
      id: 'rightSleeve',
      layer: 'outer',
      size: [armW, 12, 4],
      scale: 1.08,
      mirrorPartId: 'leftSleeve',
      counterpartId: 'rightArm',
      faces:
        model === 'slim'
          ? {
              top: [44, 32, 3, 4],
              bottom: [47, 32, 3, 4],
              right: [40, 36, 4, 12],
              front: [44, 36, 3, 12],
              left: [47, 36, 4, 12],
              back: [51, 36, 3, 12],
            }
          : buildCuboidUV(40, 32, 4, 12, 4),
    },

    // 4. Left Arm (Classic 4x12x4 at [32,48]; Slim 3x12x4 at [32,48]) & Sleeve Outer at [48,48]
    leftArm: {
      id: 'leftArm',
      layer: 'base',
      size: [armW, 12, 4],
      scale: 1.0,
      mirrorPartId: 'rightArm',
      counterpartId: 'leftSleeve',
      faces: buildCuboidUV(32, 48, armW, 12, 4),
    },
    leftSleeve: {
      id: 'leftSleeve',
      layer: 'outer',
      size: [armW, 12, 4],
      scale: 1.08,
      mirrorPartId: 'rightSleeve',
      counterpartId: 'leftArm',
      faces: buildCuboidUV(48, 48, armW, 12, 4),
    },

    // 5. Right Leg (4x12x4 at [0,16]) & Pants Outer at [0,32]
    rightLeg: {
      id: 'rightLeg',
      layer: 'base',
      size: [4, 12, 4],
      scale: 1.0,
      mirrorPartId: 'leftLeg',
      counterpartId: 'rightPants',
      faces: buildCuboidUV(0, 16, 4, 12, 4),
    },
    rightPants: {
      id: 'rightPants',
      layer: 'outer',
      size: [4, 12, 4],
      scale: 1.075,
      mirrorPartId: 'leftPants',
      counterpartId: 'rightLeg',
      faces: buildCuboidUV(0, 32, 4, 12, 4),
    },

    // 6. Left Leg (4x12x4 at [16,48]) & Pants Outer at [0,48]
    leftLeg: {
      id: 'leftLeg',
      layer: 'base',
      size: [4, 12, 4],
      scale: 1.0,
      mirrorPartId: 'rightLeg',
      counterpartId: 'leftPants',
      faces: buildCuboidUV(16, 48, 4, 12, 4),
    },
    leftPants: {
      id: 'leftPants',
      layer: 'outer',
      size: [4, 12, 4],
      scale: 1.075,
      mirrorPartId: 'rightPants',
      counterpartId: 'leftLeg',
      faces: buildCuboidUV(0, 48, 4, 12, 4),
    },
  };
}

/**
 * Resolves a local normal vector on a BoxGeometry into the exact Minecraft FaceName.
 * Note: Character faces +Z (Front) and +Y (Up), so character's anatomical Right is -X
 * and character's anatomical Left is +X.
 */
export function normalToFaceName(normal: { x: number; y: number; z: number }): FaceName {
  if (normal.x < -0.5) return 'right';
  if (normal.x > 0.5) return 'left';
  if (normal.y > 0.5) return 'top';
  if (normal.y < -0.5) return 'bottom';
  if (normal.z > 0.5) return 'front';
  return 'back';
}

/**
 * Computes exact vertex UV coordinates (tx, ty) in 64x64 top-left pixel space
 * for a corner with signs (sx, sy, sz) in {-1, +1} on the given cube face.
 * Ensures zero mirrored or upside-down faces (including Bottom and Back!).
 */
export function getCornerTexPixel(
  face: FaceName,
  rect: PixelRect,
  sx: number,
  sy: number,
  sz: number,
  insetPx = 1e-4
): [tx: number, ty: number] {
  const [rx, ry, rw, rh] = rect;
  const x0 = rx + insetPx;
  const x1 = rx + rw - insetPx;
  const y0 = ry + insetPx;
  const y1 = ry + rh - insetPx;

  switch (face) {
    case 'right': // -X face: -Z (back) is x0, +Z (front) is x1; +Y (top) is y0, -Y (bottom) is y1
      return [sz < 0 ? x0 : x1, sy > 0 ? y0 : y1];
    case 'left': // +X face: +Z (front) is x0, -Z (back) is x1; +Y (top) is y0, -Y (bottom) is y1
      return [sz > 0 ? x0 : x1, sy > 0 ? y0 : y1];
    case 'top': // +Y face: -X (right) is x0, +X (left) is x1; -Z (back) is y0, +Z (front) is y1
      return [sx < 0 ? x0 : x1, sz < 0 ? y0 : y1];
    case 'bottom': // -Y face: -X (right) is x0, +X (left) is x1; -Z (back) is y0, +Z (front) is y1
      return [sx < 0 ? x0 : x1, sz < 0 ? y0 : y1];
    case 'front': // +Z face: -X (right) is x0, +X (left) is x1; +Y (top) is y0, -Y (bottom) is y1
      return [sx < 0 ? x0 : x1, sy > 0 ? y0 : y1];
    case 'back': // -Z face: +X (left) is x0, -X (right) is x1; +Y (top) is y0, -Y (bottom) is y1
      return [sx > 0 ? x0 : x1, sy > 0 ? y0 : y1];
  }
}

/**
 * Applies exact 64x64 pixel-rect UVs to a THREE.BoxGeometry by reading each vertex's
 * 3D position and face normal directly, guaranteeing proper orientation on all 6 faces.
 * Also attaches a `uvBounds` vec4 attribute `[uMin, vMin, uMax, vMax]` per face so the
 * fragment shader clamps interpolated UVs strictly within each face's texel rectangle,
 * completely preventing MSAA silhouette edge UV bleeding from adjacent texture islands.
 */
export function applySkinBoxUVs(geometry: THREE.BoxGeometry, faces: CubeFacesUV): THREE.BoxGeometry {
  const posAttr = geometry.attributes.position;
  const normAttr = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;
  const boundsArray = new Float32Array(posAttr.count * 4);
  const clampInset = 0.01;

  for (let i = 0; i < posAttr.count; i++) {
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    const face = normalToFaceName({ x: nx, y: ny, z: nz });
    const rect = faces[face];
    const [rx, ry, rw, rh] = rect;

    const sx = posAttr.getX(i) >= 0 ? 1 : -1;
    const sy = posAttr.getY(i) >= 0 ? 1 : -1;
    const sz = posAttr.getZ(i) >= 0 ? 1 : -1;

    const [tx, ty] = getCornerTexPixel(face, rect, sx, sy, sz);
    const u = tx / SKIN_TEX_SIZE;
    const v = 1 - ty / SKIN_TEX_SIZE;
    uvAttr.setXY(i, u, v);

    const uMin = (rx + clampInset) / SKIN_TEX_SIZE;
    const uMax = (rx + rw - clampInset) / SKIN_TEX_SIZE;
    const vMin = 1 - (ry + rh - clampInset) / SKIN_TEX_SIZE;
    const vMax = 1 - (ry + clampInset) / SKIN_TEX_SIZE;

    const o = i * 4;
    boundsArray[o] = uMin;
    boundsArray[o + 1] = vMin;
    boundsArray[o + 2] = uMax;
    boundsArray[o + 3] = vMax;
  }

  geometry.setAttribute('uvBounds', new THREE.BufferAttribute(boundsArray, 4));
  uvAttr.needsUpdate = true;
  return geometry;
}

/**
 * Converts a Three.js raycast UV hit on a known (part, face) into an exact clamped
 * integer pixel [px, py] inside that face's UV rectangle.
 */
export function uvToFacePixel(uv: { x: number; y: number }, rect: PixelRect): [px: number, py: number] {
  const [rx, ry, rw, rh] = rect;
  const rawX = Math.floor(uv.x * SKIN_TEX_SIZE);
  const rawY = Math.floor((1 - uv.y) * SKIN_TEX_SIZE);
  const px = Math.max(rx, Math.min(rx + rw - 1, rawX));
  const py = Math.max(ry, Math.min(ry + rh - 1, rawY));
  return [px, py];
}

export interface FaceHitLookup {
  partId: PartId;
  layer: LayerKind;
  face: FaceName;
  rect: PixelRect;
}

/**
 * Finds which (partId, layer, face, rect) owns pixel (px, py) on the 64x64 canvas.
 * Returns null if (px, py) lies in an unused region of the 64x64 texture.
 */
export function findFaceAtPixel(
  px: number,
  py: number,
  model: ModelType
): FaceHitLookup | null {
  const specs = getSkinPartsSpec(model);
  for (const partId of ALL_PART_IDS) {
    const spec = specs[partId];
    for (const face of FACE_NAMES) {
      const rect = spec.faces[face];
      const [rx, ry, rw, rh] = rect;
      if (px >= rx && px < rx + rw && py >= ry && py < ry + rh) {
        return {
          partId,
          layer: spec.layer,
          face,
          rect,
        };
      }
    }
  }
  return null;
}

/**
 * Computes the horizontal X-axis mirror pixel (and mirrored face rect) for a pixel (px, py).
 * Mirrors across Head/Hat, Torso/Jacket, and paired Right<->Left Arms & Legs!
 */
export function getMirroredTarget(
  px: number,
  py: number,
  model: ModelType,
  knownHit?: { partId: PartId; face: FaceName }
): { px: number; py: number; partId: PartId; face: FaceName; rect: PixelRect } | null {
  const specs = getSkinPartsSpec(model);

  let partId: PartId;
  let face: FaceName;
  if (knownHit) {
    partId = knownHit.partId;
    face = knownHit.face;
  } else {
    const found = findFaceAtPixel(px, py, model);
    if (!found) return null;
    partId = found.partId;
    face = found.face;
  }

  const srcSpec = specs[partId];
  const srcRect = srcSpec.faces[face];
  const [rx, ry, rw] = srcRect;
  const lx = px - rx;
  const ly = py - ry;

  const dstPartId = srcSpec.mirrorPartId;
  const dstSpec = specs[dstPartId];
  const dstFace: FaceName =
    face === 'right' ? 'left' : face === 'left' ? 'right' : face;
  const dstRect = dstSpec.faces[dstFace];
  const [drx, dry, drw, drh] = dstRect;

  const mirroredLx = Math.max(0, Math.min(drw - 1, rw - 1 - lx));
  const mirroredLy = Math.max(0, Math.min(drh - 1, ly));

  return {
    px: drx + mirroredLx,
    py: dry + mirroredLy,
    partId: dstPartId,
    face: dstFace,
    rect: dstRect,
  };
}
