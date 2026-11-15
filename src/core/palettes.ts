// SPDX-License-Identifier: GPL-3.0-only

export interface RGBAColor {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  a: number; // 0..255
}

export interface HSVColor {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export interface HSLColor {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export type PaletteCategoryId = 'skinTones' | 'knightsMetals' | 'vibrantHoodies' | 'natureCamo';

export interface PaletteCategory {
  id: PaletteCategoryId;
  colors: readonly string[];
}

export const KID_PALETTES: readonly PaletteCategory[] = [
  {
    id: 'skinTones',
    colors: [
      '#FFE7D6',
      '#FAD2B8',
      '#F3C39C',
      '#E6AC82',
      '#D69264',
      '#C47D4E',
      '#A8643B',
      '#8C4E2B',
      '#6E3B1F',
      '#4F2915',
      '#F4978E',
      '#D96B6B',
    ],
  },
  {
    id: 'knightsMetals',
    colors: [
      '#F1F5F9',
      '#CBD5E1',
      '#94A3B8',
      '#64748B',
      '#334155',
      '#1E293B',
      '#FBBF24',
      '#D97706',
      '#B45309',
      '#38BDF8',
      '#EF4444',
      '#2563EB',
    ],
  },
  {
    id: 'vibrantHoodies',
    colors: [
      '#3B82F6',
      '#06B6D4',
      '#10B981',
      '#84CC16',
      '#FACC15',
      '#F97316',
      '#F43F5E',
      '#EC4899',
      '#A855F7',
      '#6366F1',
      '#F8FAFC',
      '#18181B',
    ],
  },
  {
    id: 'natureCamo',
    colors: [
      '#A3E635',
      '#4ADE80',
      '#22C55E',
      '#15803D',
      '#14532D',
      '#65A30D',
      '#4D7C0F',
      '#A16207',
      '#78350F',
      '#D6D3D1',
      '#78716C',
      '#0EA5E9',
    ],
  },
];

export const DEFAULT_RECENT_COLORS: readonly string[] = [
  '#38BDF8',
  '#F43F5E',
  '#FBBF24',
  '#34D399',
  '#A855F7',
  '#F97316',
  '#F3C39C',
  '#8C4E2B',
  '#E2E8F0',
  '#475569',
  '#1E293B',
  '#FFFFFF',
];

export function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function normalizeHex(hex: string): string | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = cleaned[0] + cleaned[0];
    const g = cleaned[1] + cleaned[1];
    const b = cleaned[2] + cleaned[2];
    return `#${(r + g + b).toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toUpperCase()}`;
  }
  return null;
}

export function hexToRgba(hex: string, alpha = 255): RGBAColor {
  const norm = normalizeHex(hex) ?? '#38BDF8';
  const r = parseInt(norm.slice(1, 3), 16);
  const g = parseInt(norm.slice(3, 5), 16);
  const b = parseInt(norm.slice(5, 7), 16);
  return { r, g, b, a: clampByte(alpha) };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (v: number) => clampByte(v).toString(16).padStart(2, '0').toUpperCase();
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function rgbToHsv(r: number, g: number, b: number): HSVColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / d) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / d + 2);
    } else {
      h = 60 * ((rn - gn) / d + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const vv = Math.max(0, Math.min(1, v));

  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 60) {
    r1 = c;
    g1 = x;
  } else if (hh < 120) {
    r1 = x;
    g1 = c;
  } else if (hh < 180) {
    g1 = c;
    b1 = x;
  } else if (hh < 240) {
    g1 = x;
    b1 = c;
  } else if (hh < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  };
}

export function rgbToHsl(r: number, g: number, b: number): HSLColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = 60 * (((gn - bn) / d) % 6);
  } else if (max === gn) {
    h = 60 * ((bn - rn) / d + 2);
  } else {
    h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;

  return { h, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(1, s));
  const ll = Math.max(0, Math.min(1, l));

  if (ss === 0) {
    const v = clampByte(ll * 255);
    return { r: v, g: v, b: v };
  }

  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 60) {
    r1 = c;
    g1 = x;
  } else if (hh < 120) {
    r1 = x;
    g1 = c;
  } else if (hh < 180) {
    g1 = c;
    b1 = x;
  } else if (hh < 240) {
    g1 = x;
    b1 = c;
  } else if (hh < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: clampByte((r1 + m) * 255),
    g: clampByte((g1 + m) * 255),
    b: clampByte((b1 + m) * 255),
  };
}

/**
 * Applies +/- 6% subtle HSL lightness variation (delta in [-0.06, +0.06])
 * for the "Auto-Texture / Noise" painting modifier.
 */
export function applyAutoNoiseLightness(
  color: RGBAColor,
  randomUnit = Math.random()
): RGBAColor {
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
  const delta = (randomUnit * 2 - 1) * 0.06; // [-0.06, +0.06]
  const nextL = Math.max(0.02, Math.min(0.98, l + delta));
  const rgb = hslToRgb(h, s, nextL);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: color.a };
}
