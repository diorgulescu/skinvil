// SPDX-License-Identifier: GPL-3.0-only
import type {
  McpackSkinPayload,
  WardrobeBackendClient,
  WardrobeEntry,
} from '../core/wardrobeClient';
import type { I18nStore } from '../i18n/translations';
import { ICONS } from './icons';

export interface WardrobeModalCallbacks {
  onLoadEntryIntoEditor: (entry: WardrobeEntry) => Promise<void>;
  onSaveCurrentToWardrobe: (forceNew: boolean) => Promise<WardrobeEntry | null>;
  onImportFilesIntoWardrobe: () => Promise<void>;
  getCurrentEditorPayload: () => Promise<McpackSkinPayload>;
  getActiveWardrobeId: () => string | null;
  onEntriesChanged: (count: number, selectedCount: number) => void;
  onToast: (msg: string) => void;
}

export class WardrobeModal {
  public readonly root: HTMLElement;
  private readonly client: WardrobeBackendClient;
  private readonly i18n: I18nStore;
  private readonly cb: WardrobeModalCallbacks;

  private entries: WardrobeEntry[] = [];
  private selectedIds: Set<string> = new Set();
  private renamingId: string | null = null;
  private packNameCustom = '';

  private modalTitleEl!: HTMLElement;
  private modalSubEl!: HTMLElement;
  private closeBtn!: HTMLButtonElement;

  private saveCurrentBtn!: HTMLButtonElement;
  private saveAsNewBtn!: HTMLButtonElement;
  private importIntoBtn!: HTMLButtonElement;
  private selectAllBtn!: HTMLButtonElement;
  private clearSelBtn!: HTMLButtonElement;

  private cardsGrid!: HTMLElement;

  private trayTitleEl!: HTMLElement;
  private trayCountEl!: HTMLElement;
  private trayThumbsRow!: HTMLElement;
  private packNameLabelEl!: HTMLElement;
  private packNameInput!: HTMLInputElement;
  private forgeBtn!: HTMLButtonElement;
  private forgeBtnLabel!: HTMLElement;
  private exportPngsBtn!: HTMLButtonElement;
  private exportPngsLabel!: HTMLElement;

  constructor(
    client: WardrobeBackendClient,
    i18n: I18nStore,
    callbacks: WardrobeModalCallbacks
  ) {
    this.client = client;
    this.i18n = i18n;
    this.cb = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'wardrobe-backdrop hidden';
    this.buildDOM();

    this.i18n.subscribe(() => {
      this.updateStaticLabels();
      this.renderCards();
      this.renderTray();
    });
    this.updateStaticLabels();
  }

