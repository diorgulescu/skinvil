// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import rawAppIconSvg from '../../app-icon.svg?raw';
import rawIndexHtml from '../../index.html?raw';
import rawLicense from '../../LICENSE?raw';

if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    public readonly data: Uint8ClampedArray;
    public readonly width: number;
    public readonly height: number;
    constructor(
      dataOrWidth: Uint8ClampedArray | number,
      widthOrHeight: number,
      height?: number
    ) {
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
  (globalThis as unknown as { ImageData: typeof ImageDataPolyfill }).ImageData =
    ImageDataPolyfill;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
}

// Mock WebGLRenderer so SkinStage3D runs with real Three.js Camera, OrbitControls, Raycaster, and Meshes in JSDOM
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    public readonly domElement: HTMLCanvasElement;
    public outputColorSpace = actual.SRGBColorSpace;
    public toneMapping = actual.NoToneMapping;

    constructor() {
      this.domElement = document.createElement('canvas');
      this.domElement.width = 800;
      this.domElement.height = 600;
      Object.defineProperty(this.domElement, 'clientWidth', {
        value: 800,
        configurable: true,
      });
      Object.defineProperty(this.domElement, 'clientHeight', {
        value: 600,
        configurable: true,
      });
      this.domElement.getBoundingClientRect = () =>
        ({
          left: 0,
          top: 0,
          right: 800,
          bottom: 600,
          width: 800,
          height: 600,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;

      const captured = new Set<number>();
      this.domElement.setPointerCapture = vi.fn((id: number) => {
        captured.add(id);
      });
      this.domElement.releasePointerCapture = vi.fn((id: number) => {
        captured.delete(id);
      });
      this.domElement.hasPointerCapture = vi.fn((id: number) => captured.has(id));
    }

    public setPixelRatio(): void {}
    public setSize(): void {}
    public render(): void {}
    public dispose(): void {}
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

import { PaintController, type PaintSettings } from '../core/paintTools';
import { SkinCanvasEngine } from '../core/skinCanvas';
import { generateStarterSkin } from '../core/starterSkins';
import { APP_ICON_URL, ICONS } from '../ui/icons';
import { SkinvilApp } from '../ui/appShell';
import { SkinStage3D } from '../viewport/skinStage3D';

function createMemoryBackedSkinEngine(): SkinCanvasEngine {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  const fakeCanvas = document.createElement('canvas');
  fakeCanvas.width = 64;
  fakeCanvas.height = 64;

  const ctx = {
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
    fillStyle: '#000',
    fillRect: () => {},
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D;

  vi.spyOn(fakeCanvas, 'getContext').mockReturnValue(ctx);

  const engine = new SkinCanvasEngine(fakeCanvas);
  engine.replaceWithImageData(generateStarterSkin('explorer', 'classic'), false);
  engine.clearHistory();
  return engine;
}

function makePointerEvent(
  type: string,
  init: PointerEventInit & { clientX: number; clientY: number }
): Event {
  if (typeof globalThis.PointerEvent !== 'undefined') {
    return new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: 'mouse',
      ...init,
    });
  }
  const ev = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.assign(ev, {
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'mouse',
  });
  return ev;
}

/** Projects a 3D world point onto the 800x600 stage canvas in client coordinates. */
function projectWorldToClient(
  stage: SkinStage3D,
  worldPoint: THREE.Vector3
): { clientX: number; clientY: number } {
  const cam = (stage as unknown as { camera: THREE.PerspectiveCamera }).camera;
  const scene = (stage as unknown as { scene: THREE.Scene }).scene;
  cam.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);
  const ndc = worldPoint.clone().project(cam);
  return {
    clientX: ((ndc.x + 1) * 0.5) * 800,
    clientY: ((-ndc.y + 1) * 0.5) * 600,
  };
}

