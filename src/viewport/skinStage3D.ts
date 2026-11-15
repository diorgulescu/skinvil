// SPDX-License-Identifier: GPL-3.0-only
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PaintController, PaintSettings } from '../core/paintTools';
import type { SkinCanvasEngine } from '../core/skinCanvas';
import {
  ALL_PART_IDS,
  applySkinBoxUVs,
  getMirroredTarget,
  getSkinPartsSpec,
  normalToFaceName,
  uvToFacePixel,
  type FaceName,
  type LayerKind,
  type ModelType,
  type PartId,
  type PixelRect,
} from '../core/uvMap';

export type PoseId = 'stand' | 'walk' | 'action' | 'spread';

export interface HoverInfo {
  partId: PartId;
  layer: LayerKind;
  face: FaceName;
  px: number;
  py: number;
}

interface PaintRaycastHit {
  partId: PartId;
  layer: LayerKind;
  face: FaceName;
  rect: PixelRect;
  px: number;
  py: number;
}

export class SkinStage3D {
  private readonly container: HTMLElement;
  private readonly engine: SkinCanvasEngine;
  private readonly paintController: PaintController;
  private readonly getSettings: () => PaintSettings;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly skinTexture: THREE.CanvasTexture;
  private readonly baseMaterial: THREE.MeshLambertMaterial;
  private readonly outerMaterial: THREE.MeshLambertMaterial;

  private readonly characterRoot = new THREE.Group();
  private readonly joints: Record<
    'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg',
    THREE.Group
  >;
  private readonly partMeshes: Partial<Record<PartId, THREE.Mesh>> = {};

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNDC = new THREE.Vector2();

  private readonly primaryHoverCursor: THREE.LineSegments;
  private readonly primaryHoverFill: THREE.Mesh;
  private readonly primaryHoverGroup = new THREE.Group();
  private readonly mirrorHoverGroup = new THREE.Group();

  private model: ModelType = 'classic';
  private pose: PoseId = 'stand';
  private isPainting = false;
  private isCameraManipulating = false;
  private isAnimationPaused = false;
  private animTime = 0;
  private lastFrameTimestamp: number | null = null;
  private lastIdlePointer: { x: number; y: number } | null = null;
  private activePointerId: number | null = null;
  private animFrameId = 0;
  private resizeObserver: ResizeObserver;

  private visibility: Record<PartId, boolean> = {
    head: true,
    torso: true,
    rightArm: true,
    leftArm: true,
    rightLeg: true,
    leftLeg: true,
    hat: true,
    jacket: true,
    rightSleeve: true,
    leftSleeve: true,
    rightPants: true,
    leftPants: true,
  };

  public onHoverChange?: (info: HoverInfo | null) => void;

