// SPDX-License-Identifier: GPL-3.0-only
import {
  applyAutoNoiseLightness,
  hexToRgba,
  rgbToHex,
  type RGBAColor,
} from './palettes';
import type { SkinCanvasEngine } from './skinCanvas';
import {
  findFaceAtPixel,
  getMirroredTarget,
  SKIN_TEX_SIZE,
  type FaceName,
  type LayerKind,
  type ModelType,
  type PartId,
  type PixelRect,
} from './uvMap';

export type ToolId = 'pencil' | 'eraser' | 'bucket' | 'eyedropper';
export type BaseEraserMode = 'skin' | 'clear';

export interface PaintSettings {
  tool: ToolId;
  /** Which layer 3D painting targets when both Base and Outer meshes are visible ('base' by default) */
  targetLayer?: LayerKind;
  colorHex: string;
  baseSkinHex: string;
  baseEraserMode: BaseEraserMode;
  mirrorSymmetry: boolean;
  autoNoise: boolean;
  model: ModelType;
}

export interface HitContext {
  partId: PartId;
  layer: LayerKind;
  face: FaceName;
  rect: PixelRect;
}

export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    pts.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
  return pts;
}

function colorsEqual(a: RGBAColor, b: RGBAColor): boolean {
  if (a.a === 0 && b.a === 0) return true;
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/**
 * Stateful stroke controller managing Pencil, Eraser, UV-bounded Bucket Fill,
 * Eyedropper, X-Axis Mirror Symmetry, and +/-6% HSL Auto-Noise per stroke.
 */
export class PaintController {
  private readonly engine: SkinCanvasEngine;
  private visitedInStroke: Set<number> = new Set();
  private lastPoint: { px: number; py: number; partId?: PartId; face?: FaceName } | null = null;
  private strokeActive = false;

  public onColorPicked?: (hex: string) => void;
  public onColorUsed?: (hex: string) => void;

  constructor(engine: SkinCanvasEngine) {
    this.engine = engine;
  }

  public startStroke(
    px: number,
    py: number,
    settings: PaintSettings,
    hit?: HitContext
  ): void {
    if (settings.tool === 'eyedropper') {
      this.pickColorAt(px, py);
      return;
    }

    if (settings.tool === 'bucket') {
      this.engine.beginStroke();
      this.applyBucketFill(px, py, settings, hit);
      const changed = this.engine.commitStroke();
      if (changed) {
        this.onColorUsed?.(settings.colorHex);
      }
      return;
    }

    this.visitedInStroke.clear();
    this.lastPoint = null;
    this.strokeActive = true;
    this.engine.beginStroke();
    this.continueStroke(px, py, settings, hit);
  }

  public continueStroke(
    px: number,
    py: number,
    settings: PaintSettings,
    hit?: HitContext
  ): void {
    if (settings.tool === 'eyedropper') {
      this.pickColorAt(px, py);
      return;
    }
    if (!this.strokeActive) return;

    const resolvedHit = hit ?? findFaceAtPixel(px, py, settings.model) ?? undefined;

    // Interpolate along Bresenham line if dragging across the same UV face (or in 2D)
    const canInterpolate =
      this.lastPoint !== null &&
      ((resolvedHit &&
        this.lastPoint.partId === resolvedHit.partId &&
        this.lastPoint.face === resolvedHit.face) ||
        (!hit && !this.lastPoint.partId));

    const points =
      canInterpolate && this.lastPoint
        ? bresenhamLine(this.lastPoint.px, this.lastPoint.py, px, py)
        : [[px, py] as [number, number]];

    let mutated = false;
    for (const [ix, iy] of points) {
      const pointHit =
        resolvedHit &&
        ix >= resolvedHit.rect[0] &&
        ix < resolvedHit.rect[0] + resolvedHit.rect[2] &&
        iy >= resolvedHit.rect[1] &&
        iy < resolvedHit.rect[1] + resolvedHit.rect[3]
          ? resolvedHit
          : findFaceAtPixel(ix, iy, settings.model) ?? undefined;

      if (this.paintSingleWithSymmetry(ix, iy, settings, pointHit)) {
        mutated = true;
      }
    }

    this.lastPoint = {
      px,
      py,
      partId: resolvedHit?.partId,
      face: resolvedHit?.face,
    };

    if (mutated) {
      this.engine.notifyChange();
    }
  }

  public endStroke(settings: PaintSettings): void {
    if (!this.strokeActive) return;
    this.strokeActive = false;
    this.visitedInStroke.clear();
    this.lastPoint = null;
    const changed = this.engine.commitStroke();
    if (changed && settings.tool === 'pencil') {
      this.onColorUsed?.(settings.colorHex);
    }
  }

  public get isDrawing(): boolean {
    return this.strokeActive;
  }

  private pickColorAt(px: number, py: number): void {
    const c = this.engine.getPixel(px, py);
    if (c.a === 0) return;
    const hex = rgbToHex(c.r, c.g, c.b);
    this.onColorPicked?.(hex);
  }

  private resolveWriteColor(
    layer: LayerKind,
    settings: PaintSettings
  ): RGBAColor {
    if (settings.tool === 'eraser') {
      if (layer === 'outer') {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      if (settings.baseEraserMode === 'clear') {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      const skinRgba = hexToRgba(settings.baseSkinHex, 255);
      return settings.autoNoise ? applyAutoNoiseLightness(skinRgba) : skinRgba;
    }

    const baseRgba = hexToRgba(settings.colorHex, 255);
    return settings.autoNoise ? applyAutoNoiseLightness(baseRgba) : baseRgba;
  }

  private paintSingleWithSymmetry(
    px: number,
    py: number,
    settings: PaintSettings,
    hit?: HitContext
  ): boolean {
    if (px < 0 || px >= SKIN_TEX_SIZE || py < 0 || py >= SKIN_TEX_SIZE) {
      return false;
    }

    const idx = py * SKIN_TEX_SIZE + px;
    if (settings.autoNoise && this.visitedInStroke.has(idx)) {
      return false;
    }
    this.visitedInStroke.add(idx);

    // When hit is unknown (unused texture region), default to 'base' — the layer
    // only affects eraser behavior, and 'base' is the more common target.
    const layer: LayerKind = hit?.layer ?? 'base';
    const color = this.resolveWriteColor(layer, settings);
    this.engine.setPixel(px, py, color, true);

    if (settings.mirrorSymmetry) {
      const mirrored = getMirroredTarget(
        px,
        py,
        settings.model,
        hit ? { partId: hit.partId, face: hit.face } : undefined
      );
      if (mirrored && (mirrored.px !== px || mirrored.py !== py)) {
        const mIdx = mirrored.py * SKIN_TEX_SIZE + mirrored.px;
        if (!settings.autoNoise || !this.visitedInStroke.has(mIdx)) {
          this.visitedInStroke.add(mIdx);
          const mirrorColor = settings.autoNoise
            ? this.resolveWriteColor(layer, settings)
            : color;
          this.engine.setPixel(mirrored.px, mirrored.py, mirrorColor, true);
        }
      }
    }

    return true;
  }

  /**
   * Bucket Fill bounded strictly to the clicked UV face rectangle [rx, ry, rw, rh].
   */
  public applyBucketFill(
    px: number,
    py: number,
    settings: PaintSettings,
    hit?: HitContext
  ): void {
    const resolved = hit ?? findFaceAtPixel(px, py, settings.model);
    if (!resolved) return;

    this.floodFillFaceRect(px, py, resolved.rect, settings);

    if (settings.mirrorSymmetry) {
      const mirrored = getMirroredTarget(px, py, settings.model, {
        partId: resolved.partId,
        face: resolved.face,
      });
      if (mirrored) {
        const sameFaceAndSameSpot =
          mirrored.partId === resolved.partId &&
          mirrored.face === resolved.face &&
          colorsEqual(
            this.engine.getPixel(mirrored.px, mirrored.py),
            hexToRgba(settings.colorHex, 255)
          ) &&
          !settings.autoNoise;
        if (!sameFaceAndSameSpot) {
          this.floodFillFaceRect(
            mirrored.px,
            mirrored.py,
            mirrored.rect,
            settings
          );
        }
      }
    }

    this.engine.notifyChange();
  }

  private floodFillFaceRect(
    startX: number,
    startY: number,
    rect: PixelRect,
    settings: PaintSettings
  ): void {
    const [rx, ry, rw, rh] = rect;
    if (startX < rx || startX >= rx + rw || startY < ry || startY >= ry + rh) {
      return;
    }

    const imgData = this.engine.ctx.getImageData(0, 0, SKIN_TEX_SIZE, SKIN_TEX_SIZE);
    const data = imgData.data;

    const readAt = (x: number, y: number): RGBAColor => {
      const o = (y * SKIN_TEX_SIZE + x) * 4;
      return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
    };

    const writeAt = (x: number, y: number, c: RGBAColor): void => {
      const o = (y * SKIN_TEX_SIZE + x) * 4;
      data[o] = c.r;
      data[o + 1] = c.g;
      data[o + 2] = c.b;
      data[o + 3] = c.a;
    };

    const targetColor = readAt(startX, startY);
    const flatFill = hexToRgba(settings.colorHex, 255);
    if (!settings.autoNoise && colorsEqual(targetColor, flatFill)) {
      return;
    }

    const visited = new Uint8Array(rw * rh);
    const stack: Array<[number, number]> = [[startX, startY]];

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      const lx = cx - rx;
      const ly = cy - ry;
      if (lx < 0 || lx >= rw || ly < 0 || ly >= rh) continue;

      const vIdx = ly * rw + lx;
      if (visited[vIdx]) continue;
      if (!colorsEqual(readAt(cx, cy), targetColor)) continue;

      visited[vIdx] = 1;
      const fillCol = settings.autoNoise
        ? applyAutoNoiseLightness(flatFill)
        : flatFill;
      writeAt(cx, cy, fillCol);

      stack.push([cx + 1, cy]);
      stack.push([cx - 1, cy]);
      stack.push([cx, cy + 1]);
      stack.push([cx, cy - 1]);
    }

    this.engine.ctx.putImageData(imgData, 0, 0);
  }
}
