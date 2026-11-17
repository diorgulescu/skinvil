// SPDX-License-Identifier: GPL-3.0-only
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { base64ToUint8Array, uint8ArrayToBase64 } from './bytes';
import type { ModelType } from './uvMap';

export interface ProcessedSkinResult {
  pngDataUrl: string;
  pngBase64: string;
  editor64DataUrl: string;
  previewDataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  wasLegacy64x32: boolean;
  detectedGeometry: ModelType;
}

export interface WardrobeEntry {
  id: string;
  name: string;
  geometry: ModelType;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  skinDataUrl: string;
  editor64DataUrl: string;
  previewDataUrl: string;
}

export interface McpackSkinPayload {
  name: string;
  geometry: ModelType;
  wardrobeId?: string;
  pngBase64?: string;
}

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Converts any display string (including Romanian diacritics) into a clean lowercase ASCII slug.
 *
 * KEEP IN SYNC with `sanitize_ascii_slug` in `src-tauri/src/mcpack.rs`.
 */
export function sanitizeAsciiSlug(input: string, fallback = 'skin'): string {
  const map: Record<string, string> = {
    ă: 'a', Ă: 'a', â: 'a', Â: 'a',
    î: 'i', Î: 'i',
    ș: 's', Ș: 's', ş: 's', Ş: 's',
    ț: 't', Ț: 't', ţ: 't', Ţ: 't',
  };
  let out = '';
  let prevUnderscore = false;
  for (const ch of input) {
    const rep = map[ch] ?? (/[a-zA-Z0-9]/.test(ch) ? ch.toLowerCase() : '');
    if (rep) {
      out += rep;
      prevUnderscore = false;
    } else if (out.length > 0 && !prevUnderscore) {
      out += '_';
      prevUnderscore = true;
    }
  }
  out = out.replace(/_+$/, '');
  return out || fallback;
}

/**
 * Pure TypeScript auto-detector matching the Rust backend rule:
 * Pixel (54, 20) on 64x64 or (108, 40) on 128x128: alpha === 0 -> 'slim', else 'classic'.
 *
 * KEEP IN SYNC with `detect_skin_geometry` in `src-tauri/src/skin_io.rs`.
 */
export function detectSkinGeometryFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number
): ModelType {
  if (width === 128 && height === 128) {
    const a = data[(40 * 128 + 108) * 4 + 3];
    return a === 0 ? 'slim' : 'classic';
  }
  if (width === 64 && height === 64) {
    const a = data[(20 * 64 + 54) * 4 + 3];
    return a === 0 ? 'slim' : 'classic';
  }
  return 'classic';
}

/**
 * Pure TypeScript legacy 64x32 -> modern 64x64 converter (mirrors Right Arm/Leg to Left Arm/Leg
 * and clears Outer Layer regions), matching the Rust `image` crate implementation.
 *
 * KEEP IN SYNC with `convert_legacy_64x32_to_64x64` in `src-tauri/src/skin_io.rs`.
 */
export function convertLegacy64x32Rgba(src: Uint8ClampedArray): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(64 * 64 * 4);

  const copyPx = (sx: number, sy: number, dx: number, dy: number) => {
    const si = (sy * 64 + sx) * 4;
    const di = (dy * 64 + dx) * 4;
    dst[di] = src[si];
    dst[di + 1] = src[si + 1];
    dst[di + 2] = src[si + 2];
    dst[di + 3] = src[si + 3];
  };

  // Head Base [0..32, 0..16]
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) copyPx(x, y, x, y);
  }

  // Hat Outer [32..64, 0..16] only if it contains transparent pixels
  let hatHasAlpha = false;
  for (let y = 0; y < 16 && !hatHasAlpha; y++) {
    for (let x = 32; x < 64; x++) {
      if (src[(y * 64 + x) * 4 + 3] < 128) {
        hatHasAlpha = true;
        break;
      }
    }
  }
  if (hatHasAlpha) {
    for (let y = 0; y < 16; y++) {
      for (let x = 32; x < 64; x++) copyPx(x, y, x, y);
    }
  }

  // Base Torso, Right Leg, Right Arm in y = 16..32
  for (let y = 16; y < 32; y++) {
    for (let x = 0; x < 56; x++) copyPx(x, y, x, y);
  }

  const copyFlippedX = (
    sx: number,
    sy: number,
    w: number,
    h: number,
    dx: number,
    dy: number
  ) => {
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        copyPx(sx + c, sy + r, dx + (w - 1 - c), dy + r);
      }
    }
  };

  // Right Leg -> Left Leg
  copyFlippedX(4, 16, 4, 4, 20, 48);
  copyFlippedX(8, 16, 4, 4, 24, 48);
  copyFlippedX(0, 20, 4, 12, 24, 52);
  copyFlippedX(4, 20, 4, 12, 20, 52);
  copyFlippedX(8, 20, 4, 12, 16, 52);
  copyFlippedX(12, 20, 4, 12, 28, 52);

  // Right Arm -> Left Arm
  copyFlippedX(44, 16, 4, 4, 36, 48);
  copyFlippedX(48, 16, 4, 4, 40, 48);
  copyFlippedX(40, 20, 4, 12, 40, 52);
  copyFlippedX(44, 20, 4, 12, 36, 52);
  copyFlippedX(48, 20, 4, 12, 32, 52);
  copyFlippedX(52, 20, 4, 12, 44, 52);

  return dst;
}

