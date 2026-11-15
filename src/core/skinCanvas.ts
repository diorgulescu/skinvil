// SPDX-License-Identifier: GPL-3.0-only
import { SKIN_TEX_SIZE } from './uvMap';
import type { RGBAColor } from './palettes';

export const MAX_UNDO_STEPS = 50;

export type CanvasChangeListener = () => void;

function cloneImageData(src: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
}

function imageDataEquals(a: ImageData, b: ImageData): boolean {
  if (a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

/**
 * Offscreen 64x64 RGBA HTMLCanvasElement acting as the single source of truth
 * for both the Three.js CanvasTexture and the 2D flat pixel-grid editor,
 * complete with a 50-step ImageData Undo/Redo stack.
 */
export class SkinCanvasEngine {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;

  private undoStack: ImageData[] = [];
  private redoStack: ImageData[] = [];
  private pendingStrokeSnapshot: ImageData | null = null;
  private listeners: Set<CanvasChangeListener> = new Set();

  constructor(canvasEl?: HTMLCanvasElement) {
    this.canvas = canvasEl ?? document.createElement('canvas');
    this.canvas.width = SKIN_TEX_SIZE;
    this.canvas.height = SKIN_TEX_SIZE;

    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to create 2D context for 64x64 skin canvas');
    }
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  public onChange(listener: CanvasChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notifyChange(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public captureSnapshot(): ImageData {
    return cloneImageData(this.ctx.getImageData(0, 0, SKIN_TEX_SIZE, SKIN_TEX_SIZE));
  }

  /**
   * Call before starting a continuous brush stroke or atomic edit.
   */
  public beginStroke(): void {
    if (!this.pendingStrokeSnapshot) {
      this.pendingStrokeSnapshot = this.captureSnapshot();
    }
  }

  /**
   * Call when finishing a stroke or atomic edit. Pushes onto Undo stack (max 50)
   * only if pixels actually changed.
   */
  public commitStroke(): boolean {
    if (!this.pendingStrokeSnapshot) return false;
    const before = this.pendingStrokeSnapshot;
    this.pendingStrokeSnapshot = null;

    const after = this.ctx.getImageData(0, 0, SKIN_TEX_SIZE, SKIN_TEX_SIZE);
    if (imageDataEquals(before, after)) {
      return false;
    }

    this.undoStack.push(before);
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.notifyChange();
    return true;
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get undoCount(): number {
    return this.undoStack.length;
  }

  public get redoCount(): number {
    return this.redoStack.length;
  }

  public undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;

    const current = this.captureSnapshot();
    this.redoStack.push(current);
    if (this.redoStack.length > MAX_UNDO_STEPS) {
      this.redoStack.shift();
    }

    this.ctx.putImageData(prev, 0, 0);
    this.notifyChange();
    return true;
  }

  public redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;

    const current = this.captureSnapshot();
    this.undoStack.push(current);
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift();
    }

    this.ctx.putImageData(next, 0, 0);
    this.notifyChange();
    return true;
  }

  public clearHistory(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pendingStrokeSnapshot = null;
    this.notifyChange();
  }

  public getPixel(x: number, y: number): RGBAColor {
    if (x < 0 || x >= SKIN_TEX_SIZE || y < 0 || y >= SKIN_TEX_SIZE) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const d = this.ctx.getImageData(x, y, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  }

  public setPixel(x: number, y: number, color: RGBAColor, silent = false): void {
    if (x < 0 || x >= SKIN_TEX_SIZE || y < 0 || y >= SKIN_TEX_SIZE) return;
    const img = this.ctx.createImageData(1, 1);
    img.data[0] = color.r;
    img.data[1] = color.g;
    img.data[2] = color.b;
    img.data[3] = color.a;
    this.ctx.putImageData(img, x, y);
    if (!silent) {
      this.notifyChange();
    }
  }

  public replaceWithImageData(img: ImageData, recordUndo = true): void {
    if (recordUndo) {
      this.beginStroke();
    }
    this.ctx.putImageData(img, 0, 0);
    if (recordUndo) {
      this.commitStroke();
    } else {
      this.notifyChange();
    }
  }

  public async toPngBytes(): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>((resolve) =>
      this.canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) {
      throw new Error('Failed to encode 64x64 PNG');
    }
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  }

  /**
   * Imports a 64x64 (or legacy 64x32 auto-converted to 64x64!) skin image file.
   */
  public async loadFromImageElement(img: HTMLImageElement, recordUndo = true): Promise<void> {
    if (recordUndo) {
      this.beginStroke();
    }
    this.ctx.clearRect(0, 0, SKIN_TEX_SIZE, SKIN_TEX_SIZE);

    if (img.naturalWidth === 64 && img.naturalHeight === 32) {
      // Legacy 64x32 Minecraft skin -> auto-convert to modern 64x64 format!
      this.ctx.drawImage(img, 0, 0, 64, 32, 0, 0, 64, 32);
      // Copy right leg [0,16,16,16] -> left leg [16,48,16,16] & right arm [40,16,16,16] -> left arm [32,48,16,16]
      this.ctx.drawImage(img, 4, 16, 4, 4, 20, 48, 4, 4);
      this.ctx.drawImage(img, 8, 16, 4, 4, 24, 48, 4, 4);
      this.ctx.drawImage(img, 0, 20, 4, 12, 24, 52, 4, 12);
      this.ctx.drawImage(img, 4, 20, 4, 12, 20, 52, 4, 12);
      this.ctx.drawImage(img, 8, 20, 4, 12, 16, 52, 4, 12);
      this.ctx.drawImage(img, 12, 20, 4, 12, 28, 52, 4, 12);

      this.ctx.drawImage(img, 44, 16, 4, 4, 36, 48, 4, 4);
      this.ctx.drawImage(img, 48, 16, 4, 4, 40, 48, 4, 4);
      this.ctx.drawImage(img, 40, 20, 4, 12, 40, 52, 4, 12);
      this.ctx.drawImage(img, 44, 20, 4, 12, 36, 52, 4, 12);
      this.ctx.drawImage(img, 48, 20, 4, 12, 32, 52, 4, 12);
      this.ctx.drawImage(img, 52, 20, 4, 12, 44, 52, 4, 12);
    } else {
      this.ctx.drawImage(img, 0, 0, SKIN_TEX_SIZE, SKIN_TEX_SIZE);
    }

    if (recordUndo) {
      this.commitStroke();
    } else {
      this.notifyChange();
    }
  }
}
