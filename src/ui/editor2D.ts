// SPDX-License-Identifier: GPL-3.0-only
import type { PaintController, PaintSettings } from '../core/paintTools';
import type { SkinCanvasEngine } from '../core/skinCanvas';
import {
  ALL_PART_IDS,
  FACE_NAMES,
  findFaceAtPixel,
  getMirroredTarget,
  getSkinPartsSpec,
  SKIN_TEX_SIZE,
  type PartId,
} from '../core/uvMap';
import type { I18nStore } from '../i18n/translations';
import type { HoverInfo } from '../viewport/skinStage3D';

const PART_GUIDE_COLORS: Record<PartId, string> = {
  head: '#FBBF24',
  hat: '#FDE047',
  torso: '#38BDF8',
  jacket: '#7DD3FC',
  rightArm: '#34D399',
  rightSleeve: '#6EE7B7',
  leftArm: '#10B981',
  leftSleeve: '#A7F3D0',
  rightLeg: '#FB7185',
  rightPants: '#FDA4AF',
  leftLeg: '#C084FC',
  leftPants: '#E9D5FF',
};

const DISPLAY_SCALE = 5; // 64 * 5 = 320px crisp canvas

export class SyncedEditor2D {
  public readonly root: HTMLElement;
  private readonly displayCanvas: HTMLCanvasElement;
  private readonly dCtx: CanvasRenderingContext2D;
  private readonly engine: SkinCanvasEngine;
  private readonly paintController: PaintController;
  private readonly getSettings: () => PaintSettings;
  private readonly i18n: I18nStore;

  private titleEl!: HTMLElement;
  private guidesBtn!: HTMLButtonElement;
  private hintEl!: HTMLElement;

  private showUvGuides = true;
  private hoverPixel: [number, number] | null = null;
  private isDragging = false;
  private activePointerId: number | null = null;

  public onHoverChange?: (info: HoverInfo | null) => void;

  constructor(
    engine: SkinCanvasEngine,
    paintController: PaintController,
    getSettings: () => PaintSettings,
    i18n: I18nStore
  ) {
    this.engine = engine;
    this.paintController = paintController;
    this.getSettings = getSettings;
    this.i18n = i18n;

    this.root = document.createElement('aside');
    this.root.className = 'editor2d-panel';

    const header = document.createElement('div');
    header.className = 'editor2d-header';

    this.titleEl = document.createElement('h3');
    this.titleEl.className = 'panel-heading';

    this.guidesBtn = document.createElement('button');
    this.guidesBtn.type = 'button';
    this.guidesBtn.className = 'chip-toggle active';
    this.guidesBtn.addEventListener('click', () => {
      this.showUvGuides = !this.showUvGuides;
      this.guidesBtn.classList.toggle('active', this.showUvGuides);
      this.render();
    });

    header.append(this.titleEl, this.guidesBtn);

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'editor2d-canvas-wrap';

    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.width = SKIN_TEX_SIZE * DISPLAY_SCALE;
    this.displayCanvas.height = SKIN_TEX_SIZE * DISPLAY_SCALE;
    this.displayCanvas.className = 'editor2d-canvas';

    const ctx = this.displayCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not initialize 2D grid display context');
    ctx.imageSmoothingEnabled = false;
    this.dCtx = ctx;

    canvasWrap.appendChild(this.displayCanvas);

    this.hintEl = document.createElement('p');
    this.hintEl.className = 'editor2d-hint';

    this.root.append(header, canvasWrap, this.hintEl);

    this.bindPointerEvents();
    this.engine.onChange(() => this.render());
    this.i18n.subscribe(() => this.updateLabels());

    this.updateLabels();
    this.render();
  }

  public setCollapsed(collapsed: boolean): void {
    this.root.classList.toggle('collapsed', collapsed);
  }

  public get isCollapsed(): boolean {
    return this.root.classList.contains('collapsed');
  }

  private updateLabels(): void {
    const t = this.i18n.t;
    this.titleEl.textContent = t.editor2DTitle;
    this.guidesBtn.textContent = t.editor2DUvGuides;
    this.guidesBtn.title = t.editor2DUvGuidesTooltip;
    this.hintEl.textContent = t.editor2DHint;
  }