/**
 * Renders a crisp 64x128 2D front body + face preview data URL from a skin canvas/image.
 */
export function renderPreviewDataUrlFromCanvas(
  skinSource: HTMLCanvasElement | HTMLImageElement,
  geometry: ModelType
): string {
  const w = skinSource instanceof HTMLImageElement ? skinSource.naturalWidth : skinSource.width;
  const s = w === 128 ? 2 : 1;
  const slim = geometry === 'slim';
  const armW = (slim ? 3 : 4) * s;
  const rArmDx = slim ? 1 * s : 0;

  const mini = document.createElement('canvas');
  mini.width = 16 * s;
  mini.height = 32 * s;
  const mCtx = mini.getContext('2d')!;
  mCtx.imageSmoothingEnabled = false;

  // Base front faces
  mCtx.drawImage(skinSource, 8 * s, 8 * s, 8 * s, 8 * s, 4 * s, 0, 8 * s, 8 * s);
  mCtx.drawImage(skinSource, 20 * s, 20 * s, 8 * s, 12 * s, 4 * s, 8 * s, 8 * s, 12 * s);
  mCtx.drawImage(skinSource, 44 * s, 20 * s, armW, 12 * s, rArmDx, 8 * s, armW, 12 * s);
  mCtx.drawImage(skinSource, 36 * s, 52 * s, armW, 12 * s, 12 * s, 8 * s, armW, 12 * s);
  mCtx.drawImage(skinSource, 4 * s, 20 * s, 4 * s, 12 * s, 4 * s, 20 * s, 4 * s, 12 * s);
  mCtx.drawImage(skinSource, 20 * s, 52 * s, 4 * s, 12 * s, 8 * s, 20 * s, 4 * s, 12 * s);

  // Outer front overlays
  mCtx.drawImage(skinSource, 40 * s, 8 * s, 8 * s, 8 * s, 4 * s, 0, 8 * s, 8 * s);
  mCtx.drawImage(skinSource, 20 * s, 36 * s, 8 * s, 12 * s, 4 * s, 8 * s, 8 * s, 12 * s);
  mCtx.drawImage(skinSource, 44 * s, 36 * s, armW, 12 * s, rArmDx, 8 * s, armW, 12 * s);
  mCtx.drawImage(skinSource, 52 * s, 52 * s, armW, 12 * s, 12 * s, 8 * s, armW, 12 * s);
  mCtx.drawImage(skinSource, 4 * s, 36 * s, 4 * s, 12 * s, 4 * s, 20 * s, 4 * s, 12 * s);
  mCtx.drawImage(skinSource, 4 * s, 52 * s, 4 * s, 12 * s, 8 * s, 20 * s, 4 * s, 12 * s);

  const out = document.createElement('canvas');
  out.width = 64;
  out.height = 128;
  const oCtx = out.getContext('2d')!;
  oCtx.imageSmoothingEnabled = false;
  oCtx.drawImage(mini, 0, 0, 64, 128);
  return out.toDataURL('image/png');
}

