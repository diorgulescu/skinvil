# AGENTS.md — Skinvil

## Project
Skinvil is a 100% offline, kid-friendly 3D voxel Minecraft skin creator and `.mcpack`
packager. Stack: **Tauri v2 (Rust backend) + Vite + TypeScript + Three.js (frontend)**.
Bilingual UI (Romanian default / English). No network requests, no external CDNs.

## Prerequisites
- Node.js 20+ and `npm`
- Rust stable (`rustup`, cargo 1.77.2+)
- Linux only: `libwebkit2gtk-4.1-dev` and other Tauri v2 system libs (see README)

## Commands
```bash
npm install                              # install frontend deps
npm test                                 # Vitest frontend unit tests
npx tsc --noEmit                         # TypeScript strict type-check
cargo test --manifest-path src-tauri/Cargo.toml   # Rust backend unit tests
npm run tauri dev                        # launch desktop app in dev mode
npm run build                            # production frontend bundle (tsc + vite build)
npm run tauri build                      # native installers (.dmg/.msi/.AppImage/.deb)
```

## Code layout
```
src/
├── main.ts               # entry point
├── core/                 # pure logic (no DOM): uvMap, skinCanvas, paintTools, palettes,
│                         #   starterSkins, wardrobeClient (IPC + browser fallback), bytes
├── ui/                   # DOM components: appShell, editor2D, colorPanel, dragDrop,
│                         #   mannequinWidget, wardrobeModal, icons
├── viewport/             # Three.js 3D stage (skinStage3D)
├── i18n/                 # RO/EN translations
└── __tests__/            # Vitest suite
src-tauri/src/
├── lib.rs                # Tauri commands
├── skin_io.rs            # PNG validation / 64x32→64x64 / geometry detection
├── wardrobe.rs           # local wardrobe CRUD (filesystem)
└── mcpack.rs             # Bedrock .mcpack ZIP builder
```

## Conventions
- All source files start with `// SPDX-License-Identifier: GPL-3.0-only`.
- TypeScript strict mode is on (`noUnusedLocals`, `noUnusedParameters`).
- The 64×64 `SkinCanvasEngine` canvas is the single source of truth for both the
  3D `CanvasTexture` and the 2D editor.
- **Duplicated logic warning:** `convertLegacy64x32Rgba`, `detectSkinGeometryFromRgba`,
  and `sanitizeAsciiSlug` exist in BOTH `src/core/wardrobeClient.ts` (browser fallback)
  and the Rust backend (`skin_io.rs` / `mcpack.rs`). Any change to one MUST be mirrored
  in the other. Cross-reference comments mark these.
- Tests must pass before committing: `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml`.

## Git
- Branch: `main`. Commit message format ends with the Mistral Vibe co-author trailer.
- Do not commit `node_modules/`, `dist/`, or `src-tauri/target/` (all gitignored).