  private eventToPixel(e: PointerEvent): [number, number] | null {
    const rect = this.displayCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * SKIN_TEX_SIZE);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * SKIN_TEX_SIZE);
    if (x < 0 || x >= SKIN_TEX_SIZE || y < 0 || y >= SKIN_TEX_SIZE) return null;
    return [x, y];
  }

  private bindPointerEvents(): void {
    const c = this.displayCanvas;

    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const pt = this.eventToPixel(e);
      if (!pt) return;
      e.preventDefault();

      const settings = this.getSettings();
      const hit = findFaceAtPixel(pt[0], pt[1], settings.model) ?? undefined;

      this.isDragging = true;
      this.activePointerId = e.pointerId;
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }

      this.paintController.startStroke(pt[0], pt[1], settings, hit);
      this.hoverPixel = pt;
      this.render();
    });

    c.addEventListener('pointermove', (e) => {
      const pt = this.eventToPixel(e);
      this.hoverPixel = pt;
      const settings = this.getSettings();

      if (this.isDragging && e.pointerId === this.activePointerId && pt) {
        const hit = findFaceAtPixel(pt[0], pt[1], settings.model) ?? undefined;
        this.paintController.continueStroke(pt[0], pt[1], settings, hit);
      }

      if (pt) {
        const hit = findFaceAtPixel(pt[0], pt[1], settings.model);
        if (hit) {
          this.onHoverChange?.({
            partId: hit.partId,
            layer: hit.layer,
            face: hit.face,
            px: pt[0],
            py: pt[1],
          });
        } else {
          this.onHoverChange?.(null);
        }
      } else {
        this.onHoverChange?.(null);
      }

      this.render();
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.isDragging || e.pointerId !== this.activePointerId) return;
      this.isDragging = false;
      this.activePointerId = null;
      this.paintController.endStroke(this.getSettings());
      try {
        if (c.hasPointerCapture(e.pointerId)) {
          c.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      this.render();
    };

    c.addEventListener('pointerup', endDrag);
    c.addEventListener('pointercancel', endDrag);
    c.addEventListener('pointerleave', () => {
      this.hoverPixel = null;
      if (!this.isDragging) {
        this.onHoverChange?.(null);
      }
      this.render();
    });
  }

  public render(): void {
    const W = this.displayCanvas.width;
    const H = this.displayCanvas.height;
    const S = DISPLAY_SCALE;
    const ctx = this.dCtx;
    const settings = this.getSettings();

    // 1. Checkerboard transparency backdrop
    for (let py = 0; py < SKIN_TEX_SIZE; py++) {
      for (let px = 0; px < SKIN_TEX_SIZE; px++) {
        ctx.fillStyle = (px + py) % 2 === 0 ? '#1E2436' : '#262E45';
        ctx.fillRect(px * S, py * S, S, S);
      }
    }

    // Dim unused texture areas slightly when UV guides are shown so active skin islands pop!
    if (this.showUvGuides) {
      ctx.fillStyle = 'rgba(10, 12, 20, 0.48)';
      ctx.fillRect(0, 0, W, H);
      const specs = getSkinPartsSpec(settings.model);
      for (const partId of ALL_PART_IDS) {
        for (const face of FACE_NAMES) {
          const [rx, ry, rw, rh] = specs[partId].faces[face];
          for (let py = ry; py < ry + rh; py++) {
            for (let px = rx; px < rx + rw; px++) {
              ctx.fillStyle = (px + py) % 2 === 0 ? '#232B42' : '#2D3753';
              ctx.fillRect(px * S, py * S, S, S);
            }
          }
        }
      }
    }

    // 2. Draw crisp 64x64 RGBA texture
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.engine.canvas, 0, 0, W, H);

    // 3. Subtle 1px pixel grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < SKIN_TEX_SIZE; i++) {
      ctx.moveTo(i * S + 0.5, 0);
      ctx.lineTo(i * S + 0.5, H);
      ctx.moveTo(0, i * S + 0.5);
      ctx.lineTo(W, i * S + 0.5);
    }
    ctx.stroke();

    // 4. Optional UV Face Rect outlines
    if (this.showUvGuides) {
      const specs = getSkinPartsSpec(settings.model);
      for (const partId of ALL_PART_IDS) {
        const spec = specs[partId];
        ctx.strokeStyle = PART_GUIDE_COLORS[partId];
        ctx.lineWidth = 1;
        if (spec.layer === 'outer') {
          ctx.setLineDash([3, 2]);
        } else {
          ctx.setLineDash([]);
        }
        for (const face of FACE_NAMES) {
          const [rx, ry, rw, rh] = spec.faces[face];
          ctx.strokeRect(rx * S + 0.5, ry * S + 0.5, rw * S - 1, rh * S - 1);
        }
      }
      ctx.setLineDash([]);
    }

    // 5. Hovered pixel + Mirrored pixel cursors
    if (this.hoverPixel) {
      const [hx, hy] = this.hoverPixel;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx * S + 0.5, hy * S + 0.5, S - 1, S - 1);

      if (settings.mirrorSymmetry && settings.tool !== 'eyedropper') {
        const mirrored = getMirroredTarget(hx, hy, settings.model);
        if (mirrored && (mirrored.px !== hx || mirrored.py !== hy)) {
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(
            mirrored.px * S + 0.5,
            mirrored.py * S + 0.5,
            S - 1,
            S - 1
          );
        }
      }
    }
  }
}