async function processImportedPngBrowserFallback(
  bytes: Uint8Array
): Promise<ProcessedSkinResult> {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Invalid PNG image file'));
      img.src = url;
    });

    const ow = img.naturalWidth;
    const oh = img.naturalHeight;
    if (
      !(
        (ow === 64 && oh === 32) ||
        (ow === 64 && oh === 64) ||
        (ow === 128 && oh === 128)
      )
    ) {
      throw new Error(
        `Unsupported skin dimensions: ${ow}×${oh}. Expected 64×64, 64×32, or 128×128 PNG.`
      );
    }

    const fullCanvas = document.createElement('canvas');
    const wasLegacy = ow === 64 && oh === 32;
    fullCanvas.width = wasLegacy ? 64 : ow;
    fullCanvas.height = wasLegacy ? 64 : oh;
    const fCtx = fullCanvas.getContext('2d', { willReadFrequently: true })!;
    fCtx.imageSmoothingEnabled = false;

    if (wasLegacy) {
      const tmp = document.createElement('canvas');
      tmp.width = 64;
      tmp.height = 32;
      const tCtx = tmp.getContext('2d')!;
      tCtx.drawImage(img, 0, 0);
      const srcData = tCtx.getImageData(0, 0, 64, 32).data;
      const converted = convertLegacy64x32Rgba(srcData);
      fCtx.putImageData(new ImageData(new Uint8ClampedArray(converted), 64, 64), 0, 0);
    } else {
      fCtx.drawImage(img, 0, 0);
    }

    const fullImgData = fCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height);
    const detectedGeometry = detectSkinGeometryFromRgba(
      fullImgData.data,
      fullCanvas.width,
      fullCanvas.height
    );

    const editorCanvas = document.createElement('canvas');
    editorCanvas.width = 64;
    editorCanvas.height = 64;
    const eCtx = editorCanvas.getContext('2d')!;
    eCtx.imageSmoothingEnabled = false;
    eCtx.drawImage(fullCanvas, 0, 0, 64, 64);

    const pngDataUrl = fullCanvas.toDataURL('image/png');
    const pngBase64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
    const editor64DataUrl = editorCanvas.toDataURL('image/png');
    const previewDataUrl = renderPreviewDataUrlFromCanvas(fullCanvas, detectedGeometry);

    return {
      pngDataUrl,
      pngBase64,
      editor64DataUrl,
      previewDataUrl,
      width: fullCanvas.width,
      height: fullCanvas.height,
      originalWidth: ow,
      originalHeight: oh,
      wasLegacy64x32: wasLegacy,
      detectedGeometry,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Minimal CRC32 + Stored ZIP generator for standalone browser fallback `.mcpack` downloads
function crc32Bytes(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createRootZipArchive(
  files: Array<{ name: string; data: Uint8Array }>
): Uint8Array {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32Bytes(f.data);
    const size = f.data.length;

    const lh = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(lh);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // Stored (0)
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    new Uint8Array(lh, 30).set(nameBytes);

    const ch = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(ch);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    new Uint8Array(ch, 46).set(nameBytes);

    localParts.push(new Uint8Array(lh), f.data);
    centralParts.push(new Uint8Array(ch));
    offset += 30 + nameBytes.length + size;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const p of [...localParts, ...centralParts, new Uint8Array(eocd)]) {
    out.set(p, cursor);
    cursor += p.length;
  }
  return out;
}

const LS_KEY = 'skinvil_wardrobe_v1';

function readBrowserWardrobe(): WardrobeEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WardrobeEntry[];
  } catch {
    return [];
  }
}

function writeBrowserWardrobe(items: WardrobeEntry[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // Ignore quota errors in headless mode
  }
}

export class WardrobeBackendClient {
  public async processPngBytes(bytes: Uint8Array): Promise<ProcessedSkinResult> {
    if (isTauriDesktop()) {
      const dto = await invoke<ProcessedSkinResult>('process_imported_png', {
        bytes: Array.from(bytes),
      });
      return {
        ...dto,
        detectedGeometry: dto.detectedGeometry === 'slim' ? 'slim' : 'classic',
      };
    }
    return processImportedPngBrowserFallback(bytes);
  }

