// SPDX-License-Identifier: GPL-3.0-only
import { applyAutoNoiseLightness, hexToRgba } from './palettes';
import {
  BASE_PART_IDS,
  FACE_NAMES,
  getSkinPartsSpec,
  SKIN_TEX_SIZE,
  type CubeFacesUV,
  type ModelType,
  type PixelRect,
} from './uvMap';

export type StarterTemplateId =
  | 'explorer'
  | 'adventurer'
  | 'knight'
  | 'astronaut'
  | 'robot'
  | 'blank';

export interface StarterTemplateMeta {
  id: StarterTemplateId;
  defaultModel: ModelType;
}

export const STARTER_TEMPLATES: readonly StarterTemplateMeta[] = [
  { id: 'explorer', defaultModel: 'classic' },
  { id: 'adventurer', defaultModel: 'slim' },
  { id: 'knight', defaultModel: 'classic' },
  { id: 'astronaut', defaultModel: 'classic' },
  { id: 'robot', defaultModel: 'classic' },
  { id: 'blank', defaultModel: 'classic' },
];

function fillRect(
  data: Uint8ClampedArray,
  rect: PixelRect,
  hex: string,
  noiseSeedOffset = 0,
  useNoise = false
): void {
  const base = hexToRgba(hex, 255);
  const [rx, ry, rw, rh] = rect;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) {
      const hash = Math.sin((x * 127.1 + y * 311.7 + noiseSeedOffset) * 43758.5453);
      const unit = hash - Math.floor(hash);
      const c = useNoise ? applyAutoNoiseLightness(base, unit) : base;
      const idx = (y * SKIN_TEX_SIZE + x) * 4;
      data[idx] = c.r;
      data[idx + 1] = c.g;
      data[idx + 2] = c.b;
      data[idx + 3] = c.a;
    }
  }
}

function fillCubeFaces(
  data: Uint8ClampedArray,
  faces: CubeFacesUV,
  hex: string,
  useNoise = true
): void {
  for (const f of FACE_NAMES) {
    fillRect(data, faces[f], hex, 17, useNoise);
  }
}

function setPx(data: Uint8ClampedArray, x: number, y: number, hex: string): void {
  if (x < 0 || x >= SKIN_TEX_SIZE || y < 0 || y >= SKIN_TEX_SIZE) return;
  const c = hexToRgba(hex, 255);
  const idx = (y * SKIN_TEX_SIZE + x) * 4;
  data[idx] = c.r;
  data[idx + 1] = c.g;
  data[idx + 2] = c.b;
  data[idx + 3] = 255;
}

function clearPx(data: Uint8ClampedArray, x: number, y: number): void {
  if (x < 0 || x >= SKIN_TEX_SIZE || y < 0 || y >= SKIN_TEX_SIZE) return;
  const idx = (y * SKIN_TEX_SIZE + x) * 4;
  data[idx] = 0;
  data[idx + 1] = 0;
  data[idx + 2] = 0;
  data[idx + 3] = 0;
}

function fillBoxPx(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  hex: string
): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      setPx(data, px, py, hex);
    }
  }
}

/**
 * Generates 6 clean procedural 64x64 offline starter skins:
 * Classic Explorer, Slim Adventurer, Knight, Astronaut, Robot, and Blank Canvas.
 */