describe('Brand Identity (app-icon.svg) & UI Shell Cleanup', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      const buf = new Uint8ClampedArray(256 * 256 * 4);
      return {
        imageSmoothingEnabled: false,
        clearRect: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        beginPath: () => {},
        closePath: () => {},
        setLineDash: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        stroke: () => {},
        fill: () => {},
        fillText: () => {},
        save: () => {},
        restore: () => {},
        scale: () => {},
        drawImage: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        getImageData: (_x: number, _y: number, w: number, h: number) =>
          new ImageData(buf.slice(0, w * h * 4), w, h),
        putImageData: () => {},
        createImageData: (w: number, h: number) => new ImageData(w, h),
      } as unknown as CanvasRenderingContext2D;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('uses app-icon.svg across header, wardrobe modal, and drag-drop overlay, with zero Rotate/Paint toggle button', () => {
    const normalizeSvg = (s: string) =>
      s.replace(/"/g, "'").replace(/>\s+</g, '><').trim();

    if (APP_ICON_URL.startsWith('data:image/svg+xml,')) {
      const decodedSvg = decodeURIComponent(
        APP_ICON_URL.slice('data:image/svg+xml,'.length)
      );
      expect(normalizeSvg(decodedSvg)).toBe(normalizeSvg(rawAppIconSvg));
    } else {
      expect(APP_ICON_URL).toContain('app-icon');
    }
    expect(ICONS.appLogo).toContain(APP_ICON_URL);
    expect(rawIndexHtml).toContain('href="/app-icon.svg"');

    const mount = document.createElement('div');
    document.body.appendChild(mount);
    new SkinvilApp(mount);

    const headerLogo = mount.querySelector<HTMLImageElement>(
      '.brand-logo-box img.brand-logo-img'
    );
    const wardrobeLogo = mount.querySelector<HTMLImageElement>(
      '.wardrobe-header img.wardrobe-brand-logo'
    );
    const dropLogo = mount.querySelector<HTMLImageElement>(
      '.drop-overlay-card img.drop-overlay-logo'
    );

    expect(headerLogo).not.toBeNull();
    expect(headerLogo!.getAttribute('src')).toBe(APP_ICON_URL);
    expect(wardrobeLogo).not.toBeNull();
    expect(wardrobeLogo!.getAttribute('src')).toBe(APP_ICON_URL);
    expect(dropLogo).not.toBeNull();
    expect(dropLogo!.getAttribute('src')).toBe(APP_ICON_URL);

    // Top viewport HUD keeps ONLY the Reset View button (no manual Paint vs Rotate mode switch)
    const hudTop = mount.querySelector('.viewport-hud-top')!;
    expect(hudTop).not.toBeNull();
    expect(hudTop.querySelector('.camera-mode-pill')).toBeNull();
    const hudButtons = hudTop.querySelectorAll('button');
    expect(hudButtons.length).toBe(1);
    expect(hudButtons[0].classList.contains('hud-reset-btn')).toBe(true);

    // Compact Play/Pause toggle button next to pose selector with RO/EN tooltips
    const playPauseBtn = mount.querySelector<HTMLButtonElement>(
      '.pose-controls-row button.pose-play-pause-btn'
    )!;
    expect(playPauseBtn).not.toBeNull();
    expect(playPauseBtn.getAttribute('aria-pressed')).toBe('false');
    expect(playPauseBtn.title).toBe('Îngheață mișcarea');

    // Pause motion -> tooltip flips to "Pornește mișcarea"
    playPauseBtn.click();
    expect(playPauseBtn.getAttribute('aria-pressed')).toBe('true');
    expect(playPauseBtn.classList.contains('paused')).toBe(true);
    expect(playPauseBtn.title).toBe('Pornește mișcarea');

    // Switch language to EN -> tooltip updates to English
    const enBtn = mount.querySelectorAll<HTMLButtonElement>('.lang-btn')[1];
    enBtn.click();
    expect(playPauseBtn.title).toBe('Start motion');

    playPauseBtn.click();
    expect(playPauseBtn.getAttribute('aria-pressed')).toBe('false');
    expect(playPauseBtn.title).toBe('Freeze motion');
  });

  it('ships a complete verbatim GNU GPLv3 LICENSE and an interactive offline GPLv3 legal notices modal', () => {
    // Verify complete verbatim GNU GPLv3 text (Preamble + all Sections 0..17)
    expect(rawLicense).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(rawLicense).toContain('Version 3, 29 June 2007');
    expect(rawLicense).toContain('0. Definitions.');
    expect(rawLicense).toContain('6. Conveying Non-Source Forms.');
    expect(rawLicense).toContain('7. Additional Terms.');
    expect(rawLicense).toContain('14. Revised Versions of this License.');
    expect(rawLicense).toContain('15. Disclaimer of Warranty.');
    expect(rawLicense).toContain('16. Limitation of Liability.');
    expect(rawLicense).toContain('17. Interpretation of Sections 15 and 16.');
    expect(rawLicense).toContain('END OF TERMS AND CONDITIONS');

    const mount = document.createElement('div');
    document.body.appendChild(mount);
    new SkinvilApp(mount);

    const licenseBtn = mount.querySelector<HTMLButtonElement>('button.license-badge-btn')!;
    const aboutBackdrop = mount.querySelector<HTMLElement>('.about-backdrop')!;
    const licensePre = mount.querySelector<HTMLElement>('pre.about-license-text')!;

    expect(licenseBtn).not.toBeNull();
    expect(licenseBtn.textContent).toBe('GPLv3');
    expect(aboutBackdrop).not.toBeNull();
    expect(aboutBackdrop.classList.contains('hidden')).toBe(true);

    // Open interactive legal notices modal (GNU GPLv3 Section 0 & 5d)
    licenseBtn.click();
    expect(aboutBackdrop.classList.contains('hidden')).toBe(false);
    expect(aboutBackdrop.textContent).toContain('Copyright (C) 2026 Skinvil Contributors');
    expect(aboutBackdrop.textContent).toContain('FĂRĂ NICIO GARANȚIE');
    expect(licensePre.textContent).toBe(rawLicense);

    // Switch language to EN -> legal summary updates cleanly
    const enBtn = mount.querySelectorAll<HTMLButtonElement>('.lang-btn')[1];
    enBtn.click();
    expect(aboutBackdrop.textContent).toContain('WITHOUT ANY WARRANTY');
    expect(aboutBackdrop.textContent).toContain('NOT AN OFFICIAL MINECRAFT PRODUCT');

    // Escape closes the modal
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(aboutBackdrop.classList.contains('hidden')).toBe(true);
  });
});