  public async pickAndImportSkinDialog(): Promise<{
    result: ProcessedSkinResult;
    suggestedName: string;
  } | null> {
    if (isTauriDesktop()) {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Minecraft Skin PNG', extensions: ['png'] }],
      });
      if (!selected || typeof selected !== 'string') return null;
      const dto = await invoke<ProcessedSkinResult>('import_skin_from_path', {
        path: selected,
      });
      const baseName =
        selected
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.png$/i, '') ?? 'Imported Skin';
      return {
        result: {
          ...dto,
          detectedGeometry: dto.detectedGeometry === 'slim' ? 'slim' : 'classic',
        },
        suggestedName: baseName,
      };
    }
    return null;
  }

  public async importFromPath(path: string): Promise<{
    result: ProcessedSkinResult;
    suggestedName: string;
  }> {
    const dto = await invoke<ProcessedSkinResult>('import_skin_from_path', { path });
    const baseName =
      path
        .split(/[\\/]/)
        .pop()
        ?.replace(/\.png$/i, '') ?? 'Imported Skin';
    return {
      result: {
        ...dto,
        detectedGeometry: dto.detectedGeometry === 'slim' ? 'slim' : 'classic',
      },
      suggestedName: baseName,
    };
  }

  public async listWardrobe(): Promise<WardrobeEntry[]> {
    if (isTauriDesktop()) {
      return await invoke<WardrobeEntry[]>('wardrobe_list');
    }
    return readBrowserWardrobe().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async saveToWardrobe(params: {
    id?: string | null;
    name: string;
    geometry: ModelType;
    pngBytes: Uint8Array;
  }): Promise<WardrobeEntry> {
    const pngBase64 = uint8ArrayToBase64(params.pngBytes);
    if (isTauriDesktop()) {
      return await invoke<WardrobeEntry>('wardrobe_save', {
        id: params.id ?? null,
        name: params.name,
        geometry: params.geometry,
        pngBase64,
      });
    }

    const processed = await processImportedPngBrowserFallback(params.pngBytes);
    const items = readBrowserWardrobe();
    const now = Date.now();
    const existingIdx = params.id ? items.findIndex((i) => i.id === params.id) : -1;
    const entry: WardrobeEntry = {
      id: existingIdx >= 0 ? items[existingIdx].id : crypto.randomUUID(),
      name: params.name.trim() || 'Skinvil Hero',
      geometry: params.geometry,
      width: processed.width,
      height: processed.height,
      createdAt: existingIdx >= 0 ? items[existingIdx].createdAt : now,
      updatedAt: now,
      skinDataUrl: processed.pngDataUrl,
      editor64DataUrl: processed.editor64DataUrl,
      previewDataUrl: processed.previewDataUrl,
    };
    if (existingIdx >= 0) {
      items[existingIdx] = entry;
    } else {
      items.unshift(entry);
    }
    writeBrowserWardrobe(items);
    return entry;
  }

  public async updateWardrobeEntry(
    id: string,
    name: string,
    geometry?: ModelType
  ): Promise<WardrobeEntry> {
    if (isTauriDesktop()) {
      return await invoke<WardrobeEntry>('wardrobe_update', {
        id,
        name,
        geometry: geometry ?? null,
      });
    }
    const items = readBrowserWardrobe();
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) throw new Error('Entry not found');
    items[idx] = {
      ...items[idx],
      name: name.trim() || items[idx].name,
      geometry: geometry ?? items[idx].geometry,
      updatedAt: Date.now(),
    };
    writeBrowserWardrobe(items);
    return items[idx];
  }

  public async duplicateWardrobeEntry(id: string): Promise<WardrobeEntry> {
    if (isTauriDesktop()) {
      return await invoke<WardrobeEntry>('wardrobe_duplicate', {
        id,
        copyName: null,
      });
    }
    const items = readBrowserWardrobe();
    const orig = items.find((i) => i.id === id);
    if (!orig) throw new Error('Entry not found');
    const now = Date.now();
    const copy: WardrobeEntry = {
      ...orig,
      id: crypto.randomUUID(),
      name: `${orig.name} (2)`,
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(copy);
    writeBrowserWardrobe(items);
    return copy;
  }

  public async deleteWardrobeEntry(id: string): Promise<void> {
    if (isTauriDesktop()) {
      await invoke<void>('wardrobe_delete', { id });
      return;
    }
    const next = readBrowserWardrobe().filter((i) => i.id !== id);
    writeBrowserWardrobe(next);
  }

  public async forgeMcpackWithDialog(
    packName: string,
    skins: McpackSkinPayload[]
  ): Promise<string | null> {
    const slug = sanitizeAsciiSlug(packName, 'skinvil_pack');
    const defaultFilename = `${slug}.mcpack`;

    if (isTauriDesktop()) {
      const destPath = await saveDialog({
        defaultPath: defaultFilename,
        filters: [{ name: 'Minecraft Bedrock Skin Pack (.mcpack)', extensions: ['mcpack'] }],
      });
      if (!destPath) return null;
      return await invoke<string>('forge_mcpack', {
        packName,
        skins,
        destinationPath: destPath,
      });
    }

    // Browser download fallback (builds identical Bedrock format_version:2 root ZIP!)
    const enc = new TextEncoder();
    const headerUuid = crypto.randomUUID();
    const moduleUuid = crypto.randomUUID();
    const manifest = {
      format_version: 2,
      header: { name: packName || 'Skinvil Pack', uuid: headerUuid, version: [1, 0, 0] },
      modules: [{ type: 'skin_pack', uuid: moduleUuid, version: [1, 0, 0] }],
    };

    const used = new Set<string>();
    const skinEntries: Array<Record<string, string>> = [];
    const zipFiles: Array<{ name: string; data: Uint8Array }> = [];
    const langLines = [`skinpack.${slug}=${packName || 'Skinvil Pack'}`];
    const wardrobeItems = readBrowserWardrobe();

    for (let i = 0; i < skins.length; i++) {
      const s = skins[i];
      const baseSlug = sanitizeAsciiSlug(s.name, `skin_${i + 1}`);
      let uSlug = baseSlug;
      let n = 2;
      while (used.has(uSlug)) {
        uSlug = `${baseSlug}_${n++}`;
      }
      used.add(uSlug);

      const b64 =
        s.pngBase64 ??
        wardrobeItems.find((w) => w.id === s.wardrobeId)?.skinDataUrl ??
        '';
      const pngData = base64ToUint8Array(b64);

      skinEntries.push({
        localization_name: uSlug,
        geometry:
          s.geometry === 'slim'
            ? 'geometry.humanoid.customSlim'
            : 'geometry.humanoid.custom',
        texture: `${uSlug}.png`,
        type: 'free',
      });
      langLines.push(`skin.${slug}.${uSlug}=${s.name}`);
      zipFiles.push({ name: `${uSlug}.png`, data: pngData });
    }

    const skinsJson = {
      serialize_name: slug,
      localization_name: slug,
      skins: skinEntries,
    };

    const allFiles = [
      { name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) },
      { name: 'skins.json', data: enc.encode(JSON.stringify(skinsJson, null, 2)) },
      { name: 'texts/languages.json', data: enc.encode(JSON.stringify(['en_US'], null, 2)) },
      { name: 'texts/en_US.lang', data: enc.encode(`${langLines.join('\n')}\n`) },
      ...zipFiles,
    ];

    const zipBytes = createRootZipArchive(allFiles);
    const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return defaultFilename;
  }

  public async exportStandalonePngsWithDialog(
    skins: McpackSkinPayload[]
  ): Promise<string[] | null> {
    if (isTauriDesktop()) {
      if (skins.length === 1 && skins[0].pngBase64) {
        const slug = sanitizeAsciiSlug(skins[0].name, 'skinvil_skin');
        const destFile = await saveDialog({
          defaultPath: `${slug}.png`,
          filters: [{ name: 'PNG Skin (Java / Bedrock)', extensions: ['png'] }],
        });
        if (!destFile) return null;
        const saved = await invoke<string>('save_skin_png_to_path', {
          destinationPath: destFile,
          bytes: Array.from(base64ToUint8Array(skins[0].pngBase64)),
        });
        return [saved];
      }

      const dir = await openDialog({
        directory: true,
        multiple: false,
      });
      if (!dir || typeof dir !== 'string') return null;
      return await invoke<string[]>('export_skin_pngs', {
        skins,
        destinationDir: dir,
      });
    }

    // Browser download fallback
    const wardrobeItems = readBrowserWardrobe();
    const names: string[] = [];
    for (const s of skins) {
      const slug = sanitizeAsciiSlug(s.name, 'skin');
      const b64 =
        s.pngBase64 ??
        wardrobeItems.find((w) => w.id === s.wardrobeId)?.skinDataUrl ??
        '';
      const bytes = base64ToUint8Array(b64);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      names.push(`${slug}.png`);
    }
    return names;
  }
}
