// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    public readonly data: Uint8ClampedArray;
    public readonly width: number;
    public readonly height: number;
    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? dataOrWidth.length / (4 * widthOrHeight);
      }
    }
  }
  (globalThis as unknown as { ImageData: typeof ImageDataPolyfill }).ImageData = ImageDataPolyfill;
}

import * as THREE from 'three';
import {
  ALL_PART_IDS,
  applySkinBoxUVs,
  FACE_NAMES,
  getMirroredTarget,
  getSkinPartsSpec,
  normalToFaceName,
  uvToFacePixel,
} from '../core/uvMap';
import {
  applyAutoNoiseLightness,
  hexToRgba,
  rgbToHsl,
} from '../core/palettes';
import { MAX_UNDO_STEPS, SkinCanvasEngine } from '../core/skinCanvas';
import { PaintController, type PaintSettings } from '../core/paintTools';
import { generateStarterSkin, STARTER_TEMPLATES } from '../core/starterSkins';
import {
  convertLegacy64x32Rgba,
  createRootZipArchive,
  detectSkinGeometryFromRgba,
  sanitizeAsciiSlug,
} from '../core/wardrobeClient';
import { I18nStore } from '../i18n/translations';

describe('Exact 64x64 UV Box Mapping Specification', () => {
  it('matches exact Classic (Steve 4px) UV rects for all 6 Base and 6 Outer parts', () => {
    const c = getSkinPartsSpec('classic');

    // Head (8x8x8) & Hat Outer (+32 on X, scale 1.12x)
    expect(c.head.faces).toEqual({
      top: [8, 0, 8, 8],
      bottom: [16, 0, 8, 8],
      right: [0, 8, 8, 8],
      front: [8, 8, 8, 8],
      left: [16, 8, 8, 8],
      back: [24, 8, 8, 8],
    });
    expect(c.hat.scale).toBeCloseTo(1.12);
    expect(c.hat.faces).toEqual({
      top: [40, 0, 8, 8],
      bottom: [48, 0, 8, 8],
      right: [32, 8, 8, 8],
      front: [40, 8, 8, 8],
      left: [48, 8, 8, 8],
      back: [56, 8, 8, 8],
    });

    // Torso (8x12x4) & Jacket Outer (scale 1.06x at [16,32])
    expect(c.torso.faces).toEqual({
      top: [20, 16, 8, 4],
      bottom: [28, 16, 8, 4],
      right: [16, 20, 4, 12],
      front: [20, 20, 8, 12],
      left: [28, 20, 4, 12],
      back: [32, 20, 8, 12],
    });
    expect(c.jacket.scale).toBeCloseTo(1.06);
    expect(c.jacket.faces).toEqual({
      top: [20, 32, 8, 4],
      bottom: [28, 32, 8, 4],
      right: [16, 36, 4, 12],
      front: [20, 36, 8, 12],
      left: [28, 36, 4, 12],
      back: [32, 36, 8, 12],
    });

    // Right Arm Classic [40,16] & Sleeve [40,32]
    expect(c.rightArm.faces.front).toEqual([44, 20, 4, 12]);
    expect(c.rightSleeve.faces.front).toEqual([44, 36, 4, 12]);

    // Left Arm Classic [32,48] & Sleeve [48,48]
    expect(c.leftArm.faces.front).toEqual([36, 52, 4, 12]);
    expect(c.leftSleeve.faces.front).toEqual([52, 52, 4, 12]);

    // Right Leg [0,16] & Pants [0,32]
    expect(c.rightLeg.faces.front).toEqual([4, 20, 4, 12]);
    expect(c.rightPants.faces.front).toEqual([4, 36, 4, 12]);

    // Left Leg [16,48] & Pants [0,48]
    expect(c.leftLeg.faces.front).toEqual([20, 52, 4, 12]);
    expect(c.leftPants.faces.front).toEqual([4, 52, 4, 12]);
  });

  it('matches exact Slim (Alex 3px) UV rects for Right and Left Arms & Sleeves', () => {
    const s = getSkinPartsSpec('slim');
    expect(s.rightArm.faces).toEqual({
      top: [44, 16, 3, 4],
      bottom: [47, 16, 3, 4],
      right: [40, 20, 4, 12],
      front: [44, 20, 3, 12],
      left: [47, 20, 4, 12],
      back: [51, 20, 3, 12],
    });
    expect(s.rightSleeve.faces).toEqual({
      top: [44, 32, 3, 4],
      bottom: [47, 32, 3, 4],
      right: [40, 36, 4, 12],
      front: [44, 36, 3, 12],
      left: [47, 36, 4, 12],
      back: [51, 36, 3, 12],
    });
    expect(s.leftArm.faces).toEqual({
      top: [36, 48, 3, 4],
      bottom: [39, 48, 3, 4],
      right: [32, 52, 4, 12],
      front: [36, 52, 3, 12],
      left: [39, 52, 4, 12],
      back: [43, 52, 3, 12],
    });
    expect(s.leftSleeve.faces).toEqual({
      top: [52, 48, 3, 4],
      bottom: [55, 48, 3, 4],
      right: [48, 52, 4, 12],
      front: [52, 52, 3, 12],
      left: [55, 52, 4, 12],
      back: [59, 52, 3, 12],
    });
  });

  it('has zero overlapping UV rectangles across all 72 faces in both models', () => {
    for (const model of ['classic', 'slim'] as const) {
      const specs = getSkinPartsSpec(model);
      const owner = new Array<string | null>(64 * 64).fill(null);
      for (const partId of ALL_PART_IDS) {
        for (const face of FACE_NAMES) {
          const [rx, ry, rw, rh] = specs[partId].faces[face];
          expect(rx).toBeGreaterThanOrEqual(0);
          expect(ry).toBeGreaterThanOrEqual(0);
          expect(rx + rw).toBeLessThanOrEqual(64);
          expect(ry + rh).toBeLessThanOrEqual(64);

          for (let y = ry; y < ry + rh; y++) {
            for (let x = rx; x < rx + rw; x++) {
              const key = `${partId}.${face}`;
              expect(owner[y * 64 + x]).toBeNull();
              owner[y * 64 + x] = key;
            }
          }
        }
      }
    }
  });

  it('raycasts all 6 faces of Head BoxGeometry with proper unflipped UV orientation', () => {
    const headSpec = getSkinPartsSpec('classic').head;
    const geo = applySkinBoxUVs(new THREE.BoxGeometry(8, 8, 8), headSpec.faces);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();

    // 1. Front (+Z): top-right of character's face (-X=-3.5, +Y=+3.5, +Z) -> pixel [8, 8]
    raycaster.set(new THREE.Vector3(-3.5, 3.5, 20), new THREE.Vector3(0, 0, -1));
    let hit = raycaster.intersectObject(mesh)[0];
    expect(normalToFaceName(hit.face!.normal)).toBe('front');
    expect(uvToFacePixel(hit.uv!, headSpec.faces.front)).toEqual([8, 8]);

    // 2. Bottom (-Y): front chin (-X=-3.5, -Y, +Z=+3.5) -> pixel [16, 15? wait: y=0+8-1=7!]
    raycaster.set(new THREE.Vector3(-3.5, -20, 3.5), new THREE.Vector3(0, 1, 0));
    hit = raycaster.intersectObject(mesh)[0];
    expect(normalToFaceName(hit.face!.normal)).toBe('bottom');
    expect(uvToFacePixel(hit.uv!, headSpec.faces.bottom)).toEqual([16, 7]);

    // 3. Top (+Y): front hairline (-X=-3.5, +Y, +Z=+3.5) -> pixel [8, 7]
    raycaster.set(new THREE.Vector3(-3.5, 20, 3.5), new THREE.Vector3(0, -1, 0));
    hit = raycaster.intersectObject(mesh)[0];
    expect(normalToFaceName(hit.face!.normal)).toBe('top');
    expect(uvToFacePixel(hit.uv!, headSpec.faces.top)).toEqual([8, 7]);

    // 4. Right (-X): front cheek edge (-X, +Y=+3.5, +Z=+3.5) -> pixel [7, 8]
    raycaster.set(new THREE.Vector3(-20, 3.5, 3.5), new THREE.Vector3(1, 0, 0));
    hit = raycaster.intersectObject(mesh)[0];
    expect(normalToFaceName(hit.face!.normal)).toBe('right');
    expect(uvToFacePixel(hit.uv!, headSpec.faces.right)).toEqual([7, 8]);

    // 5. Left (+X): front cheek edge (+X, +Y=+3.5, +Z=+3.5) -> pixel [16, 8]
    raycaster.set(new THREE.Vector3(20, 3.5, 3.5), new THREE.Vector3(-1, 0, 0));
    hit = raycaster.intersectObject(mesh)[0];
    expect(normalToFaceName(hit.face!.normal)).toBe('left');
    expect(uvToFacePixel(hit.uv!, headSpec.faces.left)).toEqual([16, 8]);

    // 6. Back (-Z): (+X=+3.5, +Y=+3.5, -Z) -> pixel [24, 8]
    raycaster.set(new THREE.Vector3(3.5, 3.5, -20), new THREE.Vector3(0, 0, 1));
    hit = raycaster.intersectObject(mesh)[0];
    expect(normalToFaceName(hit.face!.normal)).toBe('back');
    expect(uvToFacePixel(hit.uv!, headSpec.faces.back)).toEqual([24, 8]);
  });

  it('attaches strict per-face uvBounds attributes that prevent MSAA UV bleeding across islands', () => {
    const specs = getSkinPartsSpec('classic');
    for (const partId of ALL_PART_IDS) {
      const spec = specs[partId];
      const [w, h, d] = spec.size;
      const geo = applySkinBoxUVs(new THREE.BoxGeometry(w, h, d), spec.faces);
      const uvAttr = geo.attributes.uv;
      const normAttr = geo.attributes.normal;
      const boundsAttr = geo.attributes.uvBounds;

      expect(boundsAttr).toBeDefined();
      expect(boundsAttr.count).toBe(24);
      expect(boundsAttr.itemSize).toBe(4);

      for (let i = 0; i < uvAttr.count; i++) {
        const face = normalToFaceName({
          x: normAttr.getX(i),
          y: normAttr.getY(i),
          z: normAttr.getZ(i),
        });
        const [rx, ry, rw, rh] = spec.faces[face];
        const exactUMin = rx / 64;
        const exactUMax = (rx + rw) / 64;
        const exactVMin = 1 - (ry + rh) / 64;
        const exactVMax = 1 - ry / 64;

        const uMin = boundsAttr.getX(i);
        const vMin = boundsAttr.getY(i);
        const uMax = boundsAttr.getZ(i);
        const vMax = boundsAttr.getW(i);

        // Bounds must sit strictly inside the exact face rectangle soNearestFilter never samples adjacent islands
        expect(uMin).toBeGreaterThan(exactUMin);
        expect(uMax).toBeLessThan(exactUMax);
        expect(vMin).toBeGreaterThan(exactVMin);
        expect(vMax).toBeLessThan(exactVMax);
        expect(uMin).toBeLessThan(uMax);
        expect(vMin).toBeLessThan(vMax);
      }
    }
  });
});