export function generateStarterSkin(
  template: StarterTemplateId,
  model: ModelType
): ImageData {
  const img = new ImageData(SKIN_TEX_SIZE, SKIN_TEX_SIZE);
  const d = img.data; // initialized to RGBA(0,0,0,0)
  const specs = getSkinPartsSpec(model);
  const armW = model === 'slim' ? 3 : 4;
  const armStripW = 4 + armW + 4 + armW;

  // 1. BLANK CANVAS
  if (template === 'blank') {
    for (const partId of BASE_PART_IDS) {
      fillCubeFaces(d, specs[partId].faces, '#F3C39C', false);
    }
    setPx(d, 9, 12, '#FFFFFF');
    setPx(d, 10, 12, '#1E293B');
    setPx(d, 13, 12, '#1E293B');
    setPx(d, 14, 12, '#FFFFFF');
    fillBoxPx(d, 11, 14, 2, 1, '#D96B6B');
    return img;
  }

  // 2. CLASSIC EXPLORER
  if (template === 'explorer') {
    fillCubeFaces(d, specs.head.faces, '#F3C39C', false);
    fillRect(d, specs.head.faces.top, '#5C3A21', 3, true);
    fillRect(d, [24, 8, 8, 7], '#5C3A21', 5, true);
    fillRect(d, [0, 8, 8, 3], '#5C3A21', 7, true);
    fillRect(d, [0, 11, 3, 3], '#5C3A21', 7, true);
    fillRect(d, [16, 8, 8, 3], '#5C3A21', 9, true);
    fillRect(d, [21, 11, 3, 3], '#5C3A21', 9, true);
    fillBoxPx(d, 8, 8, 8, 2, '#5C3A21');
    setPx(d, 8, 10, '#5C3A21');
    setPx(d, 9, 10, '#6E472B');
    setPx(d, 15, 10, '#5C3A21');

    setPx(d, 9, 12, '#FFFFFF');
    setPx(d, 10, 12, '#0284C7');
    setPx(d, 13, 12, '#0284C7');
    setPx(d, 14, 12, '#FFFFFF');
    setPx(d, 9, 13, '#F4978E');
    setPx(d, 14, 13, '#F4978E');
    fillBoxPx(d, 11, 14, 2, 1, '#C25959');

    fillCubeFaces(d, specs.torso.faces, '#0EA5E9', true);
    fillBoxPx(d, 22, 20, 4, 2, '#F8FAFC');
    fillBoxPx(d, 23, 23, 2, 2, '#FBBF24');

    fillCubeFaces(d, specs.rightArm.faces, '#0EA5E9', true);
    fillCubeFaces(d, specs.leftArm.faces, '#0EA5E9', true);
    fillBoxPx(d, 40, 29, armStripW, 3, '#F3C39C');
    fillRect(d, specs.rightArm.faces.bottom, '#E6AC82', 1, false);
    fillBoxPx(d, 32, 61, armStripW, 3, '#F3C39C');
    fillRect(d, specs.leftArm.faces.bottom, '#E6AC82', 1, false);

    fillCubeFaces(d, specs.rightLeg.faces, '#334155', true);
    fillCubeFaces(d, specs.leftLeg.faces, '#334155', true);
    fillBoxPx(d, 0, 29, 16, 2, '#F43F5E');
    fillBoxPx(d, 0, 31, 16, 1, '#F8FAFC');
    fillRect(d, specs.rightLeg.faces.bottom, '#1E293B', 1, false);
    fillBoxPx(d, 16, 61, 16, 2, '#F43F5E');
    fillBoxPx(d, 16, 63, 16, 1, '#F8FAFC');
    fillRect(d, specs.leftLeg.faces.bottom, '#1E293B', 1, false);

    // Outer Headphones + Pocket + Cuffs (all hair stays on Head Base so coloring hair is seamless!)
    fillBoxPx(d, 40, 3, 8, 2, '#FBBF24');
    fillBoxPx(d, 34, 10, 4, 4, '#FBBF24');
    fillBoxPx(d, 35, 11, 2, 2, '#34D399');
    fillBoxPx(d, 50, 10, 4, 4, '#FBBF24');
    fillBoxPx(d, 51, 11, 2, 2, '#34D399');

    fillBoxPx(d, 21, 36, 1, 4, '#F8FAFC');
    fillBoxPx(d, 26, 36, 1, 4, '#F8FAFC');
    fillBoxPx(d, 21, 43, 6, 4, '#0284C7');
    fillBoxPx(d, 16, 47, 24, 1, '#0369A1');
    fillBoxPx(d, 40, 44, armStripW, 1, '#FBBF24');
    fillBoxPx(d, 48, 60, armStripW, 1, '#FBBF24');
    fillBoxPx(d, 0, 44, 16, 1, '#64748B');
    fillBoxPx(d, 0, 60, 16, 1, '#64748B');
    return img;
  }

  // 3. SLIM ADVENTURER (Alex 3px-ready forest & emerald explorer with scarf & goggles!)
  if (template === 'adventurer') {
    fillCubeFaces(d, specs.head.faces, '#FAD2B8', false);
    // Warm ginger-auburn hair + side braid
    fillRect(d, specs.head.faces.top, '#C2410C', 4, true);
    fillRect(d, [24, 8, 8, 8], '#C2410C', 6, true);
    fillRect(d, [0, 8, 8, 4], '#C2410C', 8, true);
    fillRect(d, [16, 8, 8, 4], '#C2410C', 9, true);
    fillBoxPx(d, 8, 8, 8, 2, '#EA580C');
    setPx(d, 8, 10, '#C2410C');
    setPx(d, 9, 10, '#EA580C');
    setPx(d, 14, 10, '#EA580C');
    setPx(d, 15, 10, '#C2410C');

    // Emerald eyes + cheerful expression
    setPx(d, 9, 12, '#FFFFFF');
    setPx(d, 10, 12, '#10B981');
    setPx(d, 13, 12, '#10B981');
    setPx(d, 14, 12, '#FFFFFF');
    setPx(d, 9, 13, '#F4978E');
    setPx(d, 14, 13, '#F4978E');
    fillBoxPx(d, 11, 14, 2, 1, '#D96B6B');

    // Emerald tunic + leather belt
    fillCubeFaces(d, specs.torso.faces, '#15803D', true);
    fillBoxPx(d, 16, 29, 24, 2, '#78350F');
    fillBoxPx(d, 23, 29, 2, 2, '#FBBF24');

    // Tunic short sleeves + gloves
    fillCubeFaces(d, specs.rightArm.faces, '#FAD2B8', false);
    fillCubeFaces(d, specs.leftArm.faces, '#FAD2B8', false);
    fillBoxPx(d, 40, 20, armStripW, 4, '#16A34A');
    fillRect(d, specs.rightArm.faces.top, '#16A34A', 2, true);
    fillBoxPx(d, 32, 52, armStripW, 4, '#16A34A');
    fillRect(d, specs.leftArm.faces.top, '#16A34A', 2, true);
    // Fingerless leather bracers
    fillBoxPx(d, 40, 28, armStripW, 2, '#92400E');
    fillBoxPx(d, 32, 60, armStripW, 2, '#92400E');

    // Trousers + tall explorer boots
    fillCubeFaces(d, specs.rightLeg.faces, '#57534E', true);
    fillCubeFaces(d, specs.leftLeg.faces, '#57534E', true);
    fillBoxPx(d, 0, 26, 16, 6, '#78350F');
    fillBoxPx(d, 16, 58, 16, 6, '#78350F');

    // Outer: Forehead Aviator Goggles on Hat + Scarf/Satchel on Jacket!
    fillBoxPx(d, 40, 9, 8, 2, '#78350F');
    fillBoxPx(d, 41, 9, 2, 2, '#38BDF8');
    fillBoxPx(d, 45, 9, 2, 2, '#38BDF8');
    // Braid tail on Hat Left
    fillBoxPx(d, 49, 12, 2, 4, '#EA580C');
    // Scarf collar + diagonal satchel on Jacket Outer
    fillBoxPx(d, 20, 36, 8, 2, '#FACC15');
    for (let i = 0; i < 8; i++) {
      setPx(d, 20 + i, 38 + i, '#92400E');
    }
    return img;
  }

  // 4. KNIGHT
  if (template === 'knight') {
    fillCubeFaces(d, specs.head.faces, '#E6AC82', false);
    setPx(d, 9, 12, '#FFFFFF');
    setPx(d, 10, 12, '#1E293B');
    setPx(d, 13, 12, '#1E293B');
    setPx(d, 14, 12, '#FFFFFF');
    fillBoxPx(d, 8, 8, 8, 3, '#78350F');

    fillCubeFaces(d, specs.torso.faces, '#94A3B8', true);
    fillBoxPx(d, 22, 22, 4, 6, '#EF4444');
    fillBoxPx(d, 23, 23, 2, 4, '#FBBF24');
    fillRect(d, specs.torso.faces.back, '#DC2626', 11, true);

    fillCubeFaces(d, specs.rightArm.faces, '#94A3B8', true);
    fillCubeFaces(d, specs.leftArm.faces, '#94A3B8', true);
    fillCubeFaces(d, specs.rightLeg.faces, '#64748B', true);
    fillCubeFaces(d, specs.leftLeg.faces, '#64748B', true);

    // Outer Steel Helmet with open face visor + crimson plume
    fillCubeFaces(d, specs.hat.faces, '#CBD5E1', true);
    for (let y = 11; y <= 14; y++) {
      for (let x = 41; x <= 46; x++) {
        clearPx(d, x, y);
      }
    }
    fillBoxPx(d, 43, 0, 2, 8, '#EF4444');
    fillBoxPx(d, 40, 10, 8, 1, '#FBBF24');

    // Gold shoulder pauldrons & belt
    fillBoxPx(d, 40, 36, armStripW, 4, '#FBBF24');
    fillRect(d, specs.rightSleeve.faces.top, '#FBBF24', 2, true);
    fillBoxPx(d, 48, 52, armStripW, 4, '#FBBF24');
    fillRect(d, specs.leftSleeve.faces.top, '#FBBF24', 2, true);
    fillBoxPx(d, 16, 45, 24, 2, '#78350F');
    fillBoxPx(d, 23, 45, 2, 2, '#FBBF24');
    return img;
  }

  // 5. ASTRONAUT
  if (template === 'astronaut') {
    // Friendly face inside space helmet
    fillCubeFaces(d, specs.head.faces, '#D69264', false);
    fillBoxPx(d, 8, 8, 8, 2, '#1E293B');
    setPx(d, 9, 12, '#FFFFFF');
    setPx(d, 10, 12, '#0F172A');
    setPx(d, 13, 12, '#0F172A');
    setPx(d, 14, 12, '#FFFFFF');
    fillBoxPx(d, 11, 14, 2, 1, '#F8FAFC');

    // White EVA Spacesuit
    fillCubeFaces(d, specs.torso.faces, '#F1F5F9', true);
    // Chest telemetry control unit + blue/orange stripes
    fillBoxPx(d, 21, 22, 6, 4, '#CBD5E1');
    setPx(d, 22, 23, '#EF4444');
    setPx(d, 24, 23, '#38BDF8');
    setPx(d, 25, 23, '#22C55E');
    fillBoxPx(d, 16, 28, 24, 2, '#2563EB');

    fillCubeFaces(d, specs.rightArm.faces, '#F1F5F9', true);
    fillCubeFaces(d, specs.leftArm.faces, '#F1F5F9', true);
    fillBoxPx(d, 40, 23, armStripW, 2, '#F97316'); // mission arm stripe
    fillBoxPx(d, 32, 55, armStripW, 2, '#2563EB');
    fillBoxPx(d, 40, 29, armStripW, 3, '#64748B'); // space gloves
    fillBoxPx(d, 32, 61, armStripW, 3, '#64748B');

    fillCubeFaces(d, specs.rightLeg.faces, '#E2E8F0', true);
    fillCubeFaces(d, specs.leftLeg.faces, '#E2E8F0', true);
    fillBoxPx(d, 0, 28, 16, 4, '#475569'); // moon boots
    fillBoxPx(d, 16, 60, 16, 4, '#475569');

    // Outer Space Helmet with Golden Solar Visor!
    fillCubeFaces(d, specs.hat.faces, '#F8FAFC', false);
    fillBoxPx(d, 41, 10, 6, 5, '#F59E0B'); // gold visor
    fillBoxPx(d, 42, 10, 4, 3, '#FBBF24');
    setPx(d, 42, 10, '#FEF08A'); // visor sun glint!

    // Outer Life-Support Oxygen Backpack on Jacket Back [32, 36, 8, 12]
    fillBoxPx(d, 33, 37, 6, 9, '#CBD5E1');
    fillBoxPx(d, 34, 38, 2, 7, '#94A3B8');
    fillBoxPx(d, 36, 38, 2, 7, '#94A3B8');
    return img;
  }

  // 6. ROBOT
  fillCubeFaces(d, specs.head.faces, '#475569', true);
  // Dark screen faceplate + glowing cyan LED eyes & voice bars
  fillBoxPx(d, 9, 10, 6, 5, '#0F172A');
  fillBoxPx(d, 9, 11, 2, 2, '#38BDF8');
  fillBoxPx(d, 13, 11, 2, 2, '#38BDF8');
  setPx(d, 10, 14, '#34D399');
  setPx(d, 12, 14, '#34D399');
  setPx(d, 13, 14, '#34D399');

  // Robot Chassis + Glowing Power Core
  fillCubeFaces(d, specs.torso.faces, '#334155', true);
  fillBoxPx(d, 21, 21, 6, 6, '#1E293B');
  fillBoxPx(d, 22, 22, 4, 4, '#0EA5E9');
  fillBoxPx(d, 23, 23, 2, 2, '#E0F2FE');
  fillBoxPx(d, 21, 29, 6, 2, '#F59E0B'); // hazard waist stripe

  fillCubeFaces(d, specs.rightArm.faces, '#64748B', true);
  fillCubeFaces(d, specs.leftArm.faces, '#64748B', true);
  fillBoxPx(d, 40, 25, armStripW, 2, '#D97706'); // copper elbow joint
  fillBoxPx(d, 32, 57, armStripW, 2, '#D97706');
  fillBoxPx(d, 40, 30, armStripW, 2, '#1E293B'); // robo-claws
  fillBoxPx(d, 32, 62, armStripW, 2, '#1E293B');

  fillCubeFaces(d, specs.rightLeg.faces, '#475569', true);
  fillCubeFaces(d, specs.leftLeg.faces, '#475569', true);
  fillBoxPx(d, 0, 25, 16, 2, '#D97706'); // copper knee joint
  fillBoxPx(d, 16, 57, 16, 2, '#D97706');
  fillBoxPx(d, 0, 30, 16, 2, '#1E293B');
  fillBoxPx(d, 16, 62, 16, 2, '#1E293B');

  // Robot Outer Antennae & Side Bolts on Hat + Armor Trim on Jacket
  fillBoxPx(d, 43, 2, 2, 4, '#38BDF8'); // top antenna beacon
  fillBoxPx(d, 34, 11, 3, 3, '#F59E0B'); // right ear bolt
  fillBoxPx(d, 51, 11, 3, 3, '#F59E0B'); // left ear bolt
  fillBoxPx(d, 20, 36, 8, 1, '#38BDF8');
  fillBoxPx(d, 20, 47, 8, 1, '#38BDF8');

  return img;
}
