# Skinvil

> **NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**

**Skinvil** (`skinvil`) is a kid-friendly, cross-platform, **100% offline** 3D voxel character skin creator and `.mcpack` packager for **macOS**, **Windows**, and **Linux**, built with **Tauri v2** (Rust), **Vite + TypeScript**, and **Three.js**.

Designed for ages 6–12 with an instant **Romanian (`RO`) / English (`EN`)** bilingual interface, **Skinvil** makes zero network requests, loads zero external CDN assets, and collects zero telemetry.

---

## Features

- **Kid-Friendly Bilingual UI (`RO` / `EN`)**
  - Defaults to Romanian (`RO`) with a 1-click `RO | EN` toggle in the header, chunky high-contrast voxel buttons, and clear tooltips.
- **3D & Synced 2D Voxel Skin Studio**
  - Single-source-of-truth `64×64` RGBA canvas bound to a `THREE.CanvasTexture` (`NearestFilter`, `SRGBColorSpace`) with a **50-step Undo/Redo** stack (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`).
  - Live switching between **Classic "Steve" (4px arms)** and **Slim "Alex" (3px arms)**, plus **Stand**, **Walk**, **Action**, and **Spread / T-Pose** presets.
  - Trackpad-friendly **Paint Mode / Rotate Camera** toggle, 3D hover pixel + mirror-ghost cursor, collapsible synced `64×64` 2D pixel-grid panel, and an interactive **2D Mini-Mannequin** toggling all 6 Base and 6 Outer parts independently.
  - **Pencil (1px)**, **Eraser** (`alpha=0` on Outer layer; Base skin fill or transparent clear on Base layer), **UV-Face-Bounded Bucket Fill**, **Eyedropper**, **X-Axis Mirror Symmetry**, **Auto-Texture / Noise (±6% HSL lightness)**, **HSV Color Picker**, **12 Recent Colors**, and **4 Kid Palettes** (*Skin Tones*, *Knights & Metals*, *Vibrant Hoodies*, *Nature / Camo*).
- **6 Procedural Offline Starter Templates & Smart `.PNG` Import**
  - Start immediately offline with **Classic Explorer**, **Slim Adventurer**, **Royal Knight**, **Space Astronaut**, **Cyber Robot**, or **Blank Canvas**.
  - Drag-and-drop or browse external `.png` skins (including Skindex downloads): Rust (`image` crate) validates dimensions, automatically converts legacy `64×32` skins into modern `64×64` layout (mirroring Right Arm/Leg to Left Arm/Leg and clearing outer layers), supports `64×64` and `128×128` HD skins, and auto-detects **Slim (`Alex`)** vs **Classic (`Steve`)** geometry via pixel `(54, 20)` / `(108, 40)` alpha (`alpha == 0` → Slim) with manual UI override.
- **Local Wardrobe ("Vestiar") & Bedrock `.mcpack` / Java `.png` Exporter**
  - Saves characters locally in `<OS App Data>/skinvil/wardrobe/` (`.png` texture, `.preview.png` 2D body portrait, and JSON UUID metadata).
  - Edit, duplicate, rename, or delete saved skins, check multiple characters, and click **Forge `.mcpack`** to generate a ready-to-install Minecraft Bedrock skin pack (`manifest.json`, `skins.json`, `texts/languages.json`, `texts/en_US.lang`, and `<skin_slug>.png` written directly at the archive root) or **Export PNGs** for Minecraft Java Edition.

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

## Development & Building from Source

### Prerequisites
- **Node.js** 20+ and `npm`
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

# 3. Run Rust backend unit tests (64x32 conversion, HD detection, Wardrobe CRUD, .mcpack ZIP structure)
cargo test --manifest-path src-tauri/Cargo.toml

# 4. Launch Skinvil desktop app in development mode
npm run tauri dev

# 5. Build native production installers (.dmg, .msi/.exe, .AppImage/.deb)
npm run tauri build
```

---

## GitHub Actions CI & Cross-Platform Binary Builds

This repository includes two GitHub Actions workflows under `.github/workflows/`:

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

---

## License & Legal Disclaimer

**Skinvil** is free software licensed under the **GNU General Public License v3.0 (GPLv3)** — see [LICENSE](./LICENSE) for full terms.

**NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.**