  private buildDOM(): void {
    const dialog = document.createElement('div');
    dialog.className = 'wardrobe-dialog';
    dialog.addEventListener('click', (e) => e.stopPropagation());

    this.root.addEventListener('click', () => this.close());

    // Header
    const header = document.createElement('div');
    header.className = 'wardrobe-header';

    const titleWrap = document.createElement('div');
    this.modalTitleEl = document.createElement('h2');
    this.modalTitleEl.className = 'wardrobe-title';
    this.modalSubEl = document.createElement('p');
    this.modalSubEl.className = 'wardrobe-subtitle';
    titleWrap.append(this.modalTitleEl, this.modalSubEl);

    this.closeBtn = document.createElement('button');
    this.closeBtn.type = 'button';
    this.closeBtn.className = 'block-btn';
    this.closeBtn.addEventListener('click', () => this.close());

    header.append(titleWrap, this.closeBtn);

    // Top Action Bar
    const actionBar = document.createElement('div');
    actionBar.className = 'wardrobe-action-bar';

    const leftActions = document.createElement('div');
    leftActions.className = 'wardrobe-actions-group';

    this.saveCurrentBtn = document.createElement('button');
    this.saveCurrentBtn.type = 'button';
    this.saveCurrentBtn.className = 'block-btn accent-cyan-btn';
    this.saveCurrentBtn.addEventListener('click', async () => {
      const saved = await this.cb.onSaveCurrentToWardrobe(false);
      if (saved) {
        this.selectedIds.add(saved.id);
        await this.reloadEntries();
      }
    });

    this.saveAsNewBtn = document.createElement('button');
    this.saveAsNewBtn.type = 'button';
    this.saveAsNewBtn.className = 'block-btn';
    this.saveAsNewBtn.addEventListener('click', async () => {
      const saved = await this.cb.onSaveCurrentToWardrobe(true);
      if (saved) {
        this.selectedIds.add(saved.id);
        await this.reloadEntries();
      }
    });

    this.importIntoBtn = document.createElement('button');
    this.importIntoBtn.type = 'button';
    this.importIntoBtn.className = 'block-btn';
    this.importIntoBtn.addEventListener('click', async () => {
      await this.cb.onImportFilesIntoWardrobe();
      await this.reloadEntries();
    });

    leftActions.append(this.saveCurrentBtn, this.saveAsNewBtn, this.importIntoBtn);

    const rightActions = document.createElement('div');
    rightActions.className = 'wardrobe-actions-group';

    this.selectAllBtn = document.createElement('button');
    this.selectAllBtn.type = 'button';
    this.selectAllBtn.className = 'chip-toggle';
    this.selectAllBtn.addEventListener('click', () => {
      for (const e of this.entries) this.selectedIds.add(e.id);
      this.renderCards();
      this.renderTray();
      this.emitCounts();
    });

    this.clearSelBtn = document.createElement('button');
    this.clearSelBtn.type = 'button';
    this.clearSelBtn.className = 'chip-toggle';
    this.clearSelBtn.addEventListener('click', () => {
      this.selectedIds.clear();
      this.renderCards();
      this.renderTray();
      this.emitCounts();
    });

    rightActions.append(this.selectAllBtn, this.clearSelBtn);
    actionBar.append(leftActions, rightActions);

    // Cards Grid
    this.cardsGrid = document.createElement('div');
    this.cardsGrid.className = 'wardrobe-grid';

    // Bottom Forge .mcpack Tray
    const tray = document.createElement('div');
    tray.className = 'forge-tray';

    const trayTop = document.createElement('div');
    trayTop.className = 'forge-tray-top';

    const trayInfo = document.createElement('div');
    this.trayTitleEl = document.createElement('h3');
    this.trayTitleEl.className = 'forge-tray-title';
    this.trayCountEl = document.createElement('span');
    this.trayCountEl.className = 'forge-tray-count';
    trayInfo.append(this.trayTitleEl, this.trayCountEl);

    this.trayThumbsRow = document.createElement('div');
    this.trayThumbsRow.className = 'forge-tray-thumbs';

    trayTop.append(trayInfo, this.trayThumbsRow);

    const trayControls = document.createElement('div');
    trayControls.className = 'forge-tray-controls';

    const packField = document.createElement('label');
    packField.className = 'pack-name-field';
    this.packNameLabelEl = document.createElement('span');
    this.packNameInput = document.createElement('input');
    this.packNameInput.type = 'text';
    this.packNameInput.className = 'pack-name-input';
    this.packNameInput.maxLength = 48;
    this.packNameInput.addEventListener('input', () => {
      this.packNameCustom = this.packNameInput.value;
    });
    packField.append(this.packNameLabelEl, this.packNameInput);

    const exportBtns = document.createElement('div');
    exportBtns.className = 'forge-export-btns';

    this.exportPngsBtn = document.createElement('button');
    this.exportPngsBtn.type = 'button';
    this.exportPngsBtn.className = 'block-btn accent-emerald';
    const pngIcon = document.createElement('span');
    pngIcon.className = 'btn-icon';
    pngIcon.innerHTML = ICONS.download;
    this.exportPngsLabel = document.createElement('span');
    this.exportPngsBtn.append(pngIcon, this.exportPngsLabel);
    this.exportPngsBtn.addEventListener('click', () => this.handleExportPngs());

    this.forgeBtn = document.createElement('button');
    this.forgeBtn.type = 'button';
    this.forgeBtn.className = 'block-btn accent-gold-forge';
    const anvilIcon = document.createElement('span');
    anvilIcon.className = 'btn-icon';
    anvilIcon.innerHTML = ICONS.anvilForge;
    this.forgeBtnLabel = document.createElement('span');
    this.forgeBtn.append(anvilIcon, this.forgeBtnLabel);
    this.forgeBtn.addEventListener('click', () => this.handleForgeMcpack());

    exportBtns.append(this.exportPngsBtn, this.forgeBtn);
    trayControls.append(packField, exportBtns);
    tray.append(trayTop, trayControls);

    dialog.append(header, actionBar, this.cardsGrid, tray);
    this.root.appendChild(dialog);
  }

  public async open(): Promise<void> {
    this.root.classList.remove('hidden');
    await this.reloadEntries();
  }

  public close(): void {
    this.renamingId = null;
    this.root.classList.add('hidden');
  }

  public get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  public addSelectedId(id: string): void {
    this.selectedIds.add(id);
    this.emitCounts();
  }

  public async reloadEntries(): Promise<void> {
    this.entries = await this.client.listWardrobe();
    const validIds = new Set(this.entries.map((e) => e.id));
    for (const id of [...this.selectedIds]) {
      if (!validIds.has(id)) {
        this.selectedIds.delete(id);
      }
    }
    this.renderCards();
    this.renderTray();
    this.emitCounts();
  }

  private emitCounts(): void {
    this.cb.onEntriesChanged(this.entries.length, this.selectedIds.size);
  }

