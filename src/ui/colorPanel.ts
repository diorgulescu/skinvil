// SPDX-License-Identifier: GPL-3.0-only
import {
  DEFAULT_RECENT_COLORS,
  hexToRgba,
  hsvToRgb,
  KID_PALETTES,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
  type HSVColor,
  type PaletteCategoryId,
} from '../core/palettes';
import type { I18nStore } from '../i18n/translations';

export class ColorWorkshopPanel {
  public readonly root: HTMLElement;
  private readonly i18n: I18nStore;
  private readonly onColorChange: (hex: string) => void;

  private activeHex = '#38BDF8';
  private hsv: HSVColor = rgbToHsv(0x38, 0xbd, 0xf8);
  private activeCategory: PaletteCategoryId = 'vibrantHoodies';
  private recentColors: string[] = [...DEFAULT_RECENT_COLORS];

  private titleEl!: HTMLElement;
  private previewSwatch!: HTMLElement;
  private hexInput!: HTMLInputElement;

  private svCanvas!: HTMLCanvasElement;
  private svCtx!: CanvasRenderingContext2D;
  private hueCanvas!: HTMLCanvasElement;
  private hueCtx!: CanvasRenderingContext2D;

  private recentTitleEl!: HTMLElement;
  private recentGrid!: HTMLElement;
  private palettesTitleEl!: HTMLElement;
  private categoryTabsWrap!: HTMLElement;
  private paletteGrid!: HTMLElement;

  constructor(i18n: I18nStore, initialHex: string, onColorChange: (hex: string) => void) {
    this.i18n = i18n;
    this.onColorChange = onColorChange;
    this.activeHex = normalizeHex(initialHex) ?? '#38BDF8';
    const rgba = hexToRgba(this.activeHex);
    this.hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);

    this.root = document.createElement('aside');
    this.root.className = 'right-dock';

