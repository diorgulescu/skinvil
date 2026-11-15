// SPDX-License-Identifier: GPL-3.0-only
use crate::skin_io::{
    encode_rgba_png, normalize_skin_png, png_bytes_to_data_url, render_2d_body_preview,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WardrobeMetadata {
    pub id: String,
    pub name: String,
    /// `"classic"` or `"slim"`
    pub geometry: String,
    pub width: u32,
    pub height: u32,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WardrobeEntryDto {
    pub id: String,
    pub name: String,
    pub geometry: String,
    pub width: u32,
    pub height: u32,
    pub created_at: u64,
    pub updated_at: u64,
    pub skin_data_url: String,
    pub editor64_data_url: String,
    pub preview_data_url: String,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn sanitize_uuid_id(id: &str) -> Result<String, String> {
    Uuid::parse_str(id.trim())
        .map(|u| u.to_string())
        .map_err(|_| "Invalid wardrobe entry UUID".to_string())
}

fn normalize_geometry_tag(geom: &str) -> String {
    if geom.eq_ignore_ascii_case("slim")
        || geom.eq_ignore_ascii_case("geometry.humanoid.customSlim")
    {
        "slim".to_string()
    } else {
        "classic".to_string()
    }
}

/// Resolves `<OS App Data>/skinvil/wardrobe/` and ensures the directory exists.
pub fn resolve_wardrobe_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .data_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("Failed to resolve OS app data directory: {}", e))?;
    let dir = base.join("skinvil").join("wardrobe");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create wardrobe directory: {}", e))?;
    Ok(dir)
}

pub fn load_entry_from_dir(dir: &Path, id: &str) -> Result<WardrobeEntryDto, String> {
    let clean_id = sanitize_uuid_id(id)?;
    let meta_path = dir.join(format!("{}.json", clean_id));
    let png_path = dir.join(format!("{}.png", clean_id));
    let preview_path = dir.join(format!("{}.preview.png", clean_id));

    let meta_raw = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read wardrobe metadata {}: {}", clean_id, e))?;
    let meta: WardrobeMetadata = serde_json::from_str(&meta_raw)
        .map_err(|e| format!("Corrupt wardrobe metadata {}: {}", clean_id, e))?;

    let png_bytes = fs::read(&png_path)
        .map_err(|e| format!("Failed to read wardrobe skin PNG {}: {}", clean_id, e))?;
    let norm = normalize_skin_png(&png_bytes)?;
    let editor64_bytes = encode_rgba_png(&norm.editor64)?;

    let preview_bytes = if preview_path.exists() {
        fs::read(&preview_path).unwrap_or_else(|_| {
            let img = render_2d_body_preview(&norm.image, &meta.geometry);
            encode_rgba_png(&img).unwrap_or_default()
        })
    } else {
        let img = render_2d_body_preview(&norm.image, &meta.geometry);
        let bytes = encode_rgba_png(&img)?;
        let _ = fs::write(&preview_path, &bytes);
        bytes
    };

    Ok(WardrobeEntryDto {
        id: meta.id,
        name: meta.name,
        geometry: meta.geometry,
        width: meta.width,
        height: meta.height,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        skin_data_url: png_bytes_to_data_url(&png_bytes),
        editor64_data_url: png_bytes_to_data_url(&editor64_bytes),
        preview_data_url: png_bytes_to_data_url(&preview_bytes),
    })
}

pub fn list_entries_in_dir(dir: &Path) -> Result<Vec<WardrobeEntryDto>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|e| format!("Failed to read wardrobe dir: {}", e))?;
    for item in read_dir.flatten() {
        let path = item.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                if let Ok(dto) = load_entry_from_dir(dir, stem) {
                    entries.push(dto);
                }
            }
        }
    }

    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(entries)
}

pub fn save_entry_in_dir(
    dir: &Path,
    id: Option<&str>,
    name: &str,
    geometry: &str,
    png_bytes: &[u8],
) -> Result<WardrobeEntryDto, String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create wardrobe dir: {}", e))?;

    let norm = normalize_skin_png(png_bytes)?;
    let (width, height) = norm.image.dimensions();
    let normalized_png_bytes = encode_rgba_png(&norm.image)?;
    let geom = normalize_geometry_tag(geometry);
    let preview_img = render_2d_body_preview(&norm.image, &geom);
    let preview_bytes = encode_rgba_png(&preview_img)?;

    let ts = now_millis();
    let (clean_id, created_at) = match id {
        Some(existing) if !existing.trim().is_empty() => {
            let cid = sanitize_uuid_id(existing)?;
            let existing_meta_path = dir.join(format!("{}.json", cid));
            let prev_created = fs::read_to_string(&existing_meta_path)
                .ok()
                .and_then(|s| serde_json::from_str::<WardrobeMetadata>(&s).ok())
                .map(|m| m.created_at)
                .unwrap_or(ts);
            (cid, prev_created)
        }
        _ => (Uuid::new_v4().to_string(), ts),
    };

    let clean_name = {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            "Skinvil Hero".to_string()
        } else {
            trimmed.chars().take(60).collect()
        }
    };

    let meta = WardrobeMetadata {
        id: clean_id.clone(),
        name: clean_name,
        geometry: geom,
        width,
        height,
        created_at,
        updated_at: ts,
    };

    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    fs::write(dir.join(format!("{}.png", clean_id)), &normalized_png_bytes)
        .map_err(|e| format!("Failed to write wardrobe PNG: {}", e))?;
    fs::write(dir.join(format!("{}.preview.png", clean_id)), &preview_bytes)
        .map_err(|e| format!("Failed to write wardrobe preview PNG: {}", e))?;
    fs::write(dir.join(format!("{}.json", clean_id)), meta_json)
        .map_err(|e| format!("Failed to write wardrobe metadata JSON: {}", e))?;

    load_entry_from_dir(dir, &clean_id)
}

