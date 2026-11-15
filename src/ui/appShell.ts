// SPDX-License-Identifier: GPL-3.0-only
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  PaintController,
  type BaseEraserMode,
  type PaintSettings,
  type ToolId,
} from '../core/paintTools';
import { SkinCanvasEngine } from '../core/skinCanvas';
import {
  generateStarterSkin,
  STARTER_TEMPLATES,
  type StarterTemplateId,
} from '../core/starterSkins';
import type { LayerKind, ModelType } from '../core/uvMap';
import {
  isTauriDesktop,
  WardrobeBackendClient,
  type McpackSkinPayload,
  type ProcessedSkinResult,
  type WardrobeEntry,
} from '../core/wardrobeClient';
import { I18nStore } from '../i18n/translations';
import {
  SkinStage3D,
  type HoverInfo,
  type PoseId,
} from '../viewport/skinStage3D';
import { AboutModal } from './aboutModal';
import { ColorWorkshopPanel } from './colorPanel';
import { SyncedEditor2D } from './editor2D';
import { APP_ICON_URL, ICONS } from './icons';
import { MannequinWidget } from './mannequinWidget';
import { WardrobeModal } from './wardrobeModal';

function base64ToUint8Array(b64OrDataUrl: string): Uint8Array {
  const clean = b64OrDataUrl.replace(/^data:image\/png;base64,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

export class SkinvilApp {
  private readonly i18n = new I18nStore();
  private readonly engine = new SkinCanvasEngine();
  private readonly paintController: PaintController;
  private readonly backend = new WardrobeBackendClient();

  private settings: PaintSettings = {
    tool: 'pencil',
    colorHex: '#38BDF8',
    baseSkinHex: '#F3C39C',
    baseEraserMode: 'skin',
    mirrorSymmetry: false,
    autoNoise: false,
    model: 'classic',
    targetLayer: 'base',
  };

  private activeWardrobeId: string | null = null;
  private unmodifiedHdBytes: Uint8Array | null = null;
  private lastUndoSnapshotCount = 0;

  private stage3D!: SkinStage3D;
  private editor2D!: SyncedEditor2D;
  private mannequin!: MannequinWidget;
  private colorPanel!: ColorWorkshopPanel;
  private wardrobeModal!: WardrobeModal;
  private aboutModal!: AboutModal;
  private lastHover: HoverInfo | null = null;

  // UI element references
  private subtitleEl!: HTMLElement;
  private templatesBtn!: HTMLButtonElement;
  private templatesMenu!: HTMLElement;
  private templateItemBtns!: Record<StarterTemplateId, HTMLButtonElement>;

  private importBtn!: HTMLButtonElement;
  private fileInput!: HTMLInputElement;
  private wardrobeFileInput!: HTMLInputElement;

  private skinNameInput!: HTMLInputElement;
  private saveWardrobeBtn!: HTMLButtonElement;
  private openWardrobeBtn!: HTMLButtonElement;
  private wardrobeCountBadge!: HTMLElement;
  private forgeQuickBtn!: HTMLButtonElement;
  private exportBtn!: HTMLButtonElement;

  private undoBtn!: HTMLButtonElement;
  private undoLabelEl!: HTMLElement;
  private undoCountEl!: HTMLElement;
  private redoBtn!: HTMLButtonElement;
  private redoLabelEl!: HTMLElement;

  private classicBtn!: HTMLButtonElement;
  private slimBtn!: HTMLButtonElement;
  private toggle2DBtn!: HTMLButtonElement;
  private toggle2DLabelEl!: HTMLElement;

  private langRoBtn!: HTMLButtonElement;
  private langEnBtn!: HTMLButtonElement;
  private langSwitchWrap!: HTMLElement;
  private aboutLicenseBtn!: HTMLButtonElement;

  private paintLayerTitleEl!: HTMLElement;
  private paintLayerBaseBtn!: HTMLButtonElement;
  private paintLayerBaseLabelEl!: HTMLElement;
  private paintLayerOuterBtn!: HTMLButtonElement;
  private paintLayerOuterLabelEl!: HTMLElement;

  private toolsTitleEl!: HTMLElement;
  private toolBtns!: Record<ToolId, { btn: HTMLButtonElement; label: HTMLElement }>;
  private eraserOptionsRow!: HTMLElement;
  private eraserOptLabel!: HTMLElement;
  private eraserSkinBtn!: HTMLButtonElement;
  private eraserClearBtn!: HTMLButtonElement;
  private eraserSkinSwatchBtn!: HTMLButtonElement;

  private modifiersTitleEl!: HTMLElement;
  private mirrorBtn!: HTMLButtonElement;
  private mirrorLabelEl!: HTMLElement;
  private noiseBtn!: HTMLButtonElement;
  private noiseLabelEl!: HTMLElement;

  private resetViewBtn!: HTMLButtonElement;
  private resetViewLabelEl!: HTMLElement;

  private poseBtns!: Record<PoseId, HTMLButtonElement>;
  private posePlayPauseBtn!: HTMLButtonElement;
  private statusTextEl!: HTMLElement;
  private hintPillEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private dropOverlayEl!: HTMLElement;
  private dropOverlayTitleEl!: HTMLElement;
  private dropOverlaySubEl!: HTMLElement;

  constructor(mountEl: HTMLElement) {
    this.paintController = new PaintController(this.engine);

    const initialSkin = generateStarterSkin('explorer', this.settings.model);
    this.engine.replaceWithImageData(initialSkin, false);
    this.engine.clearHistory();

    this.paintController.onColorPicked = (hex) => {
      this.settings.colorHex = hex;
      this.colorPanel.setColor(hex, false);
      this.colorPanel.recordRecentColor(hex);
      this.setTool('pencil');
    };

    this.paintController.onColorUsed = (hex) => {
      this.colorPanel.recordRecentColor(hex);
    };

    this.buildLayout(mountEl);
    this.bindGlobalShortcuts();
    this.bindDragAndDrop(mountEl);

    this.engine.onChange(() => {
      if (this.engine.undoCount !== this.lastUndoSnapshotCount) {
        // User painted or modified pixels on 64x64 grid -> switch from raw HD passthrough to edited canvas
        this.unmodifiedHdBytes = null;
        this.lastUndoSnapshotCount = this.engine.undoCount;
      }
      this.syncHistoryButtons();
    });

    this.i18n.subscribe(() => this.refreshAllLabels());

    this.skinNameInput.value = this.i18n.t.templates.explorer;
    this.refreshAllLabels();
    this.syncToolButtons();
    this.syncHistoryButtons();

    void this.wardrobeModal.reloadEntries();
  }

  private buildLayout(mountEl: HTMLElement): void {
    mountEl.innerHTML = '';
    const shell = document.createElement('div');
    shell.className = 'skinvil-shell';

    // ================= 2-ROW ERGONOMIC HEADER =================
    const header = document.createElement('header');
    header.className = 'top-header';

    // --- ROW 1: Brand Identity + Active Character Name/Save + Wardrobe/Export + RO/EN ---
    const topBarPrimary = document.createElement('div');
    topBarPrimary.className = 'top-bar-row top-bar-primary';

    const primaryLeft = document.createElement('div');
    primaryLeft.className = 'header-cluster';

    const brand = document.createElement('div');
    brand.className = 'brand-lockup';
    const logoBox = document.createElement('div');
    logoBox.className = 'brand-logo-box';
    logoBox.innerHTML = ICONS.appLogo;

    const brandText = document.createElement('div');
    brandText.className = 'brand-text';
    const title = document.createElement('h1');
    title.className = 'brand-title';
    title.textContent = 'SKINVIL';
    this.subtitleEl = document.createElement('span');
    this.subtitleEl.className = 'brand-subtitle';
    brandText.append(title, this.subtitleEl);
    brand.append(logoBox, brandText);

    const makeDivider = () => {
      const d = document.createElement('span');
      d.className = 'header-divider';
      d.setAttribute('aria-hidden', 'true');
      return d;
    };

    this.skinNameInput = document.createElement('input');
    this.skinNameInput.type = 'text';
    this.skinNameInput.className = 'header-skin-name-input';
    this.skinNameInput.maxLength = 42;

    this.saveWardrobeBtn = document.createElement('button');
    this.saveWardrobeBtn.type = 'button';
    this.saveWardrobeBtn.className = 'block-btn header-btn accent-cyan-btn';
    this.saveWardrobeBtn.innerHTML = `<span class="btn-icon">${ICONS.saveFloppy}</span><span data-role="save-label"></span>`;
    this.saveWardrobeBtn.addEventListener('click', () => {
      void this.saveCurrentSkinToWardrobe(false);
    });

    primaryLeft.append(brand, makeDivider(), this.skinNameInput, this.saveWardrobeBtn);

    const primaryRight = document.createElement('div');
    primaryRight.className = 'header-cluster';

    this.openWardrobeBtn = document.createElement('button');
    this.openWardrobeBtn.type = 'button';
    this.openWardrobeBtn.className = 'block-btn header-btn';
    const wIcon = document.createElement('span');
    wIcon.className = 'btn-icon';
    wIcon.innerHTML = ICONS.wardrobe;
    const wLabel = document.createElement('span');
    wLabel.dataset.role = 'wardrobe-label';
    this.wardrobeCountBadge = document.createElement('span');
    this.wardrobeCountBadge.className = 'step-badge';
    this.openWardrobeBtn.append(wIcon, wLabel, this.wardrobeCountBadge);
    this.openWardrobeBtn.addEventListener('click', () => {
      void this.wardrobeModal.open();
    });

    this.forgeQuickBtn = document.createElement('button');
    this.forgeQuickBtn.type = 'button';
    this.forgeQuickBtn.className = 'block-btn header-btn accent-gold-forge';
    this.forgeQuickBtn.innerHTML = `<span class="btn-icon">${ICONS.anvilForge}</span><span data-role="forge-label"></span>`;
    this.forgeQuickBtn.addEventListener('click', () => {
      void this.wardrobeModal.open();
    });

    this.exportBtn = document.createElement('button');
    this.exportBtn.type = 'button';
    this.exportBtn.className = 'block-btn header-btn accent-emerald';
    this.exportBtn.innerHTML = `<span class="btn-icon">${ICONS.download}</span><span data-role="export-label"></span>`;
    this.exportBtn.addEventListener('click', () => void this.handleQuickExportPng());

    this.langSwitchWrap = document.createElement('div');
    this.langSwitchWrap.className = 'segmented-pill lang-pill';

    this.langRoBtn = document.createElement('button');
    this.langRoBtn.type = 'button';
    this.langRoBtn.className = 'seg-btn lang-btn active';
    this.langRoBtn.innerHTML = `<span class="flag-ro" aria-hidden="true"></span><span>RO</span>`;
    this.langRoBtn.addEventListener('click', () => this.i18n.setLocale('ro'));

    this.langEnBtn = document.createElement('button');
    this.langEnBtn.type = 'button';
    this.langEnBtn.className = 'seg-btn lang-btn';
    this.langEnBtn.innerHTML = `<span class="flag-en" aria-hidden="true"></span><span>EN</span>`;
    this.langEnBtn.addEventListener('click', () => this.i18n.setLocale('en'));

    this.langSwitchWrap.append(this.langRoBtn, this.langEnBtn);

    this.aboutLicenseBtn = document.createElement('button');
    this.aboutLicenseBtn.type = 'button';
    this.aboutLicenseBtn.className = 'block-btn header-btn license-badge-btn';
    this.aboutLicenseBtn.addEventListener('click', () => {
      this.aboutModal.open();
    });

    primaryRight.append(
      this.openWardrobeBtn,
      this.forgeQuickBtn,
      this.exportBtn,
      makeDivider(),
      this.langSwitchWrap,
      this.aboutLicenseBtn
    );
    topBarPrimary.append(primaryLeft, primaryRight);

    // --- ROW 2: Editor Ribbon (Templates + Import PNG + Undo/Redo | Steve/Alex + 2D Grid) ---
    const topBarRibbon = document.createElement('div');
    topBarRibbon.className = 'top-bar-row top-bar-ribbon';

    const ribbonLeft = document.createElement('div');
    ribbonLeft.className = 'header-cluster';

    const templateDropdown = document.createElement('div');
    templateDropdown.className = 'dropdown-wrap';
    this.templatesBtn = document.createElement('button');
    this.templatesBtn.type = 'button';
    this.templatesBtn.className = 'block-btn header-btn';
    this.templatesBtn.innerHTML = `<span class="btn-icon">${ICONS.templates}</span><span data-role="tpl-label"></span>`;

    this.templatesMenu = document.createElement('div');
    this.templatesMenu.className = 'dropdown-menu hidden';

    this.templateItemBtns = {} as Record<StarterTemplateId, HTMLButtonElement>;
    for (const meta of STARTER_TEMPLATES) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.addEventListener('click', () => {
        this.templatesMenu.classList.add('hidden');
        this.applyStarterTemplate(meta.id, meta.defaultModel);
      });
      this.templateItemBtns[meta.id] = item;
      this.templatesMenu.appendChild(item);
    }

    this.templatesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.templatesMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
      this.templatesMenu.classList.add('hidden');
    });
    templateDropdown.append(this.templatesBtn, this.templatesMenu);

    // Hidden file inputs for web fallback / multi-import
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = 'image/png';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', () => void this.handleFileInputChange(false));

    this.wardrobeFileInput = document.createElement('input');
    this.wardrobeFileInput.type = 'file';
    this.wardrobeFileInput.accept = 'image/png';
    this.wardrobeFileInput.multiple = true;
    this.wardrobeFileInput.style.display = 'none';
    this.wardrobeFileInput.addEventListener('change', () =>
      void this.handleFileInputChange(true)
    );

    this.importBtn = document.createElement('button');
    this.importBtn.type = 'button';
    this.importBtn.className = 'block-btn header-btn';
    this.importBtn.innerHTML = `<span class="btn-icon">${ICONS.upload}</span><span data-role="import-label"></span>`;
    this.importBtn.addEventListener('click', () => void this.triggerImportPng(false));

    this.undoBtn = document.createElement('button');
    this.undoBtn.type = 'button';
    this.undoBtn.className = 'block-btn header-btn';
    const undoIcon = document.createElement('span');
    undoIcon.className = 'btn-icon';
    undoIcon.innerHTML = ICONS.undo;
    this.undoLabelEl = document.createElement('span');
    this.undoCountEl = document.createElement('span');
    this.undoCountEl.className = 'step-badge';
    this.undoBtn.append(undoIcon, this.undoLabelEl, this.undoCountEl);
    this.undoBtn.addEventListener('click', () => this.engine.undo());

    this.redoBtn = document.createElement('button');
    this.redoBtn.type = 'button';
    this.redoBtn.className = 'block-btn header-btn';
    const redoIcon = document.createElement('span');
    redoIcon.className = 'btn-icon';
    redoIcon.innerHTML = ICONS.redo;
    this.redoLabelEl = document.createElement('span');
    this.redoBtn.append(redoIcon, this.redoLabelEl);
    this.redoBtn.addEventListener('click', () => this.engine.redo());

    ribbonLeft.append(
      templateDropdown,
      this.fileInput,
      this.wardrobeFileInput,
      this.importBtn,
      makeDivider(),
      this.undoBtn,
      this.redoBtn
    );

    const ribbonRight = document.createElement('div');
    ribbonRight.className = 'header-cluster';

    const modelSwitch = document.createElement('div');
    modelSwitch.className = 'segmented-pill';

    this.classicBtn = document.createElement('button');
    this.classicBtn.type = 'button';
    this.classicBtn.className = 'seg-btn active';
    this.classicBtn.addEventListener('click', () => this.setModel('classic'));

    this.slimBtn = document.createElement('button');
    this.slimBtn.type = 'button';
    this.slimBtn.className = 'seg-btn';
    this.slimBtn.addEventListener('click', () => this.setModel('slim'));

    modelSwitch.append(this.classicBtn, this.slimBtn);

    this.toggle2DBtn = document.createElement('button');
    this.toggle2DBtn.type = 'button';
    this.toggle2DBtn.className = 'block-btn header-btn active-toggle';
    const g2dIcon = document.createElement('span');
    g2dIcon.className = 'btn-icon';
    g2dIcon.innerHTML = ICONS.grid2D;
    this.toggle2DLabelEl = document.createElement('span');
    this.toggle2DBtn.append(g2dIcon, this.toggle2DLabelEl);
    this.toggle2DBtn.addEventListener('click', () => {
      const nextCollapsed = !this.editor2D.isCollapsed;
      this.editor2D.setCollapsed(nextCollapsed);
      this.toggle2DBtn.classList.toggle('active-toggle', !nextCollapsed);
      setTimeout(() => this.stage3D.handleResize(), 40);
    });

    ribbonRight.append(modelSwitch, this.toggle2DBtn);
    topBarRibbon.append(ribbonLeft, ribbonRight);

    header.append(topBarPrimary, topBarRibbon);

    // ================= MAIN WORKSPACE =================
    const workspace = document.createElement('main');
    workspace.className = 'main-workspace';

    // --- 1. LEFT DOCK ---
    const leftDock = document.createElement('aside');
    leftDock.className = 'left-dock';

    // Active Paint Layer Selector (Base vs 3D Outer)
    this.paintLayerTitleEl = document.createElement('h2');
    this.paintLayerTitleEl.className = 'dock-section-title';

    const paintLayerSwitch = document.createElement('div');
    paintLayerSwitch.className = 'paint-layer-switch';

    this.paintLayerBaseBtn = document.createElement('button');
    this.paintLayerBaseBtn.type = 'button';
    this.paintLayerBaseBtn.className = 'paint-layer-btn layer-base active';
    const baseSwatch = document.createElement('span');
    baseSwatch.className = 'layer-swatch-dot dot-base';
    this.paintLayerBaseLabelEl = document.createElement('span');
    this.paintLayerBaseBtn.append(baseSwatch, this.paintLayerBaseLabelEl);
    this.paintLayerBaseBtn.addEventListener('click', () => this.setTargetLayer('base'));

    this.paintLayerOuterBtn = document.createElement('button');
    this.paintLayerOuterBtn.type = 'button';
    this.paintLayerOuterBtn.className = 'paint-layer-btn layer-outer';
    const outerSwatch = document.createElement('span');
    outerSwatch.className = 'layer-swatch-dot dot-outer';
    this.paintLayerOuterLabelEl = document.createElement('span');
    this.paintLayerOuterBtn.append(outerSwatch, this.paintLayerOuterLabelEl);
    this.paintLayerOuterBtn.addEventListener('click', () => this.setTargetLayer('outer'));

    paintLayerSwitch.append(this.paintLayerBaseBtn, this.paintLayerOuterBtn);

    this.toolsTitleEl = document.createElement('h2');
    this.toolsTitleEl.className = 'dock-section-title';

    const toolsGrid = document.createElement('div');
    toolsGrid.className = 'tools-grid';

    const makeToolBtn = (id: ToolId, svg: string) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tool-tile-btn';
      const iconSpan = document.createElement('span');
      iconSpan.className = 'tool-icon';
      iconSpan.innerHTML = svg;
      const labelSpan = document.createElement('span');
      labelSpan.className = 'tool-label';
      btn.append(iconSpan, labelSpan);
      btn.addEventListener('click', () => this.setTool(id));
      toolsGrid.appendChild(btn);
      return { btn, label: labelSpan };
    };

    this.toolBtns = {
      pencil: makeToolBtn('pencil', ICONS.pencil),
      eraser: makeToolBtn('eraser', ICONS.eraser),
      bucket: makeToolBtn('bucket', ICONS.bucket),
      eyedropper: makeToolBtn('eyedropper', ICONS.eyedropper),
    };

    // Base Eraser Options
    this.eraserOptionsRow = document.createElement('div');
    this.eraserOptionsRow.className = 'eraser-options-card hidden';

    this.eraserOptLabel = document.createElement('span');
    this.eraserOptLabel.className = 'eraser-opt-label';

    const eraserBtnGroup = document.createElement('div');
    eraserBtnGroup.className = 'eraser-opt-btns';

    this.eraserSkinBtn = document.createElement('button');
    this.eraserSkinBtn.type = 'button';
    this.eraserSkinBtn.className = 'chip-toggle active';
    this.eraserSkinBtn.addEventListener('click', () => this.setBaseEraserMode('skin'));

    this.eraserSkinSwatchBtn = document.createElement('button');
    this.eraserSkinSwatchBtn.type = 'button';
    this.eraserSkinSwatchBtn.className = 'mini-skin-swatch';
    this.eraserSkinSwatchBtn.style.backgroundColor = this.settings.baseSkinHex;
    this.eraserSkinSwatchBtn.title = 'Set current color as Base Skin Tone';
    this.eraserSkinSwatchBtn.addEventListener('click', () => {
      this.settings.baseSkinHex = this.settings.colorHex;
      this.eraserSkinSwatchBtn.style.backgroundColor = this.settings.baseSkinHex;
    });

    this.eraserClearBtn = document.createElement('button');
    this.eraserClearBtn.type = 'button';
    this.eraserClearBtn.className = 'chip-toggle';
    this.eraserClearBtn.addEventListener('click', () => this.setBaseEraserMode('clear'));

    eraserBtnGroup.append(
      this.eraserSkinBtn,
      this.eraserSkinSwatchBtn,
      this.eraserClearBtn
    );
    this.eraserOptionsRow.append(this.eraserOptLabel, eraserBtnGroup);

    // Modifiers
    this.modifiersTitleEl = document.createElement('h2');
    this.modifiersTitleEl.className = 'dock-section-title';

    const modList = document.createElement('div');
    modList.className = 'modifiers-list';

    this.mirrorBtn = document.createElement('button');
    this.mirrorBtn.type = 'button';
    this.mirrorBtn.className = 'modifier-toggle-btn';
    const mIcon = document.createElement('span');
    mIcon.className = 'btn-icon';
    mIcon.innerHTML = ICONS.mirror;
    this.mirrorLabelEl = document.createElement('span');
    this.mirrorLabelEl.className = 'mod-label';
    const mLed = document.createElement('span');
    mLed.className = 'mod-led';
    this.mirrorBtn.append(mIcon, this.mirrorLabelEl, mLed);
    this.mirrorBtn.addEventListener('click', () => {
      this.settings.mirrorSymmetry = !this.settings.mirrorSymmetry;
      this.syncToolButtons();
      this.editor2D.render();
    });

    this.noiseBtn = document.createElement('button');
    this.noiseBtn.type = 'button';
    this.noiseBtn.className = 'modifier-toggle-btn';
    const nIcon = document.createElement('span');
    nIcon.className = 'btn-icon';
    nIcon.innerHTML = ICONS.noise;
    this.noiseLabelEl = document.createElement('span');
    this.noiseLabelEl.className = 'mod-label';
    const nLed = document.createElement('span');
    nLed.className = 'mod-led';
    this.noiseBtn.append(nIcon, this.noiseLabelEl, nLed);
    this.noiseBtn.addEventListener('click', () => {
      this.settings.autoNoise = !this.settings.autoNoise;
      this.syncToolButtons();
    });

    modList.append(this.mirrorBtn, this.noiseBtn);

    const mannequinSlot = document.createElement('div');
    mannequinSlot.className = 'mannequin-slot';

    leftDock.append(
      this.paintLayerTitleEl,
      paintLayerSwitch,
      this.toolsTitleEl,
      toolsGrid,
      this.eraserOptionsRow,
      this.modifiersTitleEl,
      modList,
      mannequinSlot
    );

    // --- 2. CENTER STAGE ---
    const centerArea = document.createElement('section');
    centerArea.className = 'center-stage-area';

    const viewportWrap = document.createElement('div');
    viewportWrap.className = 'viewport3d-wrap';

    const cameraHud = document.createElement('div');
    cameraHud.className = 'viewport-hud-top';

    this.resetViewBtn = document.createElement('button');
    this.resetViewBtn.type = 'button';
    this.resetViewBtn.className = 'block-btn hud-reset-btn';
    const rvIcon = document.createElement('span');
    rvIcon.className = 'btn-icon';
    rvIcon.innerHTML = ICONS.resetView;
    this.resetViewLabelEl = document.createElement('span');
    this.resetViewBtn.append(rvIcon, this.resetViewLabelEl);
    this.resetViewBtn.addEventListener('click', () => this.stage3D.resetView());

    cameraHud.append(this.resetViewBtn);

    const bottomHud = document.createElement('div');
    bottomHud.className = 'viewport-hud-bottom';

    const poseControlsRow = document.createElement('div');
    poseControlsRow.className = 'pose-controls-row';

    const poseBar = document.createElement('div');
    poseBar.className = 'pose-bar';
    const poses: PoseId[] = ['stand', 'walk', 'action', 'spread'];
    this.poseBtns = {} as Record<PoseId, HTMLButtonElement>;
    for (const p of poses) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pose-btn';
      btn.classList.toggle('active', p === 'stand');
      btn.addEventListener('click', () => {
        this.stage3D.setPose(p);
        for (const k of poses) {
          this.poseBtns[k].classList.toggle('active', k === p);
        }
      });
      this.poseBtns[p] = btn;
      poseBar.appendChild(btn);
    }

    this.posePlayPauseBtn = document.createElement('button');
    this.posePlayPauseBtn.type = 'button';
    this.posePlayPauseBtn.className = 'pose-play-pause-btn';
    this.posePlayPauseBtn.addEventListener('click', () => {
      this.stage3D.toggleAnimationPaused();
      this.syncPosePlayPauseButton();
    });

    poseControlsRow.append(poseBar, this.posePlayPauseBtn);

    const infoRow = document.createElement('div');
    infoRow.className = 'viewport-info-row';
    this.statusTextEl = document.createElement('span');
    this.statusTextEl.className = 'status-pill';
    this.hintPillEl = document.createElement('span');
    this.hintPillEl.className = 'hint-pill';
    infoRow.append(this.statusTextEl, this.hintPillEl);

    bottomHud.append(poseControlsRow, infoRow);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast-banner hidden';

    viewportWrap.append(cameraHud, bottomHud, this.toastEl);

    this.stage3D = new SkinStage3D(
      viewportWrap,
      this.engine,
      this.paintController,
      () => this.settings
    );
    this.stage3D.onHoverChange = (info) => {
      this.lastHover = info;
      this.renderHoverStatus();
    };

    this.editor2D = new SyncedEditor2D(
      this.engine,
      this.paintController,
      () => this.settings,
      this.i18n
    );
    this.editor2D.onHoverChange = (info) => {
      this.lastHover = info;
      this.renderHoverStatus();
    };

    centerArea.append(viewportWrap, this.editor2D.root);

    this.mannequin = new MannequinWidget(
      this.i18n,
      (partId) => this.stage3D.getPartVisibility(partId),
      (partId, vis) => this.stage3D.setPartVisibility(partId, vis),
      (layer, vis) => this.stage3D.setLayerVisibility(layer, vis)
    );
    mannequinSlot.appendChild(this.mannequin.root);

    // --- 3. RIGHT DOCK ---
    this.colorPanel = new ColorWorkshopPanel(
      this.i18n,
      this.settings.colorHex,
      (hex) => {
        this.settings.colorHex = hex;
        if (this.settings.tool === 'eraser' || this.settings.tool === 'eyedropper') {
          this.setTool('pencil');
        }
      }
    );

    // --- 4. WARDROBE & .MCPACK FORGE MODAL ---
    this.wardrobeModal = new WardrobeModal(this.backend, this.i18n, {
      onLoadEntryIntoEditor: (entry) => this.loadWardrobeEntryIntoEditor(entry),
      onSaveCurrentToWardrobe: (forceNew) => this.saveCurrentSkinToWardrobe(forceNew),
      onImportFilesIntoWardrobe: () => this.triggerImportPng(true),
      getCurrentEditorPayload: () => this.buildCurrentEditorPayload(),
      getActiveWardrobeId: () => this.activeWardrobeId,
      onEntriesChanged: (total, _selected) => {
        this.wardrobeCountBadge.textContent = total > 0 ? String(total) : '';
      },
      onToast: (msg) => this.showToast(msg),
    });

    this.aboutModal = new AboutModal(this.i18n);

    // --- 5. DRAG & DROP OVERLAY ---
    this.dropOverlayEl = document.createElement('div');
    this.dropOverlayEl.className = 'drop-overlay hidden';
    const dropCard = document.createElement('div');
    dropCard.className = 'drop-overlay-card';
    const dropLogo = document.createElement('img');
    dropLogo.className = 'drop-overlay-logo';
    dropLogo.src = APP_ICON_URL;
    dropLogo.alt = 'Skinvil';
    dropLogo.draggable = false;
    this.dropOverlayTitleEl = document.createElement('h2');
    this.dropOverlaySubEl = document.createElement('p');
    dropCard.append(dropLogo, this.dropOverlayTitleEl, this.dropOverlaySubEl);
    this.dropOverlayEl.appendChild(dropCard);

    workspace.append(leftDock, centerArea, this.colorPanel.root);
    shell.append(
      header,
      workspace,
      this.wardrobeModal.root,
      this.aboutModal.root,
      this.dropOverlayEl
    );
    mountEl.appendChild(shell);
  }

  private applyStarterTemplate(id: StarterTemplateId, defaultModel: ModelType): void {
    this.activeWardrobeId = null;
    this.unmodifiedHdBytes = null;
    this.setModel(defaultModel);
    const skin = generateStarterSkin(id, defaultModel);
    this.engine.replaceWithImageData(skin, true);
    this.lastUndoSnapshotCount = this.engine.undoCount;
    this.skinNameInput.value = this.i18n.t.templates[id];
  }

  private async loadDataUrlIntoEditorCanvas(
    editor64DataUrl: string,
    recordUndo: boolean
  ): Promise<void> {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Failed to decode 64x64 editor texture'));
      img.src = editor64DataUrl;
    });
    await this.engine.loadFromImageElement(img, recordUndo);
    this.lastUndoSnapshotCount = this.engine.undoCount;
  }

  private async applyImportedSkinToEditor(
    res: ProcessedSkinResult,
    suggestedName: string
  ): Promise<void> {
    this.activeWardrobeId = null;
    this.setModel(res.detectedGeometry);
    await this.loadDataUrlIntoEditorCanvas(res.editor64DataUrl, true);

    // Keep pristine 128x128 HD PNG bytes until user paints on the 64x64 voxel canvas
    if (res.width === 128 && res.height === 128) {
      this.unmodifiedHdBytes = base64ToUint8Array(res.pngBase64);
    } else {
      this.unmodifiedHdBytes = null;
    }

    this.skinNameInput.value = suggestedName;

    const t = this.i18n.t;
    const kindMsg = res.wasLegacy64x32
      ? t.importedToastLegacy
      : res.width === 128
        ? t.importedToastHd
        : t.importedToast64;
    const geomMsg =
      res.detectedGeometry === 'slim' ? t.detectedSlimTag : t.detectedClassicTag;
    this.showToast(`${kindMsg} (${geomMsg})`);
  }

  private async loadWardrobeEntryIntoEditor(entry: WardrobeEntry): Promise<void> {
    this.setModel(entry.geometry);
    await this.loadDataUrlIntoEditorCanvas(entry.editor64DataUrl, true);
    this.activeWardrobeId = entry.id;
    this.unmodifiedHdBytes =
      entry.width === 128 ? base64ToUint8Array(entry.skinDataUrl) : null;
    this.skinNameInput.value = entry.name;
  }

  private async getActivePngBytes(): Promise<Uint8Array> {
    if (this.unmodifiedHdBytes) {
      return this.unmodifiedHdBytes;
    }
    return await this.engine.toPngBytes();
  }

  private async buildCurrentEditorPayload(): Promise<McpackSkinPayload> {
    const bytes = await this.getActivePngBytes();
    const name = this.skinNameInput.value.trim() || 'Skinvil Hero';
    return {
      name,
      geometry: this.settings.model,
      pngBase64: uint8ArrayToBase64(bytes),
    };
  }

  private async saveCurrentSkinToWardrobe(
    forceNew: boolean
  ): Promise<WardrobeEntry | null> {
    try {
      const bytes = await this.getActivePngBytes();
      const name = this.skinNameInput.value.trim() || 'Skinvil Hero';
      const entry = await this.backend.saveToWardrobe({
        id: forceNew ? null : this.activeWardrobeId,
        name,
        geometry: this.settings.model,
        pngBytes: bytes,
      });
      this.activeWardrobeId = entry.id;
      this.wardrobeModal.addSelectedId(entry.id);
      await this.wardrobeModal.reloadEntries();
      this.showToast(`${this.i18n.t.savedToWardrobeToast} ${entry.name}`);
      return entry;
    } catch (err) {
      this.showToast(String(err));
      return null;
    }
  }

  private async triggerImportPng(intoWardrobeOnly: boolean): Promise<void> {
    if (isTauriDesktop() && !intoWardrobeOnly) {
      try {
        const picked = await this.backend.pickAndImportSkinDialog();
        if (picked) {
          await this.applyImportedSkinToEditor(picked.result, picked.suggestedName);
        }
      } catch (err) {
        this.showToast(String(err));
      }
      return;
    }

    if (intoWardrobeOnly) {
      this.wardrobeFileInput.click();
    } else {
      this.fileInput.click();
    }
  }

  private async handleFileInputChange(intoWardrobe: boolean): Promise<void> {
    const input = intoWardrobe ? this.wardrobeFileInput : this.fileInput;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;

    await this.processDroppedOrSelectedFiles(files, intoWardrobe);
  }

  private async processDroppedOrSelectedFiles(
    files: File[],
    intoWardrobe: boolean
  ): Promise<void> {
    const pngFiles = files.filter(
      (f) => f.type === 'image/png' || f.name.toLowerCase().endsWith('.png')
    );
    if (pngFiles.length === 0) return;

    try {
      if (!intoWardrobe && pngFiles.length === 1) {
        const f = pngFiles[0];
        const buf = new Uint8Array(await f.arrayBuffer());
        const res = await this.backend.processPngBytes(buf);
        const cleanName = f.name.replace(/\.png$/i, '') || 'Imported Skin';
        await this.applyImportedSkinToEditor(res, cleanName);
        return;
      }

      // Multiple files or explicit Wardrobe import -> save all into Wardrobe & check for .mcpack!
      let firstProcessed: { res: ProcessedSkinResult; name: string } | null = null;
      for (const f of pngFiles) {
        const buf = new Uint8Array(await f.arrayBuffer());
        const res = await this.backend.processPngBytes(buf);
        const cleanName = f.name.replace(/\.png$/i, '') || 'Imported Skin';
        if (!firstProcessed) {
          firstProcessed = { res, name: cleanName };
        }
        const saved = await this.backend.saveToWardrobe({
          name: cleanName,
          geometry: res.detectedGeometry,
          pngBytes: base64ToUint8Array(res.pngBase64),
        });
        this.wardrobeModal.addSelectedId(saved.id);
      }

      if (!intoWardrobe && firstProcessed) {
        await this.applyImportedSkinToEditor(firstProcessed.res, firstProcessed.name);
      }
      await this.wardrobeModal.reloadEntries();
    } catch (err) {
      this.showToast(String(err));
    }
  }

  private bindDragAndDrop(mountEl: HTMLElement): void {
    let dragDepth = 0;

    mountEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      this.dropOverlayEl.classList.remove('hidden');
    });

    mountEl.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    mountEl.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        this.dropOverlayEl.classList.add('hidden');
      }
    });

    mountEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      this.dropOverlayEl.classList.add('hidden');
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) {
        void this.processDroppedOrSelectedFiles(files, this.wardrobeModal.isOpen);
      }
    });

    // Tauri v2 native OS file-path drag-and-drop listener
    if (isTauriDesktop()) {
      void getCurrentWebview()
        .onDragDropEvent(async (event) => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            this.dropOverlayEl.classList.remove('hidden');
          } else if (event.payload.type === 'leave') {
            this.dropOverlayEl.classList.add('hidden');
          } else if (event.payload.type === 'drop') {
            this.dropOverlayEl.classList.add('hidden');
            const pngPaths = event.payload.paths.filter((p) =>
              p.toLowerCase().endsWith('.png')
            );
            if (pngPaths.length === 0) return;

            try {
              const first = await this.backend.importFromPath(pngPaths[0]);
              await this.applyImportedSkinToEditor(first.result, first.suggestedName);

              if (pngPaths.length > 1 || this.wardrobeModal.isOpen) {
                for (const p of pngPaths) {
                  const imp = await this.backend.importFromPath(p);
                  const saved = await this.backend.saveToWardrobe({
                    name: imp.suggestedName,
                    geometry: imp.result.detectedGeometry,
                    pngBytes: base64ToUint8Array(imp.result.pngBase64),
                  });
                  this.wardrobeModal.addSelectedId(saved.id);
                }
                await this.wardrobeModal.reloadEntries();
              }
            } catch (err) {
              this.showToast(String(err));
            }
          }
        })
        .catch(() => {
          // Ignore if running outside native webview window
        });
    }
  }

  private async handleQuickExportPng(): Promise<void> {
    try {
      const payload = await this.buildCurrentEditorPayload();
      const written = await this.backend.exportStandalonePngsWithDialog([payload]);
      if (written && written.length > 0) {
        this.showToast(`${this.i18n.t.savedToastPrefix} ${written[0]}`);
      }
    } catch (err) {
      this.showToast(String(err));
    }
  }

  private setTool(tool: ToolId): void {
    this.settings.tool = tool;
    this.syncToolButtons();
  }

  private setTargetLayer(layer: LayerKind): void {
    this.settings.targetLayer = layer;
    if (!this.stage3D.hasAnyVisiblePartOnLayer(layer)) {
      this.stage3D.setLayerVisibility(layer, true);
      this.mannequin.refresh();
    }
    this.syncToolButtons();
  }

  private setBaseEraserMode(mode: BaseEraserMode): void {
    this.settings.baseEraserMode = mode;
    this.syncToolButtons();
  }

  private setModel(model: ModelType): void {
    this.settings.model = model;
    this.stage3D.setModelType(model);
    this.mannequin.setModelType(model);
    this.classicBtn.classList.toggle('active', model === 'classic');
    this.slimBtn.classList.toggle('active', model === 'slim');
    this.editor2D.render();
  }

  private syncToolButtons(): void {
    const activeLayer = this.settings.targetLayer ?? 'base';
    this.paintLayerBaseBtn.classList.toggle('active', activeLayer === 'base');
    this.paintLayerOuterBtn.classList.toggle('active', activeLayer === 'outer');

    (Object.keys(this.toolBtns) as ToolId[]).forEach((id) => {
      this.toolBtns[id].btn.classList.toggle('active', this.settings.tool === id);
    });
    this.eraserOptionsRow.classList.toggle('hidden', this.settings.tool !== 'eraser');
    this.eraserSkinBtn.classList.toggle(
      'active',
      this.settings.baseEraserMode === 'skin'
    );
    this.eraserClearBtn.classList.toggle(
      'active',
      this.settings.baseEraserMode === 'clear'
    );
    this.mirrorBtn.classList.toggle('active', this.settings.mirrorSymmetry);
    this.noiseBtn.classList.toggle('active', this.settings.autoNoise);
  }

  private syncHistoryButtons(): void {
    this.undoBtn.disabled = !this.engine.canUndo;
    this.redoBtn.disabled = !this.engine.canRedo;
    this.undoCountEl.textContent =
      this.engine.undoCount > 0 ? String(this.engine.undoCount) : '';
  }

  private syncPosePlayPauseButton(): void {
    const paused = this.stage3D.isPaused;
    const t = this.i18n.t;
    const label = paused ? t.posePlayTooltip : t.posePauseTooltip;
    this.posePlayPauseBtn.innerHTML = paused ? ICONS.playMotion : ICONS.pauseMotion;
    this.posePlayPauseBtn.classList.toggle('paused', paused);
    this.posePlayPauseBtn.setAttribute('aria-pressed', String(paused));
    this.posePlayPauseBtn.setAttribute('aria-label', label);
    this.posePlayPauseBtn.title = label;
  }

  private refreshHintLine(): void {
    this.hintPillEl.textContent = this.i18n.t.viewportHint;
  }

  private renderHoverStatus(): void {
    const t = this.i18n.t;
    if (!this.lastHover) {
      this.statusTextEl.textContent = t.statusReady;
      return;
    }
    const { partId, layer, face, px, py } = this.lastHover;
    this.statusTextEl.textContent = `${t.parts[partId]} (${t.layers[layer]}) • ${t.faces[face]} • [${px}, ${py}]`;
  }

  private refreshAllLabels(): void {
    const t = this.i18n.t;
    const loc = this.i18n.currentLocale;

    this.langRoBtn.classList.toggle('active', loc === 'ro');
    this.langEnBtn.classList.toggle('active', loc === 'en');
    this.langSwitchWrap.title = t.langToggleTooltip;

    this.subtitleEl.textContent = t.appSubtitle;

    this.templatesBtn.querySelector('[data-role="tpl-label"]')!.textContent =
      t.templatesBtn;
    this.templatesBtn.title = t.templatesTooltip;
    for (const meta of STARTER_TEMPLATES) {
      this.templateItemBtns[meta.id].textContent = t.templates[meta.id];
    }

    this.importBtn.querySelector('[data-role="import-label"]')!.textContent =
      t.importPngBtn;
    this.importBtn.title = t.importPngTooltip;

    this.skinNameInput.placeholder = t.skinNamePlaceholder;
    this.skinNameInput.title = t.skinNameTooltip;

    this.saveWardrobeBtn.querySelector('[data-role="save-label"]')!.textContent =
      t.saveWardrobeBtn;
    this.saveWardrobeBtn.title = t.saveWardrobeTooltip;

    this.openWardrobeBtn.querySelector('[data-role="wardrobe-label"]')!.textContent =
      t.openWardrobeBtn;
    this.openWardrobeBtn.title = t.openWardrobeTooltip;

    this.forgeQuickBtn.querySelector('[data-role="forge-label"]')!.textContent =
      t.forgeHeaderBtn;
    this.forgeQuickBtn.title = t.forgeHeaderTooltip;

    this.exportBtn.querySelector('[data-role="export-label"]')!.textContent =
      t.exportPngBtn;
    this.exportBtn.title = t.exportPngTooltip;

    this.undoLabelEl.textContent = t.undoBtn;
    this.undoBtn.title = t.undoTooltip;
    this.redoLabelEl.textContent = t.redoBtn;
    this.redoBtn.title = t.redoTooltip;

    this.classicBtn.textContent = t.modelClassic;
    this.classicBtn.title = t.modelClassicTooltip;
    this.slimBtn.textContent = t.modelSlim;
    this.slimBtn.title = t.modelSlimTooltip;

    this.toggle2DLabelEl.textContent = t.toggle2DBtn;
    this.toggle2DBtn.title = t.toggle2DTooltip;

    this.paintLayerTitleEl.textContent = t.paintLayerSectionTitle;
    this.paintLayerBaseLabelEl.textContent = t.paintLayerBase;
    this.paintLayerBaseBtn.title = t.paintLayerBaseTooltip;
    this.paintLayerOuterLabelEl.textContent = t.paintLayerOuter;
    this.paintLayerOuterBtn.title = t.paintLayerOuterTooltip;

    this.toolsTitleEl.textContent = t.toolsSectionTitle;
    this.toolBtns.pencil.label.textContent = t.toolPencil;
    this.toolBtns.pencil.btn.title = t.toolPencilTooltip;
    this.toolBtns.eraser.label.textContent = t.toolEraser;
    this.toolBtns.eraser.btn.title = t.toolEraserTooltip;
    this.toolBtns.bucket.label.textContent = t.toolBucket;
    this.toolBtns.bucket.btn.title = t.toolBucketTooltip;
    this.toolBtns.eyedropper.label.textContent = t.toolEyedropper;
    this.toolBtns.eyedropper.btn.title = t.toolEyedropperTooltip;

    this.eraserOptLabel.textContent = t.eraserBaseOptionLabel;
    this.eraserSkinBtn.textContent = t.eraserModeSkin;
    this.eraserSkinBtn.title = t.eraserModeSkinTooltip;
    this.eraserClearBtn.textContent = t.eraserModeClear;
    this.eraserClearBtn.title = t.eraserModeClearTooltip;

    this.modifiersTitleEl.textContent = t.modifiersSectionTitle;
    this.mirrorLabelEl.textContent = t.modMirror;
    this.mirrorBtn.title = t.modMirrorTooltip;
    this.noiseLabelEl.textContent = t.modNoise;
    this.noiseBtn.title = t.modNoiseTooltip;

    this.resetViewLabelEl.textContent = t.resetViewBtn;
    this.resetViewBtn.title = t.resetViewTooltip;

    this.poseBtns.stand.textContent = t.poseStand;
    this.poseBtns.stand.title = t.poseStandTooltip;
    this.poseBtns.walk.textContent = t.poseWalk;
    this.poseBtns.walk.title = t.poseWalkTooltip;
    this.poseBtns.action.textContent = t.poseAction;
    this.poseBtns.action.title = t.poseActionTooltip;
    this.poseBtns.spread.textContent = t.poseSpread;
    this.poseBtns.spread.title = t.poseSpreadTooltip;
    this.syncPosePlayPauseButton();

    this.dropOverlayTitleEl.textContent = t.dropOverlayTitle;
    this.dropOverlaySubEl.textContent = t.dropOverlaySub;

    this.aboutLicenseBtn.textContent = t.aboutLicenseBtn;
    this.aboutLicenseBtn.title = t.aboutLicenseTooltip;
    this.aboutLicenseBtn.setAttribute('aria-label', t.aboutLicenseTooltip);

    this.refreshHintLine();
    this.renderHoverStatus();
  }

  private bindGlobalShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.aboutModal.isOpen) {
        this.aboutModal.close();
        return;
      }

      if (e.key === 'Escape' && this.wardrobeModal.isOpen) {
        this.wardrobeModal.close();
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.engine.redo();
        } else {
          this.engine.undo();
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.engine.redo();
        return;
      }

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void this.saveCurrentSkinToWardrobe(false);
        return;
      }

      if (!mod && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            this.setTool('pencil');
            break;
          case 'e':
            this.setTool('eraser');
            break;
          case 'g':
            this.setTool('bucket');
            break;
          case 'i':
            this.setTool('eyedropper');
            break;
          case 'l':
            this.setTargetLayer(
              (this.settings.targetLayer ?? 'base') === 'base' ? 'outer' : 'base'
            );
            break;
          case 'm':
            this.settings.mirrorSymmetry = !this.settings.mirrorSymmetry;
            this.syncToolButtons();
            this.editor2D.render();
            break;
          case 'n':
            this.settings.autoNoise = !this.settings.autoNoise;
            this.syncToolButtons();
            break;
        }
      }
    });
  }

  private showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    window.setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 3800);
  }
}
