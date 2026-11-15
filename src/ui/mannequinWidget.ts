// SPDX-License-Identifier: GPL-3.0-only
import {
  BASE_PART_IDS,
  OUTER_PART_IDS,
  type LayerKind,
  type ModelType,
  type PartId,
} from '../core/uvMap';
import type { I18nStore } from '../i18n/translations';

export class MannequinWidget {
  public readonly root: HTMLElement;
  private readonly i18n: I18nStore;
  private readonly getPartVisible: (partId: PartId) => boolean;
  private readonly onTogglePart: (partId: PartId, nextVisible: boolean) => void;
  private readonly onToggleLayer: (layer: LayerKind, nextVisible: boolean) => void;

  private titleEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private baseTitleEl!: HTMLElement;
  private outerTitleEl!: HTMLElement;
  private allBaseBtn!: HTMLButtonElement;
  private allOuterBtn!: HTMLButtonElement;
  private partButtons: Partial<Record<PartId, HTMLButtonElement>> = {};

  constructor(
    i18n: I18nStore,
    getPartVisible: (partId: PartId) => boolean,
    onTogglePart: (partId: PartId, nextVisible: boolean) => void,
    onToggleLayer: (layer: LayerKind, nextVisible: boolean) => void
  ) {
    this.i18n = i18n;
    this.getPartVisible = getPartVisible;
    this.onTogglePart = onTogglePart;
    this.onToggleLayer = onToggleLayer;

    this.root = document.createElement('section');
    this.root.className = 'mannequin-card';

    this.titleEl = document.createElement('h3');
    this.titleEl.className = 'panel-heading';

    this.hintEl = document.createElement('p');
    this.hintEl.className = 'mannequin-hint';

    const figuresRow = document.createElement('div');
    figuresRow.className = 'mannequin-row';

    // Base Body Column
    const baseCol = this.buildFigureColumn('base', [
      { id: 'head', cls: 'mp-head' },
      { id: 'rightArm', cls: 'mp-rarm' },
      { id: 'torso', cls: 'mp-torso' },
      { id: 'leftArm', cls: 'mp-larm' },
      { id: 'rightLeg', cls: 'mp-rleg' },
      { id: 'leftLeg', cls: 'mp-lleg' },
    ]);

    // Outer Armor Column
    const outerCol = this.buildFigureColumn('outer', [
      { id: 'hat', cls: 'mp-head' },
      { id: 'rightSleeve', cls: 'mp-rarm' },
      { id: 'jacket', cls: 'mp-torso' },
      { id: 'leftSleeve', cls: 'mp-larm' },
      { id: 'rightPants', cls: 'mp-rleg' },
      { id: 'leftPants', cls: 'mp-lleg' },
    ]);

    figuresRow.append(baseCol, outerCol);
    this.root.append(this.titleEl, this.hintEl, figuresRow);

    this.i18n.subscribe(() => this.refresh());
    this.refresh();
  }

  private buildFigureColumn(
    layer: LayerKind,
    parts: Array<{ id: PartId; cls: string }>
  ): HTMLElement {
    const col = document.createElement('div');
    col.className = `mannequin-col mannequin-col-${layer}`;

    const colHeader = document.createElement('div');
    colHeader.className = 'mannequin-col-header';

    const label = document.createElement('span');
    label.className = 'mannequin-col-title';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'mannequin-all-btn';
    allBtn.addEventListener('click', () => {
      const ids = layer === 'base' ? BASE_PART_IDS : OUTER_PART_IDS;
      const allCurrentlyOn = ids.every((id) => this.getPartVisible(id));
      this.onToggleLayer(layer, !allCurrentlyOn);
      this.refresh();
    });

    if (layer === 'base') {
      this.baseTitleEl = label;
      this.allBaseBtn = allBtn;
    } else {
      this.outerTitleEl = label;
      this.allOuterBtn = allBtn;
    }

    colHeader.append(label, allBtn);

    const figure = document.createElement('div');
    figure.className = `mannequin-figure figure-${layer}`;

    for (const p of parts) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mp-part ${p.cls} mp-layer-${layer}`;
      btn.dataset.partId = p.id;
      btn.addEventListener('click', () => {
        const next = !this.getPartVisible(p.id);
        this.onTogglePart(p.id, next);
        this.refresh();
      });
      this.partButtons[p.id] = btn;
      figure.appendChild(btn);
    }

    col.append(colHeader, figure);
    return col;
  }

  public setModelType(model: ModelType): void {
    this.root.classList.toggle('is-slim', model === 'slim');
  }

  public refresh(): void {
    const t = this.i18n.t;
    this.titleEl.textContent = t.mannequinTitle;
    this.hintEl.textContent = t.mannequinHint;
    this.baseTitleEl.textContent = t.baseLayerTitle;
    this.outerTitleEl.textContent = t.outerLayerTitle;

    const allBaseOn = BASE_PART_IDS.every((id) => this.getPartVisible(id));
    this.allBaseBtn.textContent = allBaseOn ? t.allOff : t.allOn;
    this.allBaseBtn.title = t.toggleAllBaseTooltip;

    const allOuterOn = OUTER_PART_IDS.every((id) => this.getPartVisible(id));
    this.allOuterBtn.textContent = allOuterOn ? t.allOff : t.allOn;
    this.allOuterBtn.title = t.toggleAllOuterTooltip;

    (Object.keys(this.partButtons) as PartId[]).forEach((partId) => {
      const btn = this.partButtons[partId]!;
      const vis = this.getPartVisible(partId);
      btn.classList.toggle('is-visible', vis);
      btn.classList.toggle('is-hidden', !vis);
      btn.setAttribute('aria-pressed', String(vis));
      btn.title = `${t.parts[partId]} — ${vis ? 'ON' : 'OFF'}`;
    });
  }
}
