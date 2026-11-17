// SPDX-License-Identifier: GPL-3.0-only
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::{imageops, ImageFormat, Rgba, RgbaImage};
use serde::Serialize;
use std::io::Cursor;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessedSkinDto {
    /// Validated PNG (64x64 or 128x128) encoded as data URL (`data:image/png;base64,...`)
    pub png_data_url: String,
    /// Raw PNG bytes encoded in base64 (preserves 128x128 HD when applicable)
    pub png_base64: String,
    /// 64x64 PNG data URL for the 64x64 voxel editor canvas
    pub editor64_data_url: String,
    /// Crisp 64x128 2D front body + face preview PNG data URL
    pub preview_data_url: String,
    pub width: u32,
    pub height: u32,
    pub original_width: u32,
    pub original_height: u32,
    pub was_legacy_64x32: bool,
    /// `"slim"` or `"classic"`
    pub detected_geometry: String,
}

pub struct NormalizedSkin {
    pub image: RgbaImage,
    pub editor64: RgbaImage,
    pub original_width: u32,
    pub original_height: u32,
    pub was_legacy_64x32: bool,
    pub detected_geometry: String,
}

pub fn encode_rgba_png(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;
    Ok(buf)
}

pub fn png_bytes_to_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(bytes))
}

/// Copies a rectangle `(sx, sy, w, h)` to `(dx, dy)` flipped horizontally across X,
/// used when converting legacy `64x32` right arm/leg faces into `64x64` left arm/leg slots.
fn copy_rect_flipped_x(
    src: &RgbaImage,
    dst: &mut RgbaImage,
    sx: u32,
    sy: u32,
    w: u32,
    h: u32,
    dx: u32,
    dy: u32,
) {
    for row in 0..h {
        for col in 0..w {
            let p = *src.get_pixel(sx + col, sy + row);
            dst.put_pixel(dx + (w - 1 - col), dy + row, p);
        }
    }
}

/// Converts a legacy `64x32` Minecraft skin into modern `64x64` layout:
/// - Copies Head, Torso, Right Leg, and Right Arm base regions
/// - Mirrors Right Leg `[0,16]` -> Left Leg `[16,48]`
/// - Mirrors Right Arm `[40,16]` -> Left Arm `[32,48]`
/// - Clears all newly added Outer Layer slots (`Jacket`, `Right/Left Sleeves`, `Right/Left Pants`)
///   and clears opaque-matte Hat outer `[32..64, 0..16]` if it has no transparent pixels.
///
/// KEEP IN SYNC with `convertLegacy64x32Rgba` in `src/core/wardrobeClient.ts`.
pub fn convert_legacy_64x32_to_64x64(src: &RgbaImage) -> RgbaImage {
    let mut dst = RgbaImage::from_pixel(64, 64, Rgba([0, 0, 0, 0]));

    // Copy Base regions in y = 0..32:
    // 1. Head Base [0..32, 0..16]
    for y in 0..16 {
        for x in 0..32 {
            dst.put_pixel(x, y, *src.get_pixel(x, y));
        }
    }

    // Check Hat Outer [32..64, 0..16]: keep only if it actually uses transparency (< 128 alpha);
    // otherwise clear it (Mojang legacy transparency rule + clearing opaque matte backgrounds).
    let hat_has_transparency = (0..16).any(|y| (32..64).any(|x| src.get_pixel(x, y)[3] < 128));
    if hat_has_transparency {
        for y in 0..16 {
            for x in 32..64 {
                dst.put_pixel(x, y, *src.get_pixel(x, y));
            }
        }
    }

    // 2. Right Leg Base [0..16, 16..32], Torso Base [16..40, 16..32], Right Arm Base [40..56, 16..32]
    for y in 16..32 {
        for x in 0..56 {
            dst.put_pixel(x, y, *src.get_pixel(x, y));
        }
    }

    // 3. Copy Right Leg [0,16] -> Left Leg [16,48] (mirrored per cube face)
    copy_rect_flipped_x(src, &mut dst, 4, 16, 4, 4, 20, 48); // Top
    copy_rect_flipped_x(src, &mut dst, 8, 16, 4, 4, 24, 48); // Bottom
    copy_rect_flipped_x(src, &mut dst, 0, 20, 4, 12, 24, 52); // Right (outer) -> Left (outer)
    copy_rect_flipped_x(src, &mut dst, 4, 20, 4, 12, 20, 52); // Front -> Front
    copy_rect_flipped_x(src, &mut dst, 8, 20, 4, 12, 16, 52); // Left (inner) -> Right (inner)
    copy_rect_flipped_x(src, &mut dst, 12, 20, 4, 12, 28, 52); // Back -> Back

    // 4. Copy Right Arm [40,16] -> Left Arm [32,48] (mirrored per cube face)
    copy_rect_flipped_x(src, &mut dst, 44, 16, 4, 4, 36, 48); // Top
    copy_rect_flipped_x(src, &mut dst, 48, 16, 4, 4, 40, 48); // Bottom
    copy_rect_flipped_x(src, &mut dst, 40, 20, 4, 12, 40, 52); // Right (outer) -> Left (outer)
    copy_rect_flipped_x(src, &mut dst, 44, 20, 4, 12, 36, 52); // Front -> Front
    copy_rect_flipped_x(src, &mut dst, 48, 20, 4, 12, 32, 52); // Left (inner) -> Right (inner)
    copy_rect_flipped_x(src, &mut dst, 52, 20, 4, 12, 44, 52); // Back -> Back

    // Note: All y = 32..64 Outer Layer regions (Right Pants [0,32], Jacket [16,32],
    // Right Sleeve [40,32], Left Pants [0,48], Left Sleeve [48,48]) remain RGBA(0,0,0,0)!
    dst
}