  private updateStaticLabels(): void {
    const t = this.i18n.t;
    this.modalTitleEl.textContent = t.wardrobeTitle;
    this.modalSubEl.textContent = t.wardrobeSubtitle;
    this.closeBtn.textContent = t.closeBtn;

    this.saveCurrentBtn.innerHTML = `<span class="btn-icon">${ICONS.saveFloppy}</span><span>${t.wardrobeSaveCurrentBtn}</span>`;
    this.saveAsNewBtn.textContent = t.wardrobeSaveAsNewBtn;
    this.importIntoBtn.innerHTML = `<span class="btn-icon">${ICONS.upload}</span><span>${t.wardrobeImportIntoBtn}</span>`;
    this.selectAllBtn.textContent = t.wardrobeSelectAllBtn;
    this.clearSelBtn.textContent = t.wardrobeClearSelectionBtn;

    this.trayTitleEl.textContent = t.trayTitle;
    this.packNameLabelEl.textContent = t.trayPackNameLabel;
    if (!this.packNameCustom) {
      this.packNameInput.value = t.trayPackNameDefault;
    }
    this.forgeBtnLabel.textContent = t.forgeMcpackBtn;
    this.forgeBtn.title = t.forgeMcpackTooltip;
    this.exportPngsLabel.textContent = t.exportJavaPngsBtn;
    this.exportPngsBtn.title = t.exportJavaPngsTooltip;
  }

