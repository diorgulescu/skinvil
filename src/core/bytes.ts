// SPDX-License-Identifier: GPL-3.0-only

/**
 * Shared byte↔base64 helpers used by both the Tauri IPC layer and the
 * browser fallback paths.
 */

export function base64ToUint8Array(b64OrDataUrl: string): Uint8Array {
  const clean = b64OrDataUrl.replace(/^data:image\/png;base64,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}
