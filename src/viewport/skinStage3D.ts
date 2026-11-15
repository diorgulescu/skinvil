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
export type ViewportInteractionMode = 'paint' | 'rotate';

export interface HoverInfo {
  partId: PartId;
  layer: LayerKind;
  face: FaceName;
  px: number;
  py: number;
}

interface JointTransform {
  pos: [number, number, number];
  rot: [number, number, number];
}

type RigTargetPose = Record<
  'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg',
  JointTransform
>;

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
  private interactionMode: ViewportInteractionMode = 'paint';
  private spacePressed = false;
  private isPaintingStroke = false;
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
    container.appendChild(this.renderer.domElement);

    // 3. OrbitControls (supporting right-drag orbit ALWAYS, plus left-drag on sky or in Rotate Mode)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 16.2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
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
    this.applyPoseImmediate(this.computePoseTargets(this.pose, this.model));

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

    // Head & Hat pivot at neck (0, 24, 0), mesh centered at (0, +4, 0)
    attachPart('head', 'head', [0, 4, 0]);
    attachPart('hat', 'head', [0, 4, 0]);

    // Torso & Jacket pivot at center (0, 18, 0), mesh at (0, 0, 0)
    attachPart('torso', 'torso', [0, 0, 0]);
    attachPart('jacket', 'torso', [0, 0, 0]);

    // Arms pivot near shoulder y=22, mesh centered at (0, -4, 0) -> spans y: +2..-10 relative to shoulder
    attachPart('rightArm', 'rightArm', [0, -4, 0]);
    attachPart('rightSleeve', 'rightArm', [0, -4, 0]);

    attachPart('leftArm', 'leftArm', [0, -4, 0]);
    attachPart('leftSleeve', 'leftArm', [0, -4, 0]);

    // Legs pivot at hip y=12, mesh centered at (0, -6, 0) -> spans y: 0..-12 relative to hip
    attachPart('rightLeg', 'rightLeg', [0, -6, 0]);
    attachPart('rightPants', 'rightLeg', [0, -6, 0]);

    attachPart('leftLeg', 'leftLeg', [0, -6, 0]);
    attachPart('leftPants', 'leftLeg', [0, -6, 0]);
  }

  private computePoseTargets(pose: PoseId, model: ModelType): RigTargetPose {
    const armX = model === 'slim' ? 5.5 : 6.0;

    switch (pose) {
      case 'stand':
        return {
          head: { pos: [0, 24, 0], rot: [0, 0, 0] },
          torso: { pos: [0, 18, 0], rot: [0, 0, 0] },
          rightArm: { pos: [-armX, 22, 0], rot: [0, 0, 0] },
          leftArm: { pos: [armX, 22, 0], rot: [0, 0, 0] },
          rightLeg: { pos: [-2, 12, 0], rot: [0, 0, 0] },
          leftLeg: { pos: [2, 12, 0], rot: [0, 0, 0] },
        };

      case 'walk':
        return {
          head: { pos: [0, 24, 0], rot: [0.04, 0.14, 0] },
          torso: { pos: [0, 18, 0], rot: [0, 0.06, 0] },
          rightArm: { pos: [-armX, 22, 0], rot: [-0.58, 0, -0.05] },
          leftArm: { pos: [armX, 22, 0], rot: [0.58, 0, 0.05] },
          rightLeg: { pos: [-2, 12, 0], rot: [0.52, 0, 0] },
          leftLeg: { pos: [2, 12, 0], rot: [-0.52, 0, 0] },
        };

      case 'action':
        return {
          head: { pos: [0, 24, 0], rot: [-0.1, -0.22, 0] },
          torso: { pos: [0, 18, 0], rot: [0.06, -0.18, 0] },
          rightArm: { pos: [-armX, 22, 0], rot: [-2.05, 0.15, -0.26] },
          leftArm: { pos: [armX, 22, 0], rot: [0.55, -0.1, 0.28] },
          rightLeg: { pos: [-2.2, 12, 0], rot: [0.42, 0, -0.12] },
          leftLeg: { pos: [2.2, 12, 0], rot: [-0.46, 0, 0.12] },
        };

      case 'spread':
        // Spread / Exploded T-Pose: separates head, arms, and legs so every inner surface is easy to paint!
        return {
          head: { pos: [0, 26.6, 0], rot: [0, 0, 0] },
          torso: { pos: [0, 18, 0], rot: [0, 0, 0] },
          rightArm: { pos: [-(armX + 2.4), 22.4, 0], rot: [0, 0, -Math.PI * 0.46] },
          leftArm: { pos: [armX + 2.4, 22.4, 0], rot: [0, 0, Math.PI * 0.46] },
          rightLeg: { pos: [-3.6, 10.4, 0], rot: [0, 0, -0.3] },
          leftLeg: { pos: [3.6, 10.4, 0], rot: [0, 0, 0.3] },
        };
    }
  }

  private applyPoseImmediate(targets: RigTargetPose): void {
    (Object.keys(targets) as Array<keyof RigTargetPose>).forEach((k) => {
      const g = this.joints[k];
      const t = targets[k];
      g.position.set(t.pos[0], t.pos[1], t.pos[2]);
      g.rotation.set(t.rot[0], t.rot[1], t.rot[2]);
    });
  }

  public setModelType(next: ModelType): void {
    if (this.model === next) return;
    this.model = next;
    this.buildCharacterMeshes();
  }

  public getModelType(): ModelType {
    return this.model;
  }

  public setPose(next: PoseId): void {
    this.pose = next;
  }

  public getPose(): PoseId {
    return this.pose;
  }

  public setInteractionMode(mode: ViewportInteractionMode): void {
    this.interactionMode = mode;
    this.renderer.domElement.style.cursor =
      mode === 'rotate' ? 'grab' : 'crosshair';
    if (mode === 'rotate') {
      this.primaryHoverGroup.visible = false;
      this.mirrorHoverGroup.visible = false;
    }
  }

  public getInteractionMode(): ViewportInteractionMode {
    return this.interactionMode;
  }

  public resetView(): void {
    this.camera.position.set(14, 21, 52);
    this.controls.target.set(0, 16.2, 0);
    this.controls.update();
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
  ): {
    partId: PartId;
    layer: LayerKind;
    face: FaceName;
    rect: PixelRect;
    px: number;
    py: number;
  } | null {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;

    this.pointerNDC.x = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - bounds.top) / bounds.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const meshes = this.getVisibleMeshes();
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;

    const specs = getSkinPartsSpec(this.model);
    const settings = this.getSettings();
    const targetLayer: LayerKind = settings.targetLayer ?? 'base';
    const isEraser = settings.tool === 'eraser' && !forEyedropper;

    const candidates: Array<{
      partId: PartId;
      layer: LayerKind;
      face: FaceName;
      rect: PixelRect;
      px: number;
      py: number;
    }> = [];

    for (const hit of hits) {
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

    // 1. Eyedropper: sample the front-most visible pixel with alpha > 0
    if (forEyedropper) {
      return (
        candidates.find((c) => this.engine.getPixel(c.px, c.py).a > 0) ?? null
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

    // 4. Fallback only if the counterpart part on targetLayer is explicitly hidden in the Mannequin
    const fallback = candidates[0];
    const counterpart = specs[fallback.partId].counterpartId;
    if (!this.visibility[counterpart]) {
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

  private updateHoverAt(clientX: number, clientY: number): void {
    const settings = this.getSettings();
    const inRotateOnly = this.interactionMode === 'rotate' || this.spacePressed;
    if (inRotateOnly) {
      this.primaryHoverGroup.visible = false;
      this.mirrorHoverGroup.visible = false;
      this.onHoverChange?.(null);
      return;
    }

    const hit = this.raycastPaintTarget(
      clientX,
      clientY,
      settings.tool === 'eyedropper'
    );
    if (!hit) {
      this.primaryHoverGroup.visible = false;
      this.mirrorHoverGroup.visible = false;
      this.onHoverChange?.(null);
      return;
    }

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

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    // Use capture phase so we intercept mesh paint clicks BEFORE OrbitControls starts rotating!
    dom.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        const settings = this.getSettings();
        const rotateOverride =
          this.interactionMode === 'rotate' ||
          this.spacePressed ||
          e.altKey ||
          e.button !== 0;

        if (rotateOverride) {
          this.controls.enabled = true;
          return;
        }

        const hit = this.raycastPaintTarget(
          e.clientX,
          e.clientY,
          settings.tool === 'eyedropper'
        );

        // If user clicked empty background sky, let OrbitControls smoothly rotate camera!
        if (!hit) {
          this.controls.enabled = true;
          return;
        }

        // Hit a visible character mesh -> Paint!
        e.stopImmediatePropagation();
        e.preventDefault();
        this.controls.enabled = false;
        this.isPaintingStroke = true;
        this.activePointerId = e.pointerId;
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
        this.updateHoverAt(e.clientX, e.clientY);
      },
      { capture: true }
    );

    dom.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.isPaintingStroke && e.pointerId === this.activePointerId) {
        const settings = this.getSettings();
        const hit = this.raycastPaintTarget(
          e.clientX,
          e.clientY,
          settings.tool === 'eyedropper'
        );
        if (hit) {
          this.paintController.continueStroke(hit.px, hit.py, settings, {
            partId: hit.partId,
            layer: hit.layer,
            face: hit.face,
            rect: hit.rect,
          });
        }
      }
      this.updateHoverAt(e.clientX, e.clientY);
    });

    const finishPointer = (e: PointerEvent) => {
      if (!this.isPaintingStroke || e.pointerId !== this.activePointerId) return;
      this.isPaintingStroke = false;
      this.activePointerId = null;
      this.paintController.endStroke(this.getSettings());
      this.controls.enabled = true;
      try {
        if (dom.hasPointerCapture(e.pointerId)) {
          dom.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
    };

    dom.addEventListener('pointerup', finishPointer);
    dom.addEventListener('pointercancel', finishPointer);
    dom.addEventListener('pointerleave', () => {
      if (!this.isPaintingStroke) {
        this.primaryHoverGroup.visible = false;
        this.mirrorHoverGroup.visible = false;
        this.onHoverChange?.(null);
      }
    });

    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        this.spacePressed = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
      }
    });
  }

  public handleResize(): void {
    const w = Math.max(200, this.container.clientWidth);
    const h = Math.max(200, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private startLoop(): void {
    const tick = () => {
      this.animFrameId = requestAnimationFrame(tick);

      // Smoothly interpolate joint transforms toward active pose target
      const targets = this.computePoseTargets(this.pose, this.model);
      const alpha = 0.22;
      (Object.keys(targets) as Array<keyof RigTargetPose>).forEach((k) => {
        const g = this.joints[k];
        const t = targets[k];
        g.position.x += (t.pos[0] - g.position.x) * alpha;
        g.position.y += (t.pos[1] - g.position.y) * alpha;
        g.position.z += (t.pos[2] - g.position.z) * alpha;
        g.rotation.x += (t.rot[0] - g.rotation.x) * alpha;
        g.rotation.y += (t.rot[1] - g.rotation.y) * alpha;
        g.rotation.z += (t.rot[2] - g.rotation.z) * alpha;
      });

      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  public dispose(): void {
    cancelAnimationFrame(this.animFrameId);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