/// Auto-detects Slim ("Alex") vs Classic ("Steve") geometry:
/// Checks pixel `(54, 20)` on `64x64` or `(108, 40)` on `128x128`.
/// `alpha == 0` -> `"slim"`, otherwise `"classic"`.
///
/// KEEP IN SYNC with `detectSkinGeometryFromRgba` in `src/core/wardrobeClient.ts`.
pub fn detect_skin_geometry(img: &RgbaImage) -> &'static str {
    let (w, h) = img.dimensions();
    if w == 128 && h == 128 {
        if img.get_pixel(108, 40)[3] == 0 {
            "slim"
        } else {
            "classic"
        }
    } else if w == 64 && h == 64 {
        if img.get_pixel(54, 20)[3] == 0 {
            "slim"
        } else {
            "classic"
        }
    } else {
        "classic"
    }
}

/// Validates and normalizes external PNG bytes (`64x32`, `64x64`, or `128x128`).
pub fn normalize_skin_png(bytes: &[u8]) -> Result<NormalizedSkin, String> {
    let dyn_img = image::load_from_memory(bytes)
        .map_err(|e| format!("Invalid PNG image file: {}", e))?;
    let rgba = dyn_img.to_rgba8();
    let (orig_w, orig_h) = rgba.dimensions();

    match (orig_w, orig_h) {
        (64, 32) => {
            let converted = convert_legacy_64x32_to_64x64(&rgba);
            // Legacy 64x32 format only existed prior to Slim Alex arms, check pixel (54, 20) anyway
            let geom = detect_skin_geometry(&converted).to_string();
            Ok(NormalizedSkin {
                editor64: converted.clone(),
                image: converted,
                original_width: 64,
                original_height: 32,
                was_legacy_64x32: true,
                detected_geometry: geom,
            })
        }
        (64, 64) => {
            let geom = detect_skin_geometry(&rgba).to_string();
            Ok(NormalizedSkin {
                editor64: rgba.clone(),
                image: rgba,
                original_width: 64,
                original_height: 64,
                was_legacy_64x32: false,
                detected_geometry: geom,
            })
        }
        (128, 128) => {
            let geom = detect_skin_geometry(&rgba).to_string();
            let editor64 = imageops::resize(&rgba, 64, 64, imageops::FilterType::Nearest);
            Ok(NormalizedSkin {
                image: rgba,
                editor64,
                original_width: 128,
                original_height: 128,
                was_legacy_64x32: false,
                detected_geometry: geom,
            })
        }
        _ => Err(format!(
            "Unsupported skin dimensions: {}×{}. Expected 64×64, 64×32, or 128×128 PNG.",
            orig_w, orig_h
        )),
    }
}

