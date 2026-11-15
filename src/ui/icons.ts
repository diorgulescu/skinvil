// SPDX-License-Identifier: GPL-3.0-only
import appIconUrl from '../../app-icon.svg';

/** Canonical Skinvil application icon URL resolved from `/app-icon.svg`. */
export const APP_ICON_URL: string = appIconUrl;

/**
 * Crisp blocky pixel-inspired inline SVG icons (zero external icon fonts or CDNs).
 */
export const ICONS = {
  /** Skinvil Official App Icon (`app-icon.svg`) rendered as an offline crisp image element */
  appLogo: `<img class="brand-logo-img" src="${appIconUrl}" alt="Skinvil" draggable="false" />`,

  pencil: `<svg viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="15" y="3" width="6" height="6" fill="#F43F5E"/>
    <rect x="12" y="6" width="6" height="6" fill="#FBBF24"/>
    <rect x="9" y="9" width="6" height="6" fill="#FBBF24"/>
    <rect x="6" y="12" width="6" height="6" fill="#F59E0B"/>
    <rect x="4" y="16" width="4" height="4" fill="#FDE68A"/>
    <rect x="3" y="19" width="2" height="2" fill="#1E293B"/>
  </svg>`,

  eraser: `<svg viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="10" y="4" width="9" height="9" fill="#FB7185"/>
    <rect x="5" y="9" width="9" height="9" fill="#F8FAFC"/>
    <rect x="4" y="19" width="16" height="2" fill="#94A3B8"/>
  </svg>`,

  bucket: `<svg viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="8" y="3" width="6" height="2" fill="#CBD5E1"/>
    <rect x="6" y="5" width="2" height="4" fill="#CBD5E1"/>
    <rect x="14" y="5" width="2" height="4" fill="#CBD5E1"/>
    <rect x="5" y="9" width="12" height="9" fill="#94A3B8"/>
    <rect x="6" y="9" width="10" height="4" fill="#38BDF8"/>
    <rect x="17" y="11" width="3" height="6" fill="#38BDF8"/>
    <rect x="18" y="17" width="2" height="4" fill="#0EA5E9"/>
  </svg>`,

  eyedropper: `<svg viewBox="0 0 24 24" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="15" y="3" width="6" height="6" fill="#A855F7"/>
    <rect x="12" y="7" width="5" height="5" fill="#E2E8F0"/>
    <rect x="9" y="10" width="5" height="5" fill="#CBD5E1"/>
    <rect x="6" y="13" width="5" height="5" fill="#38BDF8"/>
    <rect x="4" y="17" width="3" height="3" fill="#38BDF8"/>
  </svg>`,

  mirror: `<svg viewBox="0 0 24 24" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="11" y="2" width="2" height="20" fill="#FBBF24"/>
    <rect x="3" y="6" width="6" height="12" fill="#38BDF8"/>
    <rect x="15" y="6" width="6" height="12" fill="#7DD3FC" opacity="0.85"/>
  </svg>`,

  noise: `<svg viewBox="0 0 24 24" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="3" y="3" width="6" height="6" fill="#34D399"/>
    <rect x="9" y="3" width="6" height="6" fill="#10B981"/>
    <rect x="15" y="3" width="6" height="6" fill="#6EE7B7"/>
    <rect x="3" y="9" width="6" height="6" fill="#059669"/>
    <rect x="9" y="9" width="6" height="6" fill="#6EE7B7"/>
    <rect x="15" y="9" width="6" height="6" fill="#10B981"/>
    <rect x="3" y="15" width="6" height="6" fill="#6EE7B7"/>
    <rect x="9" y="15" width="6" height="6" fill="#059669"/>
    <rect x="15" y="15" width="6" height="6" fill="#34D399"/>
  </svg>`,

  undo: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M9 7L4 12L9 17"/>
    <path d="M5 12H15C18 12 20 14 20 17V18"/>
  </svg>`,

  redo: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">
    <path d="M15 7L20 12L15 17"/>
    <path d="M19 12H9C6 12 4 14 4 17V18"/>
  </svg>`,

  resetView: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true">
    <rect x="7" y="7" width="10" height="10"/>
    <path d="M12 2V5M12 19V22M2 12H5M19 12H22"/>
  </svg>`,

  pauseMotion: `<svg viewBox="0 0 24 24" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="5" y="4" width="5" height="16" fill="currentColor"/>
    <rect x="14" y="4" width="5" height="16" fill="currentColor"/>
  </svg>`,

  playMotion: `<svg viewBox="0 0 24 24" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true">
    <path d="M6 4L20 12L6 20Z" fill="currentColor"/>
  </svg>`,

  grid2D: `<svg viewBox="0 0 24 24" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4"/>
    <rect x="3" y="9" width="18" height="2" fill="currentColor"/>
    <rect x="3" y="15" width="18" height="2" fill="currentColor"/>
    <rect x="9" y="3" width="2" height="18" fill="currentColor"/>
    <rect x="15" y="3" width="2" height="18" fill="currentColor"/>
  </svg>`,

  templates: `<svg viewBox="0 0 24 24" width="19" height="19" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="8" y="2" width="8" height="7" fill="#FBBF24"/>
    <rect x="7" y="10" width="10" height="8" fill="#38BDF8"/>
    <rect x="4" y="10" width="3" height="7" fill="#38BDF8"/>
    <rect x="17" y="10" width="3" height="7" fill="#38BDF8"/>
    <rect x="8" y="18" width="4" height="5" fill="#94A3B8"/>
    <rect x="12" y="18" width="4" height="5" fill="#64748B"/>
  </svg>`,

  wardrobe: `<svg viewBox="0 0 24 24" width="19" height="19" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" fill="#A16207"/>
    <rect x="5" y="5" width="6" height="14" fill="#D97706"/>
    <rect x="13" y="5" width="6" height="14" fill="#D97706"/>
    <rect x="9" y="11" width="1.8" height="3" fill="#FDE68A"/>
    <rect x="13.2" y="11" width="1.8" height="3" fill="#FDE68A"/>
  </svg>`,

  saveFloppy: `<svg viewBox="0 0 24 24" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" fill="#38BDF8"/>
    <rect x="7" y="3" width="10" height="6" fill="#F8FAFC"/>
    <rect x="13" y="4" width="2" height="4" fill="#1E293B"/>
    <rect x="6" y="12" width="12" height="9" fill="#E2E8F0"/>
  </svg>`,

  anvilForge: `<svg viewBox="160 140 704 704" width="19" height="19" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="352" y="256" width="96" height="96" fill="#22D3EE"/>
    <rect x="464" y="208" width="96" height="144" fill="#34D399"/>
    <rect x="576" y="256" width="96" height="96" fill="#FDE68A"/>
    <rect x="176" y="400" width="96" height="80" fill="#CBD5E1"/>
    <rect x="272" y="368" width="544" height="144" fill="#F8FAFC"/>
    <rect x="272" y="480" width="544" height="32" fill="#94A3B8"/>
    <rect x="384" y="512" width="288" height="144" fill="#CBD5E1"/>
    <rect x="304" y="656" width="448" height="64" fill="#E2E8F0"/>
    <rect x="240" y="720" width="576" height="96" fill="#F8FAFC"/>
  </svg>`,

  upload: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" aria-hidden="true">
    <path d="M12 15V4M12 4L7 9M12 4L17 9"/>
    <path d="M4 16V20H20V16"/>
  </svg>`,

  download: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" aria-hidden="true">
    <path d="M12 4V15M12 15L7 10M12 15L17 10"/>
    <path d="M4 16V20H20V16"/>
  </svg>`,

  duplicate: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12"/>
    <path d="M16 8V4H4V16H8"/>
  </svg>`,

  rename: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true">
    <path d="M4 20H8L19 9L15 5L4 16V20Z"/>
  </svg>`,

  trash: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" aria-hidden="true">
    <path d="M4 7H20M9 7V4H15V7M6 7L7 20H17L18 7"/>
  </svg>`,
} as const;
