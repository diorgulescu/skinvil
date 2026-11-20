<p align="left">
  <img src="./app-icon.svg" width="84" height="84" alt="Skinvil Logo" />
</p>

# Skinvil

> **NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**

**Skinvil** (`skinvil`) is a kid-friendly, cross-platform, **100% offline** 3D voxel character skin creator and `.mcpack` studio for **macOS**, **Windows**, and **Linux**, built with **Tauri v2** (Rust), **Vite + TypeScript**, and **Three.js**.

Designed for ages 6–12 with an instant **Romanian (`RO`) / English (`EN`)** bilingual interface, **Skinvil** makes zero network requests, loads zero external CDN assets, and collects zero telemetry.

- **Official Project Homepage:** [https://diorgulescu.github.io/skinvil/](https://diorgulescu.github.io/skinvil/)
- **Latest Desktop Downloads:** [GitHub Releases](https://github.com/diorgulescu/skinvil/releases)

---

## Features

- **Kid-Friendly Bilingual UI (`RO` / `EN`)**
  - Defaults to Romanian (`RO`) with a 1-click `RO | EN` toggle in the header, chunky high-contrast voxel buttons, clear tooltips, and a built-in offline **`GPLv3`** About & License viewer.
- **3D & Synced 2D Voxel Skin Studio**
  - Single-source-of-truth `64×64` RGBA canvas bound to a `THREE.CanvasTexture` (`NearestFilter`, `SRGBColorSpace`) with custom per-face UV clamping shaders (preventing MSAA texel bleed on transparent Outer layers) and a **50-step Undo/Redo** stack (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, `Cmd/Ctrl+Y`).
  - **Active Paint Layer (`[L]`) & Interactive 2D Mini-Mannequin**: Dedicated **Base Body** vs **3D Outer** layer switch (auto-enabling Outer visibility when selected) paired with a clickable 2D mannequin that toggles all 6 Base parts and 6 Outer parts independently.
  - **Live Classic / Slim Geometry & Real-Time Animated Poses**: Instant switching between **Classic "Steve" (4px arms)** and **Slim "Alex" (3px arms)**, plus anatomical `THREE.Group` joint pivots driving real-time **Stand** (gentle idle breathing), **Walk** (authentic voxel stride with body bob and head look), **Action** (hero sprint with forward torso lean), and strictly static **Spread / T-Pose** (motionless for inner-limb pixel work). Pose motion **freezes automatically mid-stroke** while painting on the character and includes a compact **Play / Pause (`⏸ / ▶`)** button next to the pose bar.
  - **Zero-Mode-Switching 3D Desktop Controls**: Left-click directly on the character to paint, left-drag empty background or right-drag anywhere (even over the model) to orbit, middle-drag to pan, and scroll wheel to zoom — with dynamic `crosshair` / `grab` / `grabbing` cursors, 3D hover pixel + mirror-ghost preview, and a collapsible synced `64×64` 2D UV grid editor.
  - **Voxel Paint Tools & Curated Palettes**: **Pencil (1px)**, **Eraser** (`alpha = 0` on Outer layer; Base skin-tone fill or transparent clear on Base layer), **UV-Face-Bounded Bucket Fill**, **Eyedropper**, **X-Axis Mirror Symmetry**, **Auto-Texture / Noise (±6% HSL lightness)**, **HSV Color Picker**, **12 Recent Colors**, and **4 Kid Palettes** (*Skin Tones*, *Knights & Metals*, *Vibrant Hoodies*, *Nature / Camo*).
- **6 Procedural Offline Starter Templates & Smart `.PNG` Import**
  - Start immediately offline with **Classic Explorer**, **Slim Adventurer**, **Royal Knight**, **Space Astronaut**, **Cyber Robot**, or **Blank Canvas**.
  - Drag-and-drop or browse external `.png` skins (including Skindex downloads): Rust (`image` crate) validates dimensions, automatically upgrades legacy `64×32` skins into modern `64×64` layout (mirroring Right Arm/Leg to Left Arm/Leg and clearing outer layers), supports `64×64` and `128×128` HD skins (preserving unmodified `128×128` textures on export), and auto-detects **Slim (`Alex`)** vs **Classic (`Steve`)** geometry via pixel `(54, 20)` / `(108, 40)` alpha (`alpha == 0` → Slim) with manual UI override.
- **Local Wardrobe ("Vestiar") & Bedrock `.mcpack` / Java `.png` Exporter**
  - Saves characters locally in `<OS App Data>/skinvil/wardrobe/` (`.png` texture, `.preview.png` 2D body portrait, and JSON UUID metadata).
  - Edit, duplicate, rename, or delete saved skins, check multiple characters, and click **Forge `.mcpack`** to generate a ready-to-install Minecraft Bedrock skin pack (`manifest.json`, `skins.json`, `texts/languages.json`, `texts/en_US.lang`, and `<skin_slug>.png` written directly at the archive root) or **Export PNGs** for Minecraft Java Edition.

---

## Controls & Keyboard Shortcuts

| Input | Action |
| :--- | :--- |
| **Left-Click / Drag on Character** | Paint with active tool (freezes camera & pose animation mid-stroke; records 1 Undo step) |
| **Left-Drag on Empty Background** | Orbit 3D camera around character |
| **Right-Drag Anywhere** | Orbit 3D camera (even when cursor starts directly over the character) |
| **Middle-Drag Anywhere** | Pan 3D camera target |
| **Mouse Wheel / Trackpad Scroll** | Zoom in / out |
| **`⏸` / `▶` Button** | Freeze / resume real-time pose animation at the exact current stride phase |
| **`B`** | Pencil tool (`1px`) |
| **`E`** | Eraser tool |
| **`G`** | UV-Face-Bounded Bucket Fill |
| **`I`** | Eyedropper color picker |
| **`L`** | Toggle Active Paint Layer (**Base Body** ↔ **3D Outer**) |
| **`M`** | Toggle X-Axis Mirror Symmetry |
| **`N`** | Toggle Auto-Texture / Noise (`±6%` lightness variation) |
| **`Cmd/Ctrl + Z`** | Undo (up to 50 steps) |
| **`Cmd/Ctrl + Shift + Z`** / **`Cmd/Ctrl + Y`** | Redo |
| **`Cmd/Ctrl + S`** | Save active character to Local Wardrobe |
| **`Esc`** | Close open Wardrobe or About / License modal |

---

## Parent & Kid Installation Notes (Unsigned Open-Source Builds)

Because **Skinvil** is free, community-built open-source software distributed without paid Apple/Microsoft code-signing certificates, your operating system may show a first-launch security prompt:

### macOS (`.dmg` — Apple Silicon & Universal)
1. Open the downloaded `.dmg` and drag **Skinvil.app** into your **Applications** folder.
2. If macOS displays *"Skinvil is damaged and can't be opened"* or *"Apple could not verify Skinvil"*, open **Terminal** and run:
   ```bash
   xattr -cr /Applications/Skinvil.app
   ```
   *(Alternatively, go to **System Settings → Privacy & Security** and click **Open Anyway**.)*
3. Launch **Skinvil** normally from Launchpad or Applications!

### Windows (`.msi` / `-setup.exe`)
1. Double-click the installer.
2. If **Windows Defender SmartScreen** displays *"Windows protected your PC"*, click **More info** and then click **Run anyway**.

### Linux (`.AppImage` / `.deb`)
- **AppImage**:
  ```bash
  chmod +x Skinvil_*.AppImage
  ./Skinvil_*.AppImage
  ```
- **Debian / Ubuntu (`.deb`)**:
  ```bash
  sudo apt install ./skinvil_*.deb
  ```

---

## Using Your Skins in Minecraft

- **Minecraft Bedrock Edition (Windows, iPad/iPhone, Android):**
  Double-click (or tap/share) the exported `.mcpack` file — Minecraft opens automatically and imports your entire skin pack under **Dressing Room → Classic Skins → Owned**!
- **Minecraft Java Edition (macOS, Windows, Linux):**
  Click **Export PNGs (Java)** (or header **PNG**), open **Minecraft Launcher → Skins → New Skin**, select **Wide (Classic)** or **Slim**, and browse to your exported `.png` file.

---

## Project Structure

```text
skinvil/
├── app-icon.svg                 # Canonical SVG brand mark used across UI, favicon, and docs
├── LICENSE                      # Full verbatim GNU General Public License v3.0
├── site/                        # Static EN/RO project homepage & screenshots deployed to GitHub Pages
├── index.html                   # Offline entry HTML
├── src/
│   ├── core/                    # 64×64 RGBA engine, Minecraft UV spec, paint tools, palettes, templates, IPC bridge
│   ├── viewport/skinStage3D.ts  # Three.js voxel rig, anatomical joint animations, per-face UV clamp shader, raycast controls
│   ├── ui/                      # App shell, synced 2D UV editor, HSV color dock, mini-mannequin, Wardrobe & GPLv3 modals
│   ├── i18n/translations.ts     # Bilingual RO / EN strings & reactive locale store
│   ├── styles/main.css          # Dark voxel studio theme
│   └── __tests__/               # Vitest unit & JSDOM interaction suites
└── src-tauri/
    ├── src/                     # Rust backend: PNG validation, 64×32 → 64×64 upgrade, Wardrobe CRUD, .mcpack ZIP builder
    └── tauri.conf.json          # Offline CSP, window config, bundle & GPL-3.0-only metadata
```

---

## Development & Building from Source

### Prerequisites
- **Node.js** 22.12+ and `npm`
- **Rust** stable toolchain (`rustup`, `cargo` 1.77.2+)
- **Linux only** system libraries for Tauri v2:
  ```bash
  sudo apt-get update
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
  ```

### Commands
```bash
# 1. Install frontend dependencies
npm install

# 2. Run frontend unit tests (Vitest)
npm test

# 3. Typecheck and build frontend production bundle
npm run build

# 4. Run Rust backend unit tests (64x32 conversion, HD detection, Wardrobe CRUD, .mcpack ZIP structure)
cargo test --manifest-path src-tauri/Cargo.toml

# 5. Launch Skinvil desktop app in development mode
npm run tauri dev

# 6. Build native production installers (.dmg, .msi/.exe, .AppImage/.deb)
npm run tauri build
```

---

## GitHub Actions CI, Releases & GitHub Pages

This repository includes three GitHub Actions workflows under `.github/workflows/`:

1. **Continuous Binary Builds ([`.github/workflows/build.yml`](./.github/workflows/build.yml))**
   - Runs automatically on pushes to `main` / `master`, pull requests, or manually via **Actions → Run workflow**.
   - Runs both the Vitest frontend suite (`npm test`) and Rust backend suite (`cargo test`), then compiles downloadable binaries and installers attached as **GitHub Actions Artifacts**:
     - `skinvil-linux-x64`: `skinvil`, `.AppImage`, `.deb`, `.rpm`
     - `skinvil-macos-universal`: Universal `.dmg` (native Apple Silicon + Intel)
     - `skinvil-windows-x64`: `skinvil.exe`, `.msi`, `-setup.exe`
2. **Automated GitHub Releases ([`.github/workflows/release.yml`](./.github/workflows/release.yml))**
   - Triggered when pushing a version tag matching `v*` (or manually via **Run workflow**):
     ```bash
     git tag v0.1.0
     git push origin v0.1.0
     ```
   - Publishes a GitHub Release with native installers attached for **macOS** (Universal & Apple Silicon `.dmg`), **Windows** (`.msi` & `-setup.exe`), and **Linux** (`.AppImage`, `.deb`, `.rpm`).
3. **GitHub Pages Homepage Deployment ([`.github/workflows/pages.yml`](./.github/workflows/pages.yml))**
   - Automatically publishes `./site` (project overview, bilingual `EN | RO` toggle, and studio screenshots) to `https://diorgulescu.github.io/skinvil/` on pushes to `main` (enable **Settings → Pages → Build and deployment → Source: GitHub Actions** once in the GitHub repository settings).

---

## License & Legal Notices

**Copyright (C) 2026 Skinvil Contributors**  
`SPDX-License-Identifier: GPL-3.0-only`

This program is free software: you can redistribute it and/or modify it under the terms of **version 3 of the GNU General Public License** as published by the Free Software Foundation (`GPL-3.0-only`).

This program is distributed in the hope that it will be useful, but **WITHOUT ANY WARRANTY**; without even the implied warranty of **MERCHANTABILITY** or **FITNESS FOR A PARTICULAR PURPOSE**. See the **GNU General Public License** for more details.

- **Full License Text**: See [LICENSE](./LICENSE) in the root of this repository, or click the **`GPLv3`** badge in the top-right header inside the **Skinvil** app to view the copyright notice, warranty disclaimer, and complete verbatim GNU GPLv3 text offline at any time.
- **Third-Party Open-Source Libraries**: Skinvil links exclusively with permissive, GPLv3-compatible open-source packages (`three` under MIT; `tauri`, `tauri-plugin-dialog`, `image`, `zip`, `serde`, `serde_json`, `uuid`, and `base64` under MIT / Apache-2.0).

**NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**