describe('Seamless Desktop 3D Viewport Mouse & Camera Controls', () => {
  let container: HTMLDivElement;
  let engine: SkinCanvasEngine;
  let paintController: PaintController;
  let settings: PaintSettings;
  let stage: SkinStage3D;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(container);

    engine = createMemoryBackedSkinEngine();
    paintController = new PaintController(engine);
    settings = {
      tool: 'pencil',
      targetLayer: 'base',
      colorHex: '#FF1122',
      baseSkinHex: '#F3C39C',
      baseEraserMode: 'skin',
      mirrorSymmetry: false,
      autoNoise: false,
      model: 'classic',
    };

    stage = new SkinStage3D(container, engine, paintController, () => settings);
    canvas = container.querySelector('canvas.stage3d-canvas') as HTMLCanvasElement;
  });

  afterEach(() => {
    stage.dispose();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('configures OrbitControls mouseButtons (LEFT=ROTATE, MIDDLE=PAN, RIGHT=ROTATE), zoom=true, and suppresses contextmenu', () => {
    const controls = (stage as unknown as { controls: { mouseButtons: unknown; enableZoom: boolean } })
      .controls;

    expect(controls.enableZoom).toBe(true);
    expect(controls.mouseButtons).toEqual({
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    });

    const ctxEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(ctxEvent);
    expect(ctxEvent.defaultPrevented).toBe(true);
  });

  it('right-click and middle-click ALWAYS rotate/pan camera even when directly over the character mesh', () => {
    const cam = (stage as unknown as { camera: THREE.PerspectiveCamera }).camera;
    const controls = (stage as unknown as { controls: { target: THREE.Vector3 } }).controls;

    // Project center of character torso front face (0, 18, 2) onto canvas
    const onTorso = projectWorldToClient(stage, new THREE.Vector3(0, 18, 2));

    // 1. RIGHT CLICK (button = 2) directly on torso -> orbits camera, never paints
    const camStart = cam.position.clone();
    canvas.dispatchEvent(
      makePointerEvent('pointerdown', {
        button: 2,
        buttons: 2,
        pointerId: 11,
        ...onTorso,
      })
    );
    expect(stage.isPaintingActive).toBe(false);
    expect(stage.isControlsEnabled).toBe(true);
    expect(canvas.style.cursor).toBe('grabbing');

    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 2,
        pointerId: 11,
        clientX: onTorso.clientX + 90,
        clientY: onTorso.clientY + 40,
      })
    );
    expect(cam.position.distanceTo(camStart)).toBeGreaterThan(0.5);
    expect(engine.undoCount).toBe(0);

    canvas.dispatchEvent(
      makePointerEvent('pointerup', {
        button: 2,
        buttons: 0,
        pointerId: 11,
        clientX: onTorso.clientX + 90,
        clientY: onTorso.clientY + 40,
      })
    );

    // 2. MIDDLE CLICK (button = 1) directly on torso -> pans camera target, never paints
    stage.resetView();
    const targetStart = controls.target.clone();
    const onTorsoReset = projectWorldToClient(stage, new THREE.Vector3(0, 18, 2));

    canvas.dispatchEvent(
      makePointerEvent('pointerdown', {
        button: 1,
        buttons: 4,
        pointerId: 12,
        ...onTorsoReset,
      })
    );
    expect(stage.isPaintingActive).toBe(false);
    expect(stage.isControlsEnabled).toBe(true);
    expect(canvas.style.cursor).toBe('grabbing');

    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 4,
        pointerId: 12,
        clientX: onTorsoReset.clientX + 80,
        clientY: onTorsoReset.clientY + 50,
      })
    );
    expect(controls.target.distanceTo(targetStart)).toBeGreaterThan(0.2);
    expect(engine.undoCount).toBe(0);

    canvas.dispatchEvent(
      makePointerEvent('pointerup', {
        button: 1,
        buttons: 0,
        pointerId: 12,
        clientX: onTorsoReset.clientX + 80,
        clientY: onTorsoReset.clientY + 50,
      })
    );
  });

  it('left-click ON character freezes camera, captures pointer, paints stroke with 1 Undo step, ignores empty misses, and restores on window pointerup', () => {
    const cam = (stage as unknown as { camera: THREE.PerspectiveCamera }).camera;
    const camBefore = cam.position.clone();

    const hitA = projectWorldToClient(stage, new THREE.Vector3(-1.5, 27.5, 4));
    const hitB = projectWorldToClient(stage, new THREE.Vector3(1.5, 27.5, 4));

    // Left-click ON character head
    canvas.dispatchEvent(
      makePointerEvent('pointerdown', {
        button: 0,
        buttons: 1,
        pointerId: 21,
        ...hitA,
      })
    );

    expect(stage.isPaintingActive).toBe(true);
    expect(stage.isControlsEnabled).toBe(false);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(21);
    expect(canvas.style.cursor).toBe('crosshair');

    // Drag across character head
    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 1,
        pointerId: 21,
        ...hitB,
      })
    );

    // Drag off into empty space mid-stroke -> ignored without rotating camera!
    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 1,
        pointerId: 21,
        clientX: 8,
        clientY: 8,
      })
    );
    expect(stage.isPaintingActive).toBe(true);
    expect(stage.isControlsEnabled).toBe(false);
    expect(cam.position.distanceTo(camBefore)).toBe(0);

    // Release outside canvas on window -> finalizes stroke, pushes 1 Undo state, restores controls
    window.dispatchEvent(
      makePointerEvent('pointerup', {
        button: 0,
        buttons: 0,
        pointerId: 21,
        clientX: 8,
        clientY: 8,
      })
    );

    expect(stage.isPaintingActive).toBe(false);
    expect(stage.isControlsEnabled).toBe(true);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(21);
    expect(engine.undoCount).toBe(1);
    expect(cam.position.distanceTo(camBefore)).toBe(0);

    // Verify pixels on Head Front (y=8..15, x=8..15) actually received #FF1122 (255, 17, 34)
    let paintedCount = 0;
    for (let y = 8; y < 16; y++) {
      for (let x = 8; x < 16; x++) {
        const c = engine.getPixel(x, y);
        if (c.r === 255 && c.g === 17 && c.b === 34) {
          paintedCount++;
        }
      }
    }
    expect(paintedCount).toBeGreaterThanOrEqual(2);
  });

  it('supports Bucket, Eraser, Eyedropper on left-click and restores state on window pointercancel', () => {
    const headPt = projectWorldToClient(stage, new THREE.Vector3(0, 28, 4));

    // 1. Bucket fill Head Front with #11AAFF
    settings.tool = 'bucket';
    settings.colorHex = '#11AAFF';
    canvas.dispatchEvent(
      makePointerEvent('pointerdown', {
        button: 0,
        buttons: 1,
        pointerId: 31,
        ...headPt,
      })
    );
    expect(stage.isControlsEnabled).toBe(false);
    window.dispatchEvent(
      makePointerEvent('pointerup', {
        button: 0,
        buttons: 0,
        pointerId: 31,
        ...headPt,
      })
    );
    expect(stage.isControlsEnabled).toBe(true);
    expect(engine.undoCount).toBe(1);

    // 2. Eyedropper samples #11AAFF and switches tool to pencil without drawing on slight move before pointerup
    let pickedHex = '';
    paintController.onColorPicked = (hex) => {
      pickedHex = hex;
      settings.colorHex = '#00FF00';
      settings.tool = 'pencil';
    };
    settings.tool = 'eyedropper';

    canvas.dispatchEvent(
      makePointerEvent('pointerdown', {
        button: 0,
        buttons: 1,
        pointerId: 32,
        ...headPt,
      })
    );
    expect(pickedHex).toBe('#11AAFF');
    expect(stage.isControlsEnabled).toBe(false);

    // Slight drag before pointerup must NOT paint #00FF00
    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 1,
        pointerId: 32,
        clientX: headPt.clientX + 4,
        clientY: headPt.clientY,
      })
    );
    window.dispatchEvent(
      makePointerEvent('pointercancel', {
        button: 0,
        buttons: 0,
        pointerId: 32,
        ...headPt,
      })
    );
    expect(stage.isPaintingActive).toBe(false);
    expect(stage.isControlsEnabled).toBe(true);
    expect(engine.undoCount).toBe(1);
  });

  it('left-click on empty background orbits smoothly and idle pointermove switches cursor between crosshair and grab', () => {
    const cam = (stage as unknown as { camera: THREE.PerspectiveCamera }).camera;
    const onTorso = projectWorldToClient(stage, new THREE.Vector3(0, 18, 2));
    const emptyPt = { clientX: 12, clientY: 12 };

    // Idle hover over character -> crosshair
    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 0,
        ...onTorso,
      })
    );
    expect(canvas.style.cursor).toBe('crosshair');

    // Idle hover over empty background -> grab
    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 0,
        ...emptyPt,
      })
    );
    expect(canvas.style.cursor).toBe('grab');

    // Left-click & drag on empty background -> grabbing + camera orbits without painting
    const camStart = cam.position.clone();
    canvas.dispatchEvent(
      makePointerEvent('pointerdown', {
        button: 0,
        buttons: 1,
        pointerId: 41,
        ...emptyPt,
      })
    );
    expect(stage.isPaintingActive).toBe(false);
    expect(stage.isControlsEnabled).toBe(true);
    expect(canvas.style.cursor).toBe('grabbing');

    canvas.dispatchEvent(
      makePointerEvent('pointermove', {
        button: -1,
        buttons: 1,
        pointerId: 41,
        clientX: 160,
        clientY: 110,
      })
    );
    expect(canvas.style.cursor).toBe('grabbing');
    expect(cam.position.distanceTo(camStart)).toBeGreaterThan(0.5);
    expect(engine.undoCount).toBe(0);

    canvas.dispatchEvent(
      makePointerEvent('pointerup', {
        button: 0,
        buttons: 0,
        pointerId: 41,
        clientX: 160,
        clientY: 110,
      })
    );
    window.dispatchEvent(
      makePointerEvent('pointerup', {
        button: 0,
        buttons: 0,
        pointerId: 41,
        clientX: 160,
        clientY: 110,
      })
    );
    expect(stage.isControlsEnabled).toBe(true);
    expect(canvas.style.cursor).toBe('grab');
  });

  it('positions all 6 anatomical joint THREE.Groups and offsets Base + Outer meshes together without clipping', () => {
    const internal = stage as unknown as {
      joints: Record<
        'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg',
        THREE.Group
      >;
      partMeshes: Record<string, THREE.Mesh>;
    };

    // Classic model pivots
    expect(internal.joints.head.position.toArray()).toEqual([0, 24, 0]);
    expect(internal.joints.torso.position.toArray()).toEqual([0, 24, 0]);
    expect(internal.joints.rightArm.position.toArray()).toEqual([-6, 22, 0]);
    expect(internal.joints.leftArm.position.toArray()).toEqual([6, 22, 0]);
    expect(internal.joints.rightLeg.position.toArray()).toEqual([-2, 12, 0]);
    expect(internal.joints.leftLeg.position.toArray()).toEqual([2, 12, 0]);

    // Base & Outer meshes share the exact same joint THREE.Group and downward/upward offsets
    expect(internal.partMeshes.head.parent).toBe(internal.joints.head);
    expect(internal.partMeshes.hat.parent).toBe(internal.joints.head);
    expect(internal.partMeshes.head.position.toArray()).toEqual([0, 4, 0]);

    expect(internal.partMeshes.torso.parent).toBe(internal.joints.torso);
    expect(internal.partMeshes.jacket.parent).toBe(internal.joints.torso);
    expect(internal.partMeshes.torso.position.toArray()).toEqual([0, -6, 0]);

    expect(internal.partMeshes.rightArm.parent).toBe(internal.joints.rightArm);
    expect(internal.partMeshes.rightSleeve.parent).toBe(internal.joints.rightArm);
    expect(internal.partMeshes.rightArm.position.toArray()).toEqual([0, -4, 0]);

    expect(internal.partMeshes.leftArm.parent).toBe(internal.joints.leftArm);
    expect(internal.partMeshes.leftSleeve.parent).toBe(internal.joints.leftArm);
    expect(internal.partMeshes.leftArm.position.toArray()).toEqual([0, -4, 0]);

    expect(internal.partMeshes.rightLeg.parent).toBe(internal.joints.rightLeg);
    expect(internal.partMeshes.rightPants.parent).toBe(internal.joints.rightLeg);
    expect(internal.partMeshes.rightLeg.position.toArray()).toEqual([0, -6, 0]);

    expect(internal.partMeshes.leftLeg.parent).toBe(internal.joints.leftLeg);
    expect(internal.partMeshes.leftPants.parent).toBe(internal.joints.leftLeg);
    expect(internal.partMeshes.leftLeg.position.toArray()).toEqual([0, -6, 0]);

    // Slim model shifts shoulder pivots to (-5.5, 22, 0) and (5.5, 22, 0)
    stage.setModelType('slim');
    expect(internal.joints.rightArm.position.toArray()).toEqual([-5.5, 22, 0]);
    expect(internal.joints.leftArm.position.toArray()).toEqual([5.5, 22, 0]);
  });

  it('animates Walk, Stand, and Action procedurally while keeping Spread / T-Pose strictly static', () => {
    const internal = stage as unknown as {
      characterRoot: THREE.Group;
      joints: Record<
        'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg',
        THREE.Group
      >;
    };

    // 1. WALK pose (~4 rad/s)
    stage.setPose('walk');
    stage.stepAnimation(0.08);
    stage.stepAnimation(0.08); // animTime = 0.16 -> t = 0.64 rad
    const t = stage.animationTime * 4.0;
    expect(t).toBeCloseTo(0.64, 5);
    expect(internal.joints.rightLeg.rotation.x).toBeCloseTo(Math.sin(t) * 0.65, 5);
    expect(internal.joints.leftLeg.rotation.x).toBeCloseTo(-Math.sin(t) * 0.65, 5);
    expect(internal.joints.rightArm.rotation.x).toBeCloseTo(-Math.sin(t) * 0.6, 5);
    expect(internal.joints.leftArm.rotation.x).toBeCloseTo(Math.sin(t) * 0.6, 5);
    expect(Math.abs(internal.joints.rightArm.rotation.z)).toBeCloseTo(0.05, 5);
    expect(Math.abs(internal.joints.leftArm.rotation.z)).toBeCloseTo(0.05, 5);
    expect(internal.characterRoot.position.y).toBeCloseTo(Math.abs(Math.cos(t)) * 0.35, 5);
    expect(internal.joints.head.rotation.y).toBeCloseTo(Math.sin(t * 0.5) * 0.12, 5);

    // Verify outward arm flare moves hands away from torso (|x| > 6) rather than inward
    const rightHandWorld = new THREE.Vector3(0, -10, 0).applyMatrix4(
      internal.joints.rightArm.matrixWorld
    );
    const leftHandWorld = new THREE.Vector3(0, -10, 0).applyMatrix4(
      internal.joints.leftArm.matrixWorld
    );
    expect(rightHandWorld.x).toBeLessThan(-6);
    expect(leftHandWorld.x).toBeGreaterThan(6);

    // 2. STAND pose (gentle idle breathing)
    stage.setPose('stand');
    stage.stepAnimation(0.1);
    const st = stage.animationTime;
    const expectedFlare = Math.sin(st * 1.5) * 0.04 + 0.05;
    expect(Math.abs(internal.joints.rightArm.rotation.z)).toBeCloseTo(expectedFlare, 5);
    expect(Math.abs(internal.joints.leftArm.rotation.z)).toBeCloseTo(expectedFlare, 5);
    expect(internal.characterRoot.position.y).toBe(0);

    // 3. ACTION pose (faster 6.5 rad/s sprint + 0.15 rad forward torso lean)
    stage.setPose('action');
    const actionBefore = internal.joints.rightLeg.rotation.x;
    stage.stepAnimation(0.08);
    expect(internal.joints.torso.rotation.x).toBeCloseTo(0.15, 5);
    expect(internal.joints.rightLeg.rotation.x).not.toBeCloseTo(actionBefore, 4);

    // 4. SPREAD / T-Pose (strictly static: arms Z = +/-0.75, legs Z = +/-0.25, zero motion)
    stage.setPose('spread');
    expect(internal.joints.rightArm.rotation.z).toBeCloseTo(-0.75, 5);
    expect(internal.joints.leftArm.rotation.z).toBeCloseTo(0.75, 5);
    expect(internal.joints.rightLeg.rotation.z).toBeCloseTo(-0.25, 5);
    expect(internal.joints.leftLeg.rotation.z).toBeCloseTo(0.25, 5);
    expect(internal.characterRoot.position.y).toBe(0);

    const timeAtSpread = stage.animationTime;
    stage.stepAnimation(0.08);
    stage.stepAnimation(0.08);
    expect(stage.animationTime).toBe(timeAtSpread);
    expect(internal.joints.rightArm.rotation.z).toBeCloseTo(-0.75, 5);
    expect(internal.joints.leftArm.rotation.z).toBeCloseTo(0.75, 5);
  });

  it('freezes animTime automatically while painting on a walking limb and resumes smoothly without phase jumps', () => {
    const internal = stage as unknown as {
      joints: Record<
        'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg',
        THREE.Group
      >;
      partMeshes: Record<string, THREE.Mesh>;
    };

    stage.setPose('walk');
    // Advance walk cycle so rightLeg swings noticeably backward/forward (t = 1.2 rad)
    for (let i = 0; i < 6; i++) {
      stage.stepAnimation(0.05);
    }
    const frozenPhaseTime = stage.animationTime;
    const frozenRightLegRotX = internal.joints.rightLeg.rotation.x;
    expect(Math.abs(frozenRightLegRotX)).toBeGreaterThan(0.5);

    // Compute world coordinates of the swung rightLeg front face center (local [0, 0, 2] on rightLeg mesh)
    const swungLegFrontWorld = new THREE.Vector3(0, 0, 2).applyMatrix4(
      internal.partMeshes.rightLeg.matrixWorld
    );
    const legScreenPt = projectWorldToClient(stage, swungLegFrontWorld);

    // Left-click directly on the swung leg -> Raycaster hits accurately thanks to characterRoot.updateMatrixWorld(true)
    settings.tool = 'pencil';
    settings.colorHex = '#AA22FF';
    canvas.dispatchEvent(
      makePointerEvent('pointerdown', {
        button: 0,
        buttons: 1,
        pointerId: 55,
        ...legScreenPt,
      })
    );
    expect(stage.isPaintingActive).toBe(true);

    // Run 10 animation steps while painting -> animTime and limb rotation stay 100% frozen!
    for (let i = 0; i < 10; i++) {
      stage.stepAnimation(0.05);
    }
    expect(stage.animationTime).toBe(frozenPhaseTime);
    expect(internal.joints.rightLeg.rotation.x).toBe(frozenRightLegRotX);

    // Release pointer -> next stepAnimation resumes smoothly from exact frozenPhaseTime + 0.05
    window.dispatchEvent(
      makePointerEvent('pointerup', {
        button: 0,
        buttons: 0,
        pointerId: 55,
        ...legScreenPt,
      })
    );
    expect(stage.isPaintingActive).toBe(false);
    expect(engine.undoCount).toBe(1);

    stage.stepAnimation(0.05);
    expect(stage.animationTime).toBeCloseTo(frozenPhaseTime + 0.05, 6);

    // Manual Play/Pause also freezes and resumes without phase jump
    stage.setAnimationPaused(true);
    const pausedAt = stage.animationTime;
    stage.stepAnimation(0.05);
    stage.stepAnimation(0.05);
    expect(stage.animationTime).toBe(pausedAt);

    stage.setAnimationPaused(false);
    stage.stepAnimation(0.05);
    expect(stage.animationTime).toBeCloseTo(pausedAt + 0.05, 6);
  });
});