describe('Mirror Symmetry, Noise, Bucket Fill & 50-Step Undo/Redo', () => {
  it('mirrors horizontally across face, torso, and paired limbs (Classic & Slim)', () => {
    // Head Front: eye at (9, 12) mirrors to (14, 12)
    expect(getMirroredTarget(9, 12, 'classic')?.px).toBe(14);
    expect(getMirroredTarget(9, 12, 'classic')?.py).toBe(12);

    // Head Right ear front edge (7, 10) mirrors to Head Left ear front edge (16, 10)
    const earMirror = getMirroredTarget(7, 10, 'classic');
    expect(earMirror?.partId).toBe('head');
    expect(earMirror?.face).toBe('left');
    expect([earMirror?.px, earMirror?.py]).toEqual([16, 10]);

    // Slim Right Arm outer shoulder [40, 20, 4, 12] at (43, 22) -> Slim Left Arm outer shoulder [39, 52, 4, 12] at (39, 54)
    const slimMirror = getMirroredTarget(43, 22, 'slim');
    expect(slimMirror?.partId).toBe('leftArm');
    expect(slimMirror?.face).toBe('left');
    expect([slimMirror?.px, slimMirror?.py]).toEqual([39, 54]);
  });

  it('keeps Auto-Texture / Noise strictly within +/-6% HSL lightness', () => {
    const base = hexToRgba('#38BDF8', 255);
    const baseHsl = rgbToHsl(base.r, base.g, base.b);

    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const noisy = applyAutoNoiseLightness(base, r);
      const noisyHsl = rgbToHsl(noisy.r, noisy.g, noisy.b);
      expect(Math.abs(noisyHsl.l - baseHsl.l)).toBeLessThanOrEqual(0.066); // accounting for 8-bit RGB rounding
    }
  });

  it('bounds Bucket Fill strictly to the clicked UV face rectangle and caps Undo at 50 steps', () => {
    // Mock minimal 64x64 ImageData-backed 2D context for headless Node/JSDOM test
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    const fakeCanvas = {
      width: 64,
      height: 64,
      getContext: () => ({
        imageSmoothingEnabled: false,
        getImageData: (x: number, y: number, w: number, h: number) => {
          const out = new Uint8ClampedArray(w * h * 4);
          for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
              const src = ((y + row) * 64 + (x + col)) * 4;
              const dst = (row * w + col) * 4;
              out[dst] = pixels[src];
              out[dst + 1] = pixels[src + 1];
              out[dst + 2] = pixels[src + 2];
              out[dst + 3] = pixels[src + 3];
            }
          }
          return new ImageData(out, w, h);
        },
        putImageData: (img: ImageData, dx: number, dy: number) => {
          for (let row = 0; row < img.height; row++) {
            for (let col = 0; col < img.width; col++) {
              const src = (row * img.width + col) * 4;
              const dst = ((dy + row) * 64 + (dx + col)) * 4;
              pixels[dst] = img.data[src];
              pixels[dst + 1] = img.data[src + 1];
              pixels[dst + 2] = img.data[src + 2];
              pixels[dst + 3] = img.data[src + 3];
            }
          }
        },
        createImageData: (w: number, h: number) => new ImageData(w, h),
        clearRect: () => pixels.fill(0),
      }),
    } as unknown as HTMLCanvasElement;

    const engine = new SkinCanvasEngine(fakeCanvas);
    const controller = new PaintController(engine);
    const settings: PaintSettings = {
      tool: 'bucket',
      colorHex: '#FF0000',
      baseSkinHex: '#F3C39C',
      baseEraserMode: 'skin',
      mirrorSymmetry: false,
      autoNoise: false,
      model: 'classic',
    };

    // Bucket fill Head Front [8, 8, 8, 8]
    controller.startStroke(10, 10, settings);

    // Every pixel inside [8..15, 8..15] must be red, and adjacent Head Top (10, 7) & Head Left (16, 10) untouched!
    expect(engine.getPixel(8, 8)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(engine.getPixel(15, 15)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(engine.getPixel(10, 7).a).toBe(0);
    expect(engine.getPixel(16, 10).a).toBe(0);

    // Eraser on Outer Layer Hat [40, 8, 8, 8] sets alpha=0
    controller.startStroke(42, 10, { ...settings, tool: 'pencil', colorHex: '#00FF00' });
    controller.endStroke({ ...settings, tool: 'pencil', colorHex: '#00FF00' });
    expect(engine.getPixel(42, 10).a).toBe(255);

    controller.startStroke(42, 10, { ...settings, tool: 'eraser' });
    controller.endStroke({ ...settings, tool: 'eraser' });
    expect(engine.getPixel(42, 10).a).toBe(0);

    // Push 60 strokes and verify Undo stack is strictly capped at 50 steps
    for (let i = 0; i < 60; i++) {
      const hex = `#${(i + 10).toString(16).padStart(2, '0')}2233`;
      controller.startStroke(8, 8, { ...settings, tool: 'pencil', colorHex: hex });
      controller.endStroke({ ...settings, tool: 'pencil', colorHex: hex });
    }
    expect(engine.undoCount).toBe(MAX_UNDO_STEPS);
    expect(MAX_UNDO_STEPS).toBe(50);

    // Verify Undo & Redo round-trip restores exact pixel data
    const latestPx = engine.getPixel(8, 8);
    expect(engine.undo()).toBe(true);
    expect(engine.getPixel(8, 8)).not.toEqual(latestPx);
    expect(engine.redo()).toBe(true);
    expect(engine.getPixel(8, 8)).toEqual(latestPx);
  });

  it('defaults to Romanian (RO) and toggles instantly to English (EN)', () => {
    // Mock document.documentElement for headless Node environment
    if (typeof globalThis.document === 'undefined') {
      (globalThis as unknown as { document: { documentElement: { lang: string } } }).document = {
        documentElement: { lang: 'ro' },
      };
    }
    const store = new I18nStore();
    expect(store.currentLocale).toBe('ro');
    expect(store.t.toolPencil).toBe('Creion');

    store.toggleLocale();
    expect(store.currentLocale).toBe('en');
    expect(store.t.toolPencil).toBe('Pencil');
  });

  it('generates all 6 offline starter skins with proper Slim/Classic detection pixel (54, 20)', () => {
    expect(STARTER_TEMPLATES.map((s) => s.id)).toEqual([
      'explorer',
      'adventurer',
      'knight',
      'astronaut',
      'robot',
      'blank',
    ]);

    for (const meta of STARTER_TEMPLATES) {
      const img = generateStarterSkin(meta.id, meta.defaultModel);
      expect(img.width).toBe(64);
      expect(img.height).toBe(64);
      // Unused corner (0, 0) remains transparent
      expect(img.data[3]).toBe(0);
      // Head Front center (12, 12) is opaque
      expect(img.data[(12 * 64 + 12) * 4 + 3]).toBe(255);

      // Auto-detection on (54, 20) matches template's defaultModel!
      const detected = detectSkinGeometryFromRgba(img.data, 64, 64);
      expect(detected).toBe(meta.defaultModel);
    }

    // Explorer hair sits strictly on Head Base, leaving Hat Front [40..47, 8..15] completely transparent
    const explorerImg = generateStarterSkin('explorer', 'classic');
    for (let y = 8; y < 16; y++) {
      for (let x = 40; x < 48; x++) {
        expect(explorerImg.data[(y * 64 + x) * 4 + 3]).toBe(0);
      }
    }
  });

  it('converts legacy 64x32 RGBA, detects 128x128 HD geometry, sanitizes slugs, and builds root ZIPs', () => {
    const legacy = new Uint8ClampedArray(64 * 32 * 4);
    // Paint Right Arm outer col 0 at (40, 20) and Right Arm Back at (54, 20)
    legacy[(20 * 64 + 40) * 4] = 250;
    legacy[(20 * 64 + 40) * 4 + 3] = 255;
    legacy[(20 * 64 + 54) * 4 + 2] = 200;
    legacy[(20 * 64 + 54) * 4 + 3] = 255;

    const modern = convertLegacy64x32Rgba(legacy);
    expect(modern.length).toBe(64 * 64 * 4);
    expect(detectSkinGeometryFromRgba(modern, 64, 64)).toBe('classic');
    // Mirrored Left Arm Left col 3 at (43, 52)
    expect(modern[(52 * 64 + 43) * 4]).toBe(250);
    expect(modern[(52 * 64 + 43) * 4 + 3]).toBe(255);
    // Outer Jacket (20, 36) cleared
    expect(modern[(36 * 64 + 20) * 4 + 3]).toBe(0);

    // 128x128 HD auto-detection at (108, 40)
    const hd = new Uint8ClampedArray(128 * 128 * 4);
    expect(detectSkinGeometryFromRgba(hd, 128, 128)).toBe('slim');
    hd[(40 * 128 + 108) * 4 + 3] = 255;
    expect(detectSkinGeometryFromRgba(hd, 128, 128)).toBe('classic');

    // Slugification with Romanian diacritics
    expect(sanitizeAsciiSlug('Cavalerul Roșu & Șmecher!')).toBe('cavalerul_rosu_smecher');

    // Root ZIP archive header signature PK\x03\x04
    const zip = createRootZipArchive([
      { name: 'manifest.json', data: new TextEncoder().encode('{}') },
    ]);
    expect([zip[0], zip[1], zip[2], zip[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});