    this.buildDOM();
    this.i18n.subscribe(() => this.updateLabels());
    this.updateLabels();
    this.renderPickers();
    this.renderRecentSwatches();
    this.renderPaletteSwatches();
  }

  private buildDOM(): void {
    // 1. Header + Active Color Swatch + Hex Input
    this.titleEl = document.createElement('h2');
    this.titleEl.className = 'dock-section-title';

    const activeRow = document.createElement('div');
    activeRow.className = 'active-color-row';

    this.previewSwatch = document.createElement('div');
    this.previewSwatch.className = 'active-color-swatch';
    this.previewSwatch.style.backgroundColor = this.activeHex;

    this.hexInput = document.createElement('input');
    this.hexInput.type = 'text';
    this.hexInput.className = 'hex-input';
    this.hexInput.maxLength = 7;
    this.hexInput.value = this.activeHex;
    this.hexInput.spellcheck = false;
    this.hexInput.addEventListener('change', () => {
      const norm = normalizeHex(this.hexInput.value);
      if (norm) {
        this.setColor(norm, true);
      } else {
        this.hexInput.value = this.activeHex;
      }
    });

    activeRow.append(this.previewSwatch, this.hexInput);

    // 2. HSV Color Picker (2D Saturation/Value Square + 1D Hue Bar)
    const hsvCard = document.createElement('div');
    hsvCard.className = 'hsv-picker-card';

    this.svCanvas = document.createElement('canvas');
    this.svCanvas.width = 216;
    this.svCanvas.height = 128;
    this.svCanvas.className = 'hsv-sv-canvas';
    this.svCtx = this.svCanvas.getContext('2d')!;

    this.hueCanvas = document.createElement('canvas');
    this.hueCanvas.width = 216;
    this.hueCanvas.height = 22;
    this.hueCanvas.className = 'hsv-hue-canvas';
    this.hueCtx = this.hueCanvas.getContext('2d')!;

    this.bindHsvDrag();
    hsvCard.append(this.svCanvas, this.hueCanvas);

    // 3. 12 Recent Colors
    const recentSection = document.createElement('div');
    recentSection.className = 'color-subcard';
    this.recentTitleEl = document.createElement('h3');
    this.recentTitleEl.className = 'panel-heading';
    this.recentGrid = document.createElement('div');
    this.recentGrid.className = 'swatch-grid recent-grid';
    recentSection.append(this.recentTitleEl, this.recentGrid);

    // 4. Kid-Friendly Curated Palettes
    const paletteSection = document.createElement('div');
    paletteSection.className = 'color-subcard palettes-card';
    this.palettesTitleEl = document.createElement('h3');
    this.palettesTitleEl.className = 'panel-heading';

    this.categoryTabsWrap = document.createElement('div');
    this.categoryTabsWrap.className = 'palette-tabs';

    this.paletteGrid = document.createElement('div');
    this.paletteGrid.className = 'swatch-grid curated-grid';

    paletteSection.append(
      this.palettesTitleEl,
      this.categoryTabsWrap,
      this.paletteGrid
    );

    this.root.append(
      this.titleEl,
      activeRow,
      hsvCard,
      recentSection,
      paletteSection
    );
  }

  private bindHsvDrag(): void {
    let draggingSV = false;
    let draggingHue = false;

    const updateFromSV = (e: PointerEvent) => {
      const rect = this.svCanvas.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
      this.hsv.s = s;
      this.hsv.v = v;
      const rgb = hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
      this.applyHexInternal(rgbToHex(rgb.r, rgb.g, rgb.b), true);
    };

    const updateFromHue = (e: PointerEvent) => {
      const rect = this.hueCanvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.hsv.h = ratio * 359.9;
      const rgb = hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
      this.applyHexInternal(rgbToHex(rgb.r, rgb.g, rgb.b), true);
    };

    this.svCanvas.addEventListener('pointerdown', (e) => {
      draggingSV = true;
      try {
        this.svCanvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      updateFromSV(e);
    });
    this.svCanvas.addEventListener('pointermove', (e) => {
      if (draggingSV) updateFromSV(e);
    });
    const stopSV = () => {
      draggingSV = false;
    };
    this.svCanvas.addEventListener('pointerup', stopSV);
    this.svCanvas.addEventListener('pointercancel', stopSV);

    this.hueCanvas.addEventListener('pointerdown', (e) => {
      draggingHue = true;
      try {
        this.hueCanvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      updateFromHue(e);
    });
    this.hueCanvas.addEventListener('pointermove', (e) => {
      if (draggingHue) updateFromHue(e);
    });
    const stopHue = () => {
      draggingHue = false;
    };
    this.hueCanvas.addEventListener('pointerup', stopHue);
    this.hueCanvas.addEventListener('pointercancel', stopHue);
  }

  private applyHexInternal(hex: string, emit: boolean): void {
    this.activeHex = hex;
    this.previewSwatch.style.backgroundColor = hex;
    this.hexInput.value = hex;
    this.renderPickers();
    this.highlightSelectedSwatches();
    if (emit) {
      this.onColorChange(hex);
    }
  }

  public setColor(hex: string, emit = false): void {
    const norm = normalizeHex(hex);
    if (!norm) return;
    const rgba = hexToRgba(norm);
    this.hsv = rgbToHsv(rgba.r, rgba.g, rgba.b);
    this.applyHexInternal(norm, emit);
  }

  public recordRecentColor(hex: string): void {
    const norm = normalizeHex(hex);
    if (!norm) return;
    this.recentColors = [
      norm,
      ...this.recentColors.filter((c) => c !== norm),
    ].slice(0, 12);
    this.renderRecentSwatches();
  }

  private renderPickers(): void {
    // 1. SV Square
    const w = this.svCanvas.width;
    const h = this.svCanvas.height;
    const pure = hsvToRgb(this.hsv.h, 1, 1);

    this.svCtx.clearRect(0, 0, w, h);
    this.svCtx.fillStyle = rgbToHex(pure.r, pure.g, pure.b);
    this.svCtx.fillRect(0, 0, w, h);

    const whiteGrad = this.svCtx.createLinearGradient(0, 0, w, 0);
    whiteGrad.addColorStop(0, 'rgba(255,255,255,1)');
    whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
    this.svCtx.fillStyle = whiteGrad;
    this.svCtx.fillRect(0, 0, w, h);

    const blackGrad = this.svCtx.createLinearGradient(0, 0, 0, h);
    blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
    blackGrad.addColorStop(1, 'rgba(0,0,0,1)');
    this.svCtx.fillStyle = blackGrad;
    this.svCtx.fillRect(0, 0, w, h);

    // Crosshair thumb
    const cx = this.hsv.s * w;
    const cy = (1 - this.hsv.v) * h;
    this.svCtx.beginPath();
    this.svCtx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    this.svCtx.lineWidth = 2.5;
    this.svCtx.strokeStyle = '#0F121C';
    this.svCtx.stroke();
    this.svCtx.beginPath();
    this.svCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    this.svCtx.lineWidth = 2;
    this.svCtx.strokeStyle = '#FFFFFF';
    this.svCtx.stroke();

    // 2. Hue Rainbow Bar
    const hw = this.hueCanvas.width;
    const hh = this.hueCanvas.height;
    const hueGrad = this.hueCtx.createLinearGradient(0, 0, hw, 0);
    hueGrad.addColorStop(0, '#FF0000');
    hueGrad.addColorStop(1 / 6, '#FFFF00');
    hueGrad.addColorStop(2 / 6, '#00FF00');
    hueGrad.addColorStop(3 / 6, '#00FFFF');
    hueGrad.addColorStop(4 / 6, '#0000FF');
    hueGrad.addColorStop(5 / 6, '#FF00FF');
    hueGrad.addColorStop(1, '#FF0000');
    this.hueCtx.fillStyle = hueGrad;
    this.hueCtx.fillRect(0, 0, hw, hh);

    const hx = (this.hsv.h / 360) * hw;
    this.hueCtx.fillStyle = '#0F121C';
    this.hueCtx.fillRect(hx - 4, 0, 8, hh);
    this.hueCtx.fillStyle = '#FFFFFF';
    this.hueCtx.fillRect(hx - 2, 2, 4, hh - 4);
  }

  private renderRecentSwatches(): void {
    this.recentGrid.innerHTML = '';
    for (const hex of this.recentColors) {
      this.recentGrid.appendChild(this.createSwatchBtn(hex));
    }
    this.highlightSelectedSwatches();
  }

  private renderCategoryTabs(): void {
    const t = this.i18n.t;
    this.categoryTabsWrap.innerHTML = '';
    for (const cat of KID_PALETTES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-tab-btn';
      btn.classList.toggle('active', cat.id === this.activeCategory);
      btn.textContent = t.palettes[cat.id];
      btn.addEventListener('click', () => {
        this.activeCategory = cat.id;
        this.renderCategoryTabs();
        this.renderPaletteSwatches();
      });
      this.categoryTabsWrap.appendChild(btn);
    }
  }

  private renderPaletteSwatches(): void {
    this.paletteGrid.innerHTML = '';
    const cat = KID_PALETTES.find((p) => p.id === this.activeCategory) ?? KID_PALETTES[0];
    for (const hex of cat.colors) {
      this.paletteGrid.appendChild(this.createSwatchBtn(hex));
    }
    this.highlightSelectedSwatches();
  }

  private createSwatchBtn(hex: string): HTMLButtonElement {
    const norm = normalizeHex(hex) ?? '#FFFFFF';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch-btn';
    btn.style.backgroundColor = norm;
    btn.dataset.hex = norm;
    btn.title = norm;
    btn.addEventListener('click', () => {
      this.setColor(norm, true);
    });
    return btn;
  }

  private highlightSelectedSwatches(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.color-swatch-btn').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.hex === this.activeHex);
    });
  }

  private updateLabels(): void {
    const t = this.i18n.t;
    this.titleEl.textContent = t.colorSectionTitle;
    this.hexInput.title = t.hexInputTooltip;
    this.recentTitleEl.textContent = t.recentColorsTitle;
    this.palettesTitleEl.textContent = t.palettesTitle;
    this.renderCategoryTabs();
  }
}