pub fn rename_entry_in_dir(
    dir: &Path,
    id: &str,
    new_name: &str,
    new_geometry: Option<&str>,
) -> Result<WardrobeEntryDto, String> {
    let clean_id = sanitize_uuid_id(id)?;
    let meta_path = dir.join(format!("{}.json", clean_id));
    let raw = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Wardrobe entry not found: {}", e))?;
    let mut meta: WardrobeMetadata =
        serde_json::from_str(&raw).map_err(|e| format!("Invalid metadata JSON: {}", e))?;

    let trimmed = new_name.trim();
    if !trimmed.is_empty() {
        meta.name = trimmed.chars().take(60).collect();
    }

    if let Some(g) = new_geometry {
        let next_geom = normalize_geometry_tag(g);
        if next_geom != meta.geometry {
            meta.geometry = next_geom;
            // Re-render 2D preview so arm width matches updated geometry!
            let png_bytes = fs::read(dir.join(format!("{}.png", clean_id)))
                .map_err(|e| format!("Missing wardrobe PNG: {}", e))?;
            let norm = normalize_skin_png(&png_bytes)?;
            let preview_img = render_2d_body_preview(&norm.image, &meta.geometry);
            let preview_bytes = encode_rgba_png(&preview_img)?;
            fs::write(dir.join(format!("{}.preview.png", clean_id)), preview_bytes)
                .map_err(|e| format!("Failed to update preview: {}", e))?;
        }
    }

    meta.updated_at = now_millis();
    let json = serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(&meta_path, json).map_err(|e| format!("Failed to save metadata: {}", e))?;

    load_entry_from_dir(dir, &clean_id)
}

pub fn duplicate_entry_in_dir(
    dir: &Path,
    id: &str,
    copy_name: Option<&str>,
) -> Result<WardrobeEntryDto, String> {
    let clean_id = sanitize_uuid_id(id)?;
    let meta_raw = fs::read_to_string(dir.join(format!("{}.json", clean_id)))
        .map_err(|e| format!("Wardrobe entry not found: {}", e))?;
    let meta: WardrobeMetadata =
        serde_json::from_str(&meta_raw).map_err(|e| e.to_string())?;
    let png_bytes = fs::read(dir.join(format!("{}.png", clean_id)))
        .map_err(|e| format!("Missing skin PNG: {}", e))?;

    let next_name = copy_name
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .unwrap_or_else(|| format!("{} (2)", meta.name));

    save_entry_in_dir(dir, None, &next_name, &meta.geometry, &png_bytes)
}

pub fn delete_entry_in_dir(dir: &Path, id: &str) -> Result<(), String> {
    let clean_id = sanitize_uuid_id(id)?;
    let _ = fs::remove_file(dir.join(format!("{}.json", clean_id)));
    let _ = fs::remove_file(dir.join(format!("{}.png", clean_id)));
    let _ = fs::remove_file(dir.join(format!("{}.preview.png", clean_id)));
    Ok(())
}

pub fn decode_base64_or_data_url(s: &str) -> Result<Vec<u8>, String> {
    let payload = s
        .trim()
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(s.trim());
    BASE64
        .decode(payload)
        .map_err(|e| format!("Invalid base64 PNG data: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};
    use tempfile::tempdir;

    #[test]
    fn wardrobe_crud_roundtrip() {
        let dir = tempdir().unwrap();
        let mut img = RgbaImage::from_pixel(64, 64, Rgba([0, 0, 0, 0]));
        img.put_pixel(10, 10, Rgba([255, 180, 120, 255]));
        let raw = encode_rgba_png(&img).unwrap();

        // Save new
        let saved = save_entry_in_dir(dir.path(), None, "Cavalerul Meu", "classic", &raw).unwrap();
        assert_eq!(saved.name, "Cavalerul Meu");
        assert_eq!(saved.geometry, "classic");
        assert!(dir.path().join(format!("{}.png", saved.id)).exists());
        assert!(dir.path().join(format!("{}.preview.png", saved.id)).exists());
        assert!(dir.path().join(format!("{}.json", saved.id)).exists());

        // Rename + change geometry
        let renamed =
            rename_entry_in_dir(dir.path(), &saved.id, "Alex Explorator", Some("slim")).unwrap();
        assert_eq!(renamed.name, "Alex Explorator");
        assert_eq!(renamed.geometry, "slim");

        // Duplicate
        let dup = duplicate_entry_in_dir(dir.path(), &saved.id, None).unwrap();
        assert_ne!(dup.id, saved.id);
        assert_eq!(dup.name, "Alex Explorator (2)");

        // List
        let all = list_entries_in_dir(dir.path()).unwrap();
        assert_eq!(all.len(), 2);

        // Delete
        delete_entry_in_dir(dir.path(), &saved.id).unwrap();
        let remaining = list_entries_in_dir(dir.path()).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, dup.id);
    }
}