fn blit_region_alpha(
    src: &RgbaImage,
    dst: &mut RgbaImage,
    sx: u32,
    sy: u32,
    w: u32,
    h: u32,
    dx: u32,
    dy: u32,
    only_opaque_threshold: bool,
) {
    for row in 0..h {
        for col in 0..w {
            let sp = *src.get_pixel(sx + col, sy + row);
            if only_opaque_threshold {
                if sp[3] >= 128 {
                    dst.put_pixel(dx + col, dy + row, Rgba([sp[0], sp[1], sp[2], 255]));
                }
            } else if sp[3] > 0 {
                let dp = *dst.get_pixel(dx + col, dy + row);
                let sa = sp[3] as f32 / 255.0;
                let da = dp[3] as f32 / 255.0;
                let out_a = sa + da * (1.0 - sa);
                if out_a > 0.0 {
                    let r = ((sp[0] as f32 * sa + dp[0] as f32 * da * (1.0 - sa)) / out_a)
                        .round() as u8;
                    let g = ((sp[1] as f32 * sa + dp[1] as f32 * da * (1.0 - sa)) / out_a)
                        .round() as u8;
                    let b = ((sp[2] as f32 * sa + dp[2] as f32 * da * (1.0 - sa)) / out_a)
                        .round() as u8;
                    let a = (out_a * 255.0).round() as u8;
                    dst.put_pixel(dx + col, dy + row, Rgba([r, g, b, a]));
                }
            }
        }
    }
}

/// Renders a crisp 2D front-facing character preview (`64x128` RGBA PNG for 64x64 skins,
/// or `64x128` nearest-scaled from `32x64` for `128x128` HD skins) compositing Base + Outer layers.
pub fn render_2d_body_preview(skin: &RgbaImage, geometry: &str) -> RgbaImage {
    let scale = if skin.width() == 128 { 2 } else { 1 };
    let is_slim = geometry.eq_ignore_ascii_case("slim")
        || geometry.eq_ignore_ascii_case("geometry.humanoid.customSlim");

    let canvas_w = 16 * scale;
    let canvas_h = 32 * scale;
    let mut canvas = RgbaImage::from_pixel(canvas_w, canvas_h, Rgba([0, 0, 0, 0]));

    let arm_w = if is_slim { 3 * scale } else { 4 * scale };
    let right_arm_dx = if is_slim { 1 * scale } else { 0 };
    let left_arm_dx = 12 * scale;

    // 1. Base Layers
    // Head Front [8, 8, 8, 8] -> (4, 0)
    blit_region_alpha(skin, &mut canvas, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 4 * scale, 0, false);
    // Torso Front [20, 20, 8, 12] -> (4, 8)
    blit_region_alpha(skin, &mut canvas, 20 * scale, 20 * scale, 8 * scale, 12 * scale, 4 * scale, 8 * scale, false);
    // Right Arm Front [44, 20, armW, 12]
    blit_region_alpha(skin, &mut canvas, 44 * scale, 20 * scale, arm_w, 12 * scale, right_arm_dx, 8 * scale, false);
    // Left Arm Front [36, 52, armW, 12]
    blit_region_alpha(skin, &mut canvas, 36 * scale, 52 * scale, arm_w, 12 * scale, left_arm_dx, 8 * scale, false);
    // Right Leg Front [4, 20, 4, 12] -> (4, 20)
    blit_region_alpha(skin, &mut canvas, 4 * scale, 20 * scale, 4 * scale, 12 * scale, 4 * scale, 20 * scale, false);
    // Left Leg Front [20, 52, 4, 12] -> (8, 20)
    blit_region_alpha(skin, &mut canvas, 20 * scale, 52 * scale, 4 * scale, 12 * scale, 8 * scale, 20 * scale, false);

    // 2. Outer Layers (alphaTest >= 0.5 equivalent)
    // Hat Front [40, 8, 8, 8]
    blit_region_alpha(skin, &mut canvas, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 4 * scale, 0, true);
    // Jacket Front [20, 36, 8, 12]
    blit_region_alpha(skin, &mut canvas, 20 * scale, 36 * scale, 8 * scale, 12 * scale, 4 * scale, 8 * scale, true);
    // Right Sleeve Front [44, 36, armW, 12]
    blit_region_alpha(skin, &mut canvas, 44 * scale, 36 * scale, arm_w, 12 * scale, right_arm_dx, 8 * scale, true);
    // Left Sleeve Front [52, 52, armW, 12]
    blit_region_alpha(skin, &mut canvas, 52 * scale, 52 * scale, arm_w, 12 * scale, left_arm_dx, 8 * scale, true);
    // Right Pants Front [4, 36, 4, 12]
    blit_region_alpha(skin, &mut canvas, 4 * scale, 36 * scale, 4 * scale, 12 * scale, 4 * scale, 20 * scale, true);
    // Left Pants Front [4, 52, 4, 12]
    blit_region_alpha(skin, &mut canvas, 4 * scale, 52 * scale, 4 * scale, 12 * scale, 8 * scale, 20 * scale, true);

    imageops::resize(&canvas, 64, 128, imageops::FilterType::Nearest)
}

