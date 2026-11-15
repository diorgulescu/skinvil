// SPDX-License-Identifier: GPL-3.0-only
// Skinvil — 100% Offline 3D Voxel Character Skin Creator & .mcpack Studio

pub mod mcpack;
pub mod skin_io;
pub mod wardrobe;

use mcpack::{build_mcpack_archive, export_standalone_pngs, McpackSkinInput};
use serde::Serialize;
use skin_io::{build_processed_skin_dto, encode_rgba_png, normalize_skin_png, ProcessedSkinDto};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use wardrobe::{
    decode_base64_or_data_url, delete_entry_in_dir, duplicate_entry_in_dir, list_entries_in_dir,
    rename_entry_in_dir, resolve_wardrobe_dir, save_entry_in_dir, WardrobeEntryDto,
};

#[derive(Serialize)]
pub struct AppMetadata {
    pub name: &'static str,
    pub slug: &'static str,
    pub version: &'static str,
    pub license: &'static str,
    pub offline_only: bool,
}

#[tauri::command]
fn get_app_metadata() -> AppMetadata {
    AppMetadata {
        name: "Skinvil",
        slug: "skinvil",
        version: env!("CARGO_PKG_VERSION"),
        license: "GNU GPLv3",
        offline_only: true,
    }
}

/// Validates and normalizes imported PNG bytes (`64x32` -> `64x64`, `64x64`, or `128x128` HD)
/// and auto-detects Slim (`Alex`) vs Classic (`Steve`) geometry.
#[tauri::command]
fn process_imported_png(bytes: Vec<u8>) -> Result<ProcessedSkinDto, String> {
    build_processed_skin_dto(&bytes)
}

/// Validates and normalizes an external `.png` skin file directly from a filesystem path.
#[tauri::command]
fn import_skin_from_path(path: String) -> Result<ProcessedSkinDto, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read PNG file '{}': {}", path, e))?;
    build_processed_skin_dto(&bytes)
}

/// Lists all saved skins in `<OS App Data>/skinvil/wardrobe/`.
#[tauri::command]
fn wardrobe_list(app: tauri::AppHandle) -> Result<Vec<WardrobeEntryDto>, String> {
    let dir = resolve_wardrobe_dir(&app)?;
    list_entries_in_dir(&dir)
}

/// Saves or updates a skin in `<OS App Data>/skinvil/wardrobe/` (`.png`, `.preview.png`, `.json`).
#[tauri::command]
fn wardrobe_save(
    app: tauri::AppHandle,
    id: Option<String>,
    name: String,
    geometry: String,
    png_base64: String,
) -> Result<WardrobeEntryDto, String> {
    let dir = resolve_wardrobe_dir(&app)?;
    let bytes = decode_base64_or_data_url(&png_base64)?;
    save_entry_in_dir(&dir, id.as_deref(), &name, &geometry, &bytes)
}

/// Renames a saved wardrobe skin and/or updates its geometry override.
#[tauri::command]
fn wardrobe_update(
    app: tauri::AppHandle,
    id: String,
    name: String,
    geometry: Option<String>,
) -> Result<WardrobeEntryDto, String> {
    let dir = resolve_wardrobe_dir(&app)?;
    rename_entry_in_dir(&dir, &id, &name, geometry.as_deref())
}

/// Duplicates an existing saved wardrobe skin under a fresh UUID.
#[tauri::command]
fn wardrobe_duplicate(
    app: tauri::AppHandle,
    id: String,
    copy_name: Option<String>,
) -> Result<WardrobeEntryDto, String> {
    let dir = resolve_wardrobe_dir(&app)?;
    duplicate_entry_in_dir(&dir, &id, copy_name.as_deref())
}

/// Deletes a saved wardrobe skin and its metadata/preview files.
#[tauri::command]
fn wardrobe_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = resolve_wardrobe_dir(&app)?;
    delete_entry_in_dir(&dir, &id)
}

/// Forges a Minecraft Bedrock `.mcpack` archive with all files directly at the root of the ZIP.
#[tauri::command]
fn forge_mcpack(
    app: tauri::AppHandle,
    pack_name: String,
    skins: Vec<McpackSkinInput>,
    destination_path: String,
) -> Result<String, String> {
    let wdir = resolve_wardrobe_dir(&app).ok();
    let written = build_mcpack_archive(
        &pack_name,
        &skins,
        Path::new(&destination_path),
        wdir.as_deref(),
    )?;
    Ok(written.to_string_lossy().into_owned())
}

/// Exports standalone `.png` skin files into a user-chosen folder for Minecraft Java Edition.
#[tauri::command]
fn export_skin_pngs(
    app: tauri::AppHandle,
    skins: Vec<McpackSkinInput>,
    destination_dir: String,
) -> Result<Vec<String>, String> {
    let wdir = resolve_wardrobe_dir(&app).ok();
    export_standalone_pngs(&skins, Path::new(&destination_dir), wdir.as_deref())
}

/// Saves a single validated `.png` skin directly to a user-selected path.
#[tauri::command]
fn save_skin_png_to_path(destination_path: String, bytes: Vec<u8>) -> Result<String, String> {
    let norm = normalize_skin_png(&bytes)?;
    let out_bytes = encode_rgba_png(&norm.image)?;
    let mut final_path = PathBuf::from(destination_path);
    if final_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| !s.eq_ignore_ascii_case("png"))
        .unwrap_or(true)
    {
        final_path.set_extension("png");
    }
    if let Some(parent) = final_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&final_path, out_bytes).map_err(|e| format!("Failed to write PNG: {}", e))?;
    Ok(final_path.to_string_lossy().into_owned())
}

/// Saves a 64x64 PNG byte array directly into the user's Downloads folder (quick fallback).
#[tauri::command]
fn save_skin_png(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let safe_name: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let final_name = if safe_name.to_lowercase().ends_with(".png") {
        safe_name
    } else {
        format!("{}.png", safe_name)
    };

    let target_dir: PathBuf = app
        .path()
        .download_dir()
        .or_else(|_| app.path().picture_dir())
        .or_else(|_| app.path().document_dir())
        .map_err(|e| format!("Could not resolve export directory: {}", e))?;

    fs::create_dir_all(&target_dir).map_err(|e| format!("Failed to create directory: {}", e))?;
    let full_path = target_dir.join(final_name);
    fs::write(&full_path, bytes).map_err(|e| format!("Failed to write PNG: {}", e))?;

    Ok(full_path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_app_metadata,
            process_imported_png,
            import_skin_from_path,
            wardrobe_list,
            wardrobe_save,
            wardrobe_update,
            wardrobe_duplicate,
            wardrobe_delete,
            forge_mcpack,
            export_skin_pngs,
            save_skin_png_to_path,
            save_skin_png
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skinvil application");
}