  private renderCards(): void {
    const t = this.i18n.t;
    this.cardsGrid.innerHTML = '';

    this.saveAsNewBtn.classList.toggle('hidden', !this.cb.getActiveWardrobeId());

    if (this.entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'wardrobe-empty';
      empty.textContent = t.wardrobeEmptyState;
      this.cardsGrid.appendChild(empty);
      return;
    }

    const activeEditorId = this.cb.getActiveWardrobeId();

    for (const entry of this.entries) {
      const isSelected = this.selectedIds.has(entry.id);
      const isEditingNow = entry.id === activeEditorId;

      const card = document.createElement('div');
      card.className = 'wardrobe-card';
      card.classList.toggle('checked', isSelected);
      card.classList.toggle('active-editor-skin', isEditingNow);

      // Top bar: Checkbox + Geometry / HD Badges
      const cardTop = document.createElement('div');
      cardTop.className = 'wcard-top';

      const checkBtn = document.createElement('button');
      checkBtn.type = 'button';
      checkBtn.className = 'wcard-checkbox';
      checkBtn.classList.toggle('is-checked', isSelected);
      checkBtn.title = t.cardCheckTooltip;
      checkBtn.textContent = isSelected ? '✓' : '';
      checkBtn.addEventListener('click', () => {
        if (this.selectedIds.has(entry.id)) {
          this.selectedIds.delete(entry.id);
        } else {
          this.selectedIds.add(entry.id);
        }
        this.renderCards();
        this.renderTray();
        this.emitCounts();
      });

      const badgesWrap = document.createElement('div');
      badgesWrap.className = 'wcard-badges';

      if (entry.width === 128) {
        const hdBadge = document.createElement('span');
        hdBadge.className = 'wcard-hd-badge';
        hdBadge.textContent = '128 HD';
        badgesWrap.appendChild(hdBadge);
      }

      const geomBadgeBtn = document.createElement('button');
      geomBadgeBtn.type = 'button';
      geomBadgeBtn.className = `wcard-geom-btn geom-${entry.geometry}`;
      geomBadgeBtn.title = t.cardGeomToggleTooltip;
      geomBadgeBtn.textContent =
        entry.geometry === 'slim' ? 'Alex 3px' : 'Steve 4px';
      geomBadgeBtn.addEventListener('click', async () => {
        const nextGeom = entry.geometry === 'slim' ? 'classic' : 'slim';
        await this.client.updateWardrobeEntry(entry.id, entry.name, nextGeom);
        await this.reloadEntries();
      });
      badgesWrap.appendChild(geomBadgeBtn);

      cardTop.append(checkBtn, badgesWrap);

      // Crisp 2D Front Body + Face Preview
      const previewWrap = document.createElement('div');
      previewWrap.className = 'wcard-preview-wrap';
      const previewImg = document.createElement('img');
      previewImg.className = 'wcard-preview-img';
      previewImg.src = entry.previewDataUrl;
      previewImg.alt = entry.name;
      previewWrap.appendChild(previewImg);
      previewWrap.addEventListener('click', () => {
        if (this.selectedIds.has(entry.id)) {
          this.selectedIds.delete(entry.id);
        } else {
          this.selectedIds.add(entry.id);
        }
        this.renderCards();
        this.renderTray();
        this.emitCounts();
      });

      // Name or Inline Rename Input
      const nameRow = document.createElement('div');
      nameRow.className = 'wcard-name-row';

      if (this.renamingId === entry.id) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'wcard-rename-input';
        input.value = entry.name;
        input.maxLength = 50;

        let committed = false;
        const commit = async () => {
          if (committed) return;
          committed = true;
          const nextName = input.value.trim() || entry.name;
          this.renamingId = null;
          await this.client.updateWardrobeEntry(entry.id, nextName);
          await this.reloadEntries();
        };

        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            void commit();
          } else if (ev.key === 'Escape') {
            committed = true;
            this.renamingId = null;
            this.renderCards();
          }
        });
        input.addEventListener('blur', () => void commit());
        nameRow.appendChild(input);
        requestAnimationFrame(() => {
          input.focus();
          input.select();
        });
      } else {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'wcard-name';
        nameSpan.textContent = entry.name;
        nameSpan.title = entry.name;
        nameSpan.addEventListener('dblclick', () => {
          this.renamingId = entry.id;
          this.renderCards();
        });
        nameRow.appendChild(nameSpan);
      }

      // Card Action Buttons: Edit, Duplicate, Rename, Delete
      const actionsRow = document.createElement('div');
      actionsRow.className = 'wcard-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'wcard-edit-btn';
      editBtn.textContent = t.cardEditBtn;
      editBtn.title = t.cardEditTooltip;
      editBtn.addEventListener('click', async () => {
        await this.cb.onLoadEntryIntoEditor(entry);
        this.close();
      });

      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'wcard-icon-btn';
      dupBtn.innerHTML = ICONS.duplicate;
      dupBtn.title = t.cardDuplicateTooltip;
      dupBtn.addEventListener('click', async () => {
        const copy = await this.client.duplicateWardrobeEntry(entry.id);
        this.selectedIds.add(copy.id);
        await this.reloadEntries();
      });

      const renBtn = document.createElement('button');
      renBtn.type = 'button';
      renBtn.className = 'wcard-icon-btn';
      renBtn.innerHTML = ICONS.rename;
      renBtn.title = t.cardRenameTooltip;
      renBtn.addEventListener('click', () => {
        this.renamingId = entry.id;
        this.renderCards();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'wcard-icon-btn danger';
      delBtn.innerHTML = ICONS.trash;
      delBtn.title = t.cardDeleteTooltip;
      delBtn.addEventListener('click', async () => {
        this.selectedIds.delete(entry.id);
        await this.client.deleteWardrobeEntry(entry.id);
        await this.reloadEntries();
      });

      actionsRow.append(editBtn, dupBtn, renBtn, delBtn);
      card.append(cardTop, previewWrap, nameRow, actionsRow);
      this.cardsGrid.appendChild(card);
    }
  }

  private renderTray(): void {
    const t = this.i18n.t;
    const selectedEntries = this.entries.filter((e) => this.selectedIds.has(e.id));

    this.trayThumbsRow.innerHTML = '';
    if (selectedEntries.length === 0) {
      this.trayCountEl.textContent = t.trayUsingCurrentHint;
    } else {
      this.trayCountEl.textContent = t.traySelectedCount(selectedEntries.length);
      for (const item of selectedEntries) {
        const img = document.createElement('img');
        img.className = 'tray-mini-thumb';
        img.src = item.previewDataUrl;
        img.title = item.name;
        this.trayThumbsRow.appendChild(img);
      }
    }
  }

  private async collectExportPayloads(): Promise<McpackSkinPayload[]> {
    const selectedEntries = this.entries.filter((e) => this.selectedIds.has(e.id));
    if (selectedEntries.length > 0) {
      return selectedEntries.map((e) => ({
        name: e.name,
        geometry: e.geometry,
        wardrobeId: e.id,
        pngBase64: e.skinDataUrl,
      }));
    }
    return [await this.cb.getCurrentEditorPayload()];
  }

  public async handleForgeMcpack(): Promise<void> {
    const t = this.i18n.t;
    try {
      const payloads = await this.collectExportPayloads();
      const packName = this.packNameInput.value.trim() || t.trayPackNameDefault;
      const savedPath = await this.client.forgeMcpackWithDialog(packName, payloads);
      if (savedPath) {
        this.cb.onToast(`${t.forgedSuccessToast} ${savedPath}`);
      }
    } catch (err) {
      this.cb.onToast(String(err));
    }
  }

  private async handleExportPngs(): Promise<void> {
    const t = this.i18n.t;
    try {
      const payloads = await this.collectExportPayloads();
      const written = await this.client.exportStandalonePngsWithDialog(payloads);
      if (written && written.length > 0) {
        this.cb.onToast(t.exportedPngsToast(written.length));
      }
    } catch (err) {
      this.cb.onToast(String(err));
    }
  }
}