pub fn build_processed_skin_dto(bytes: &[u8]) -> Result<ProcessedSkinDto, String> {
    let norm = normalize_skin_png(bytes)?;
    let (w, h) = norm.image.dimensions();
    let full_png = encode_rgba_png(&norm.image)?;
    let editor64_png = encode_rgba_png(&norm.editor64)?;
    let preview_img = render_2d_body_preview(&norm.image, &norm.detected_geometry);
    let preview_png = encode_rgba_png(&preview_img)?;

    Ok(ProcessedSkinDto {
        png_data_url: png_bytes_to_data_url(&full_png),
        png_base64: BASE64.encode(&full_png),
        editor64_data_url: png_bytes_to_data_url(&editor64_png),
        preview_data_url: png_bytes_to_data_url(&preview_png),
        width: w,
        height: h,
        original_width: norm.original_width,
        original_height: norm.original_height,
        was_legacy_64x32: norm.was_legacy_64x32,
        detected_geometry: norm.detected_geometry,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_legacy_64x32_and_clears_outer_layers() {
        let mut legacy = RgbaImage::from_pixel(64, 32, Rgba([0, 0, 0, 0]));
        // Paint Head Front, Right Arm outer shoulder (40, 20), Right Leg front (4, 20)
        legacy.put_pixel(10, 10, Rgba([240, 190, 150, 255]));
        legacy.put_pixel(40, 20, Rgba([255, 0, 0, 255])); // Right Arm Right face col 0
        legacy.put_pixel(54, 20, Rgba([0, 0, 255, 255])); // Right Arm Back -> Classic!
        legacy.put_pixel(4, 20, Rgba([0, 255, 0, 255])); // Right Leg Front col 0

        // Fill Hat [32..64, 0..16] with solid opaque black matte (no transparency)
        for y in 0..16 {
            for x in 32..64 {
                legacy.put_pixel(x, y, Rgba([10, 10, 10, 255]));
            }
        }

        let raw = encode_rgba_png(&legacy).unwrap();
        let res = normalize_skin_png(&raw).unwrap();

        assert_eq!(res.image.dimensions(), (64, 64));
        assert!(res.was_legacy_64x32);
        assert_eq!(res.detected_geometry, "classic");

        // Right Arm Right (40,20) col 0 -> Left Arm Left (40,52) flipped X -> col 3 = x=43, y=52
        assert_eq!(*res.image.get_pixel(43, 52), Rgba([255, 0, 0, 255]));
        // Right Leg Front (4,20) col 0 -> Left Leg Front (20,52) flipped X -> col 3 = x=23, y=52
        assert_eq!(*res.image.get_pixel(23, 52), Rgba([0, 255, 0, 255]));

        // Outer layers cleared!
        assert_eq!(res.image.get_pixel(40, 10)[3], 0); // Opaque matte hat cleared
        assert_eq!(res.image.get_pixel(20, 36)[3], 0); // Jacket outer transparent
        assert_eq!(res.image.get_pixel(44, 36)[3], 0); // Right sleeve outer transparent
        assert_eq!(res.image.get_pixel(52, 52)[3], 0); // Left sleeve outer transparent
        assert_eq!(res.image.get_pixel(4, 36)[3], 0); // Right pants outer transparent
        assert_eq!(res.image.get_pixel(4, 52)[3], 0); // Left pants outer transparent
    }

    #[test]
    fn detects_slim_vs_classic_on_64x64_and_128x128() {
        let mut slim64 = RgbaImage::from_pixel(64, 64, Rgba([0, 0, 0, 0]));
        slim64.put_pixel(53, 20, Rgba([200, 100, 50, 255]));
        // (54, 20) remains alpha == 0 -> Slim!
        assert_eq!(detect_skin_geometry(&slim64), "slim");

        slim64.put_pixel(54, 20, Rgba([200, 100, 50, 255]));
        assert_eq!(detect_skin_geometry(&slim64), "classic");

        let mut hd128 = RgbaImage::from_pixel(128, 128, Rgba([0, 0, 0, 0]));
        assert_eq!(detect_skin_geometry(&hd128), "slim");
        hd128.put_pixel(108, 40, Rgba([10, 20, 30, 255]));
        assert_eq!(detect_skin_geometry(&hd128), "classic");
    }

    #[test]
    fn rejects_invalid_dimensions() {
        let bad = RgbaImage::from_pixel(100, 100, Rgba([255, 0, 0, 255]));
        let raw = encode_rgba_png(&bad).unwrap();
        assert!(normalize_skin_png(&raw).is_err());
    }
}