  constructor(
    container: HTMLElement,
    engine: SkinCanvasEngine,
    paintController: PaintController,
    getSettings: () => PaintSettings
  ) {
    this.container = container;
    this.engine = engine;
    this.paintController = paintController;
    this.getSettings = getSettings;

    // 1. Scene & Lighting
    this.scene = new THREE.Scene();

    const ambient = new THREE.AmbientLight(0xffffff, 2.15);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.95);
    keyLight.position.set(24, 48, 38);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xc7d2fe, 0.45);
    fillLight.position.set(-28, 18, -32);
    this.scene.add(fillLight);

    const underLight = new THREE.DirectionalLight(0x94a3b8, 0.28);
    underLight.position.set(0, -30, 10);
    this.scene.add(underLight);

    // Non-occluding wireframe stage floor grid at y = 0 so camera can still see & paint shoe soles from underneath!
    const grid = new THREE.GridHelper(32, 16, 0x38bdf8, 0x2d3654);
    if (Array.isArray(grid.material)) {
      grid.material.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.45;
      });
    } else {
      grid.material.transparent = true;
      grid.material.opacity = 0.45;
    }
    grid.position.y = -0.04;
    this.scene.add(grid);

    // 2. Camera & Renderer
    const w = Math.max(320, container.clientWidth);
    const h = Math.max(320, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.5, 400);
    this.camera.position.set(14, 21, 52);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.domElement.className = 'stage3d-canvas';
    this.renderer.domElement.style.cursor = 'grab';
    container.appendChild(this.renderer.domElement);

    // 3. OrbitControls (seamless desktop mouse controls: Left=Rotate on empty space, Middle=Pan, Right=Rotate, Wheel=Zoom)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 16.2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enableZoom = true;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 120;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.update();

    // 4. CanvasTexture (Single Source of Truth 64x64 RGBA Canvas)
    this.skinTexture = new THREE.CanvasTexture(this.engine.canvas);
    this.skinTexture.magFilter = THREE.NearestFilter;
    this.skinTexture.minFilter = THREE.NearestFilter;
    this.skinTexture.colorSpace = THREE.SRGBColorSpace;
    this.skinTexture.generateMipmaps = false;

    this.engine.onChange(() => {
      this.skinTexture.needsUpdate = true;
    });

    // Base & Outer Materials (Outer uses transparent: true + alphaTest: 0.5 per spec!)
    // Both materials clamp vMapUv strictly inside each cube face's exact UV bounds so MSAA
    // never bleeds adjacent opaque texels onto transparent Outer Layer silhouette edges.
    const applyFaceClampedUvShader = (
      mat: THREE.MeshLambertMaterial,
      cacheTag: string
    ) => {
      mat.customProgramCacheKey = () => cacheTag;
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <uv_pars_vertex>',
            '#include <uv_pars_vertex>\nattribute vec4 uvBounds;\nvarying vec4 vUvBounds;'
          )
          .replace(
            '#include <uv_vertex>',
            '#include <uv_vertex>\nvUvBounds = uvBounds;'
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <map_pars_fragment>',
            '#include <map_pars_fragment>\nvarying vec4 vUvBounds;'
          )
          .replace(
            '#include <map_fragment>',
            [
              '#ifdef USE_MAP',
              '\tvec4 sampledDiffuseColor = texture2D( map, clamp( vMapUv, vUvBounds.xy, vUvBounds.zw ) );',
              '\tdiffuseColor *= sampledDiffuseColor;',
              '#endif',
            ].join('\n')
          );
      };
    };

    this.baseMaterial = new THREE.MeshLambertMaterial({
      map: this.skinTexture,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.FrontSide,
    });
    applyFaceClampedUvShader(this.baseMaterial, 'skinvil-uv-clamp-base-v1');

    this.outerMaterial = new THREE.MeshLambertMaterial({
      map: this.skinTexture,
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    applyFaceClampedUvShader(this.outerMaterial, 'skinvil-uv-clamp-outer-v1');

    // 5. Character Joint Rig
    this.joints = {
      head: new THREE.Group(),
      torso: new THREE.Group(),
      rightArm: new THREE.Group(),
      leftArm: new THREE.Group(),
      rightLeg: new THREE.Group(),
      leftLeg: new THREE.Group(),
    };
    for (const group of Object.values(this.joints)) {
      this.characterRoot.add(group);
    }
    this.scene.add(this.characterRoot);

    this.buildCharacterMeshes();
    this.applyCurrentPose();

    // 6. 3D Voxel Pixel Hover Highlights (Primary + Mirror Ghost)
    const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
    this.primaryHoverCursor = new THREE.LineSegments(
      borderGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: true })
    );
    this.primaryHoverFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.primaryHoverGroup.add(this.primaryHoverFill, this.primaryHoverCursor);
    this.primaryHoverGroup.visible = false;
    this.scene.add(this.primaryHoverGroup);

    const mirrorBorder = new THREE.LineSegments(
      borderGeo,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, depthTest: true })
    );
    const mirrorFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.mirrorHoverGroup.add(mirrorFill, mirrorBorder);
    this.mirrorHoverGroup.visible = false;
    this.scene.add(this.mirrorHoverGroup);

    // 7. Pointer & Keyboard Listeners
    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.startLoop();
  }

  private buildCharacterMeshes(): void {
    // Clear existing meshes cleanly
    for (const partId of ALL_PART_IDS) {
      const oldMesh = this.partMeshes[partId];
      if (oldMesh) {
        oldMesh.parent?.remove(oldMesh);
        oldMesh.geometry.dispose();
        delete this.partMeshes[partId];
      }
    }

    const specs = getSkinPartsSpec(this.model);

    const attachPart = (
      partId: PartId,
      jointKey: keyof SkinStage3D['joints'],
      localOffset: [number, number, number]
    ) => {
      const spec = specs[partId];
      const [w, h, d] = spec.size;
      const geo = applySkinBoxUVs(new THREE.BoxGeometry(w, h, d), spec.faces);
      const mat = spec.layer === 'outer' ? this.outerMaterial : this.baseMaterial;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(localOffset[0], localOffset[1], localOffset[2]);
      mesh.scale.setScalar(spec.scale);
      mesh.visible = this.visibility[partId];
      mesh.userData.partId = partId;
      this.joints[jointKey].add(mesh);
      this.partMeshes[partId] = mesh;
    };

    // Head & Hat pivot at neck base (0, 24, 0), geometry offset upward -> center at (0, +4, 0)
    attachPart('head', 'head', [0, 4, 0]);
    attachPart('hat', 'head', [0, 4, 0]);

    // Torso & Jacket pivot at neck base (0, 24, 0), geometry offset downward -> center at (0, -6, 0)
    attachPart('torso', 'torso', [0, -6, 0]);
    attachPart('jacket', 'torso', [0, -6, 0]);

    // Arms & Sleeves pivot at shoulder (∓6 / ∓5.5, 22, 0), geometry offset downward -> center at (0, -4, 0)
    attachPart('rightArm', 'rightArm', [0, -4, 0]);
    attachPart('rightSleeve', 'rightArm', [0, -4, 0]);

    attachPart('leftArm', 'leftArm', [0, -4, 0]);
    attachPart('leftSleeve', 'leftArm', [0, -4, 0]);

    // Legs & Pants pivot at hip (∓2, 12, 0), geometry offset downward -> center at (0, -6, 0)
    attachPart('rightLeg', 'rightLeg', [0, -6, 0]);
    attachPart('rightPants', 'rightLeg', [0, -6, 0]);

    attachPart('leftLeg', 'leftLeg', [0, -6, 0]);
    attachPart('leftPants', 'leftLeg', [0, -6, 0]);
  }

  private applyCurrentPose(): void {
    const armX = this.model === 'slim' ? 5.5 : 6.0;

    // Anatomical joint pivots (Base + Outer share each THREE.Group so they never clip)
    this.joints.head.position.set(0, 24, 0);
    this.joints.torso.position.set(0, 24, 0);
    this.joints.rightArm.position.set(-armX, 22, 0);
    this.joints.leftArm.position.set(armX, 22, 0);
    this.joints.rightLeg.position.set(-2, 12, 0);
    this.joints.leftLeg.position.set(2, 12, 0);

    switch (this.pose) {
      case 'stand': {
        // Gentle idle breathing (~1.5 rad/s): subtle outward arm flare & slight head pitch/yaw
        const t = this.animTime;
        const armFlare = Math.sin(t * 1.5) * 0.04 + 0.05;
        const armSwayX = Math.sin(t * 1.1) * 0.03;
        this.characterRoot.position.set(0, 0, 0);
        this.joints.head.rotation.set(
          Math.sin(t * 1.2) * 0.035,
          Math.sin(t * 0.7) * 0.06,
          0
        );
        this.joints.torso.rotation.set(0, 0, 0);
        this.joints.rightArm.rotation.set(armSwayX, 0, -armFlare);
        this.joints.leftArm.rotation.set(-armSwayX, 0, armFlare);
        this.joints.rightLeg.rotation.set(0, 0, 0);
        this.joints.leftLeg.rotation.set(0, 0, 0);
        break;
      }

      case 'walk': {
        // Authentic voxel walk cycle at 4.0 rad/s
        const t = this.animTime * 4.0;
        const swing = Math.sin(t);
        this.characterRoot.position.set(0, Math.abs(Math.cos(t)) * 0.35, 0);
        this.joints.head.rotation.set(0, Math.sin(t * 0.5) * 0.12, 0);
        this.joints.torso.rotation.set(0, 0, 0);
        this.joints.rightArm.rotation.set(-swing * 0.6, 0, -0.05);
        this.joints.leftArm.rotation.set(swing * 0.6, 0, 0.05);
        this.joints.rightLeg.rotation.set(swing * 0.65, 0, 0);
        this.joints.leftLeg.rotation.set(-swing * 0.65, 0, 0);
        break;
      }

      case 'action': {
        // Dynamic sprint / hero cycle at 6.5 rad/s (0.95 rad limb swing, 0.15 rad forward torso lean;
        // initial phase 0.85 holds a bold heroic stride even if paused immediately at t=0)
        const s = this.animTime * 6.5 + 0.85;
        const sprint = Math.sin(s);
        this.characterRoot.position.set(0, Math.abs(Math.cos(s)) * 0.48, 0);
        this.joints.head.rotation.set(-0.06, Math.sin(s * 0.5) * 0.14, 0);
        this.joints.torso.rotation.set(0.15, 0, 0);
        this.joints.rightArm.rotation.set(-sprint * 0.95, 0, -0.08);
        this.joints.leftArm.rotation.set(sprint * 0.95, 0, 0.08);
        this.joints.rightLeg.rotation.set(sprint * 0.95, 0, 0);
        this.joints.leftLeg.rotation.set(-sprint * 0.95, 0, 0);
        break;
      }

      case 'spread': {
        // Strictly static T-Pose / Spread: arms +/-0.75 rad, legs +/-0.25 rad outward, zero motion
        this.characterRoot.position.set(0, 0, 0);
        this.joints.head.rotation.set(0, 0, 0);
        this.joints.torso.rotation.set(0, 0, 0);
        this.joints.rightArm.rotation.set(0, 0, -0.75);
        this.joints.leftArm.rotation.set(0, 0, 0.75);
        this.joints.rightLeg.rotation.set(0, 0, -0.25);
        this.joints.leftLeg.rotation.set(0, 0, 0.25);
        break;
      }
    }

    // Keep world matrices synchronized immediately so THREE.Raycaster hits moving limbs accurately
    this.characterRoot.updateMatrixWorld(true);
  }

  public stepAnimation(deltaSeconds: number): void {
    const clamped = Math.min(Math.max(deltaSeconds, 0), 0.1);
    const shouldAdvance =
      clamped > 0 &&
      !this.isPainting &&
      !this.isAnimationPaused &&
      this.pose !== 'spread';

    if (shouldAdvance) {
      this.animTime += clamped;
    }

    this.applyCurrentPose();

    if (shouldAdvance && this.lastIdlePointer && !this.isCameraManipulating) {
      this.updateIdleHoverAndCursor(this.lastIdlePointer.x, this.lastIdlePointer.y);
    }
  }

  public setModelType(next: ModelType): void {
    if (this.model === next) return;
    this.model = next;
    this.buildCharacterMeshes();
    this.applyCurrentPose();
  }

  public getModelType(): ModelType {
    return this.model;
  }

  public setPose(next: PoseId): void {
    this.pose = next;
    this.applyCurrentPose();
  }

  public getPose(): PoseId {
    return this.pose;
  }

  public setAnimationPaused(paused: boolean): void {
    this.isAnimationPaused = paused;
  }

  public toggleAnimationPaused(): boolean {
    this.isAnimationPaused = !this.isAnimationPaused;
    return this.isAnimationPaused;
  }

  public get isPaused(): boolean {
    return this.isAnimationPaused;
  }

  public get animationTime(): number {
    return this.animTime;
  }

  public resetView(): void {
    this.camera.position.set(14, 21, 52);
    this.controls.target.set(0, 16.2, 0);
    this.controls.update();
  }

  public get isPaintingActive(): boolean {
    return this.isPainting;
  }

  public get isControlsEnabled(): boolean {
    return this.controls.enabled;
  }

  public setPartVisibility(partId: PartId, visible: boolean): void {
    this.visibility[partId] = visible;
    const mesh = this.partMeshes[partId];
    if (mesh) {
      mesh.visible = visible;
    }
  }

  public getPartVisibility(partId: PartId): boolean {
    return this.visibility[partId];
  }

  public setLayerVisibility(layer: LayerKind, visible: boolean): void {
    const specs = getSkinPartsSpec(this.model);
    for (const partId of ALL_PART_IDS) {
      if (specs[partId].layer === layer) {
        this.setPartVisibility(partId, visible);
      }
    }
  }

  public hasAnyVisiblePartOnLayer(layer: LayerKind): boolean {
    const specs = getSkinPartsSpec(this.model);
    return ALL_PART_IDS.some(
      (partId) => specs[partId].layer === layer && this.visibility[partId]
    );
  }

  private getVisibleMeshes(): THREE.Mesh[] {
    const list: THREE.Mesh[] = [];
    for (const partId of ALL_PART_IDS) {
      const m = this.partMeshes[partId];
      if (m && m.visible) {
        list.push(m);
      }
    }
    return list;
  }

  private raycastPaintTarget(
    clientX: number,
    clientY: number,
    forEyedropper = false
  ): PaintRaycastHit | null {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;

    this.pointerNDC.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;

    this.characterRoot.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const visibleMeshes = this.getVisibleMeshes();
    const intersects = this.raycaster.intersectObjects(visibleMeshes, false);
    if (intersects.length === 0) return null;

    const specs = getSkinPartsSpec(this.model);
    const settings = this.getSettings();
    const targetLayer: LayerKind = settings.targetLayer ?? 'base';
    const isEraser = settings.tool === 'eraser' && !forEyedropper;

    const candidates: PaintRaycastHit[] = [];

    for (const hit of intersects) {
      if (!hit.face || !hit.uv) continue;
      const mesh = hit.object as THREE.Mesh;
      const partId = mesh.userData.partId as PartId | undefined;
      if (!partId) continue;

      if (!forEyedropper) {
        const invMat = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
        const localDir = this.raycaster.ray.direction
          .clone()
          .transformDirection(invMat);
        if (hit.face.normal.dot(localDir) > 0) {
          continue;
        }
      }

      const spec = specs[partId];
      const face = normalToFaceName(hit.face.normal);
      const rect = spec.faces[face];
      const [px, py] = uvToFacePixel(hit.uv, rect);

      candidates.push({
        partId,
        layer: spec.layer,
        face,
        rect,
        px,
        py,
      });
    }

    if (candidates.length === 0) return null;

    // 1. Eyedropper: sample the front-most visible pixel with alpha > 0 (or fall back to a hit Base/solo mesh)
    if (forEyedropper) {
      return (
        candidates.find((c) => this.engine.getPixel(c.px, c.py).a > 0) ??
        candidates.find((c) => c.layer === 'base') ??
        candidates.find((c) => !this.visibility[specs[c.partId].counterpartId]) ??
        null
      );
    }

    // 2. Eraser in Base mode: if an opaque Outer pixel sits right in front, erase it first;
    //    otherwise erase on the target layer.
    if (isEraser && targetLayer === 'base') {
      const first = candidates[0];
      if (
        first.layer === 'outer' &&
        this.engine.getPixel(first.px, first.py).a >= 128
      ) {
        return first;
      }
    }

    // 3. Match the active targetLayer ('base' by default so strokes land directly on the main
    //    character model instead of floating on the 1.12x/1.06x Outer accessory shell!).
    const preferred = candidates.find((c) => c.layer === targetLayer);
    if (preferred) return preferred;

    // 4. Fallback if the counterpart part on targetLayer is hidden in the Mannequin,
    //    OR if an opaque Outer voxel protrudes beyond the Base silhouette.
    const fallback = candidates[0];
    const counterpart = specs[fallback.partId].counterpartId;
    if (
      !this.visibility[counterpart] ||
      (fallback.layer === 'outer' &&
        this.engine.getPixel(fallback.px, fallback.py).a >= 128)
    ) {
      return fallback;
    }

    return null;
  }

  private positionHoverIndicator(
    group: THREE.Group,
    partId: PartId,
    face: FaceName,
    px: number,
    py: number
  ): void {
    const mesh = this.partMeshes[partId];
    if (!mesh || !mesh.visible) {
      group.visible = false;
      return;
    }

    const spec = getSkinPartsSpec(this.model)[partId];
    const [W, H, D] = spec.size;
    const [rx, ry] = spec.faces[face];
    const lx = px - rx;
    const ly = py - ry;
    const eps = 0.03;

    const localPos = new THREE.Vector3();
    const localEuler = new THREE.Euler();

    switch (face) {
      case 'front':
        localPos.set(-W / 2 + lx + 0.5, H / 2 - (ly + 0.5), D / 2 + eps);
        localEuler.set(0, 0, 0);
        break;
      case 'back':
        localPos.set(W / 2 - (lx + 0.5), H / 2 - (ly + 0.5), -D / 2 - eps);
        localEuler.set(0, Math.PI, 0);
        break;
      case 'right':
        localPos.set(-W / 2 - eps, H / 2 - (ly + 0.5), -D / 2 + lx + 0.5);
        localEuler.set(0, -Math.PI / 2, 0);
        break;
      case 'left':
        localPos.set(W / 2 + eps, H / 2 - (ly + 0.5), D / 2 - (lx + 0.5));
        localEuler.set(0, Math.PI / 2, 0);
        break;
      case 'top':
        localPos.set(-W / 2 + lx + 0.5, H / 2 + eps, -D / 2 + ly + 0.5);
        localEuler.set(-Math.PI / 2, 0, 0);
        break;
      case 'bottom':
        localPos.set(-W / 2 + lx + 0.5, -H / 2 - eps, -D / 2 + ly + 0.5);
        localEuler.set(Math.PI / 2, 0, 0);
        break;
    }

    mesh.updateWorldMatrix(true, false);
    const localQuat = new THREE.Quaternion().setFromEuler(localEuler);
    const meshWorldQuat = new THREE.Quaternion();
    const meshWorldScale = new THREE.Vector3();
    mesh.matrixWorld.decompose(new THREE.Vector3(), meshWorldQuat, meshWorldScale);

    group.position.copy(localPos).applyMatrix4(mesh.matrixWorld);
    group.quaternion.copy(meshWorldQuat).multiply(localQuat);
    group.scale.copy(meshWorldScale);
    group.visible = true;
  }

  private hideHoverIndicators(): void {
    this.primaryHoverGroup.visible = false;
    this.mirrorHoverGroup.visible = false;
    this.onHoverChange?.(null);
  }

  private showHoverForHit(hit: PaintRaycastHit, settings: PaintSettings): void {
    this.positionHoverIndicator(
      this.primaryHoverGroup,
      hit.partId,
      hit.face,
      hit.px,
      hit.py
    );

    if (settings.mirrorSymmetry && settings.tool !== 'eyedropper') {
      const mirrored = getMirroredTarget(hit.px, hit.py, this.model, {
        partId: hit.partId,
        face: hit.face,
      });
      if (
        mirrored &&
        (mirrored.px !== hit.px ||
          mirrored.py !== hit.py ||
          mirrored.partId !== hit.partId)
      ) {
        this.positionHoverIndicator(
          this.mirrorHoverGroup,
          mirrored.partId,
          mirrored.face,
          mirrored.px,
          mirrored.py
        );
      } else {
        this.mirrorHoverGroup.visible = false;
      }
    } else {
      this.mirrorHoverGroup.visible = false;
    }

    this.onHoverChange?.({
      partId: hit.partId,
      layer: hit.layer,
      face: hit.face,
      px: hit.px,
      py: hit.py,
    });
  }

  private isClientPointInsideCanvas(clientX: number, clientY: number): boolean {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      clientX >= bounds.left &&
      clientX <= bounds.right &&
      clientY >= bounds.top &&
      clientY <= bounds.bottom
    );
  }

  private updateIdleHoverAndCursor(clientX: number, clientY: number): void {
    const settings = this.getSettings();
    const hit = this.raycastPaintTarget(
      clientX,
      clientY,
      settings.tool === 'eyedropper'
    );
    if (!hit) {
      this.renderer.domElement.style.cursor = 'grab';
      this.hideHoverIndicators();
      return;
    }
    this.renderer.domElement.style.cursor = 'crosshair';
    this.showHoverForHit(hit, settings);
  }

  private finalizeActivePaintStroke(pointerIdToRelease?: number): void {
    if (!this.isPainting) return;
    this.paintController.endStroke(this.getSettings());
    const dom = this.renderer.domElement;
    const pid = pointerIdToRelease ?? this.activePointerId;
    if (pid !== null && pid !== undefined) {
      try {
        if (dom.hasPointerCapture(pid)) {
          dom.releasePointerCapture(pid);
        }
      } catch {
        // Ignore synthetic events without active pointer capture
      }
    }
    this.activePointerId = null;
    this.isPainting = false;
  }

  private readonly handleWindowPointerEnd = (e: PointerEvent): void => {
    if (this.isPainting) {
      this.finalizeActivePaintStroke(e.pointerId);
    }
    this.isPainting = false;
    this.controls.enabled = true;

    if (e.buttons === 0) {
      this.isCameraManipulating = false;
      if (
        e.type === 'pointerup' &&
        this.isClientPointInsideCanvas(e.clientX, e.clientY)
      ) {
        this.lastIdlePointer = { x: e.clientX, y: e.clientY };
        this.updateIdleHoverAndCursor(e.clientX, e.clientY);
      } else {
        this.lastIdlePointer = null;
        this.renderer.domElement.style.cursor = 'grab';
        this.hideHoverIndicators();
      }
    }
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    // Suppress native browser context menu on the 3D canvas so right-drag orbit is seamless
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // Intercept pointerdown in CAPTURE phase BEFORE OrbitControls
    dom.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        // RIGHT CLICK (2) or MIDDLE CLICK (1): always rotate/pan camera, even over the character
        if (e.button === 2 || e.button === 1) {
          this.finalizeActivePaintStroke();
          this.isPainting = false;
          this.isCameraManipulating = true;
          this.lastIdlePointer = null;
          this.controls.enabled = true;
          dom.style.cursor = 'grabbing';
          this.hideHoverIndicators();
          return;
        }

        if (e.button !== 0) {
          return;
        }

        // LEFT CLICK (0): raycast against currently visible character meshes
        const settings = this.getSettings();
        const hit = this.raycastPaintTarget(
          e.clientX,
          e.clientY,
          settings.tool === 'eyedropper'
        );

        // Clicked empty space OUTSIDE the character -> smooth left-drag orbit via OrbitControls
        if (!hit) {
          this.isPainting = false;
          this.isCameraManipulating = true;
          this.lastIdlePointer = null;
          this.controls.enabled = true;
          dom.style.cursor = 'grabbing';
          this.hideHoverIndicators();
          return;
        }

        // Clicked ON the character -> freeze OrbitControls & animation immediately, capture pointer & apply active tool
        e.preventDefault();
        this.controls.enabled = false;
        this.isPainting = true;
        this.isCameraManipulating = false;
        this.activePointerId = e.pointerId;
        dom.style.cursor = 'crosshair';
        try {
          dom.setPointerCapture(e.pointerId);
        } catch {
          // Ignore synthetic events without active pointer capture
        }

        this.paintController.startStroke(hit.px, hit.py, settings, {
          partId: hit.partId,
          layer: hit.layer,
          face: hit.face,
          rect: hit.rect,
        });
        this.showHoverForHit(hit, this.getSettings());
      },
      { capture: true }
    );

    dom.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.isPainting) {
        if (this.activePointerId !== null && e.pointerId !== this.activePointerId) {
          return;
        }
        dom.style.cursor = 'crosshair';
        const settings = this.getSettings();
        const hit = this.raycastPaintTarget(e.clientX, e.clientY, false);
        if (hit) {
          if (this.paintController.isDrawing) {
            this.paintController.continueStroke(hit.px, hit.py, settings, {
              partId: hit.partId,
              layer: hit.layer,
              face: hit.face,
              rect: hit.rect,
            });
          }
          this.showHoverForHit(hit, settings);
        } else {
          // Ignore empty-space misses mid-stroke without rotating the camera
          this.hideHoverIndicators();
        }
        return;
      }

      if (e.buttons === 0 && !this.isCameraManipulating) {
        this.lastIdlePointer = { x: e.clientX, y: e.clientY };
        this.updateIdleHoverAndCursor(e.clientX, e.clientY);
      } else {
        this.lastIdlePointer = null;
        dom.style.cursor = 'grabbing';
        this.hideHoverIndicators();
      }
    });

    dom.addEventListener('pointerleave', () => {
      this.lastIdlePointer = null;
      if (!this.isPainting && !this.isCameraManipulating) {
        dom.style.cursor = 'grab';
        this.hideHoverIndicators();
      }
    });

    // Finalize stroke & always restore controls.enabled = true on window pointerup / pointercancel
    window.addEventListener('pointerup', this.handleWindowPointerEnd);
    window.addEventListener('pointercancel', this.handleWindowPointerEnd);
  }

  public handleResize(): void {
    const w = Math.max(200, this.container.clientWidth);
    const h = Math.max(200, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private startLoop(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    const tick = (now?: number) => {
      this.animFrameId = requestAnimationFrame(tick);

      const timestamp = typeof now === 'number' ? now : performance.now();
      const rawDelta =
        this.lastFrameTimestamp === null
          ? 0
          : (timestamp - this.lastFrameTimestamp) / 1000;
      this.lastFrameTimestamp = timestamp;

      this.stepAnimation(rawDelta);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    window.removeEventListener('pointerup', this.handleWindowPointerEnd);
    window.removeEventListener('pointercancel', this.handleWindowPointerEnd);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
