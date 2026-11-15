// SPDX-License-Identifier: GPL-3.0-only
use crate::skin_io::{encode_rgba_png, normalize_skin_png};
use crate::wardrobe::decode_base64_or_data_url;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpackSkinInput {
    pub name: String,
    /// `"classic"` / `"slim"` or `"geometry.humanoid.custom"` / `"geometry.humanoid.customSlim"`
    pub geometry: String,
    /// Optional wardrobe UUID to read directly from `<app_data>/skinvil/wardrobe/<id>.png`
    pub wardrobe_id: Option<String>,
    /// Optional base64 or `data:image/png;base64,...` payload
    pub png_base64: Option<String>,
    /// Optional raw PNG byte array
    pub png_bytes: Option<Vec<u8>>,
}

#[derive(Debug, Serialize)]
struct ManifestHeader {
    name: String,
    uuid: String,
    version: [u32; 3],
}

#[derive(Debug, Serialize)]
struct ManifestModule {
    #[serde(rename = "type")]
    module_type: &'static str,
    uuid: String,
    version: [u32; 3],
}

#[derive(Debug, Serialize)]
struct BedrockManifest {
    format_version: u32,
    header: ManifestHeader,
    modules: Vec<ManifestModule>,
}

#[derive(Debug, Serialize)]
struct SkinEntryJson {
    localization_name: String,
    geometry: &'static str,
    texture: String,
    #[serde(rename = "type")]
    skin_type: &'static str,
}

#[derive(Debug, Serialize)]
struct BedrockSkinsJson {
    serialize_name: String,
    localization_name: String,
    skins: Vec<SkinEntryJson>,
}

/// Converts any display string (including Romanian diacritics) into a clean lowercase ASCII slug.
pub fn sanitize_ascii_slug(input: &str, fallback: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_underscore = false;

    for ch in input.chars() {
        let mapped: Option<char> = match ch {
            'ă' | 'Ă' | 'â' | 'Â' | 'à' | 'á' | 'ä' => Some('a'),
            'î' | 'Î' | 'ì' | 'í' | 'ï' => Some('i'),
            'ș' | 'Ș' | 'ş' | 'Ş' => Some('s'),
            'ț' | 'Ț' | 'ţ' | 'Ţ' => Some('t'),
            'é' | 'è' | 'ë' | 'ê' => Some('e'),
            'ó' | 'ò' | 'ö' | 'ô' => Some('o'),
            'ú' | 'ù' | 'ü' | 'û' => Some('u'),
            c if c.is_ascii_alphanumeric() => Some(c.to_ascii_lowercase()),
            _ => None,
        };

        if let Some(c) = mapped {
            out.push(c);
            prev_underscore = false;
        } else if !out.is_empty() && !prev_underscore {
            out.push('_');
            prev_underscore = true;
        }
    }

    while out.ends_with('_') {
        out.pop();
    }

    if out.is_empty() {
        fallback.to_string()
    } else {
        out
    }
}

fn resolve_skin_png_bytes(
    item: &McpackSkinInput,
    wardrobe_dir: Option<&Path>,
) -> Result<Vec<u8>, String> {
    if let Some(ref raw) = item.png_bytes {
        let norm = normalize_skin_png(raw)?;
        return encode_rgba_png(&norm.image);
    }
    if let Some(ref b64) = item.png_base64 {
        let decoded = decode_base64_or_data_url(b64)?;
        let norm = normalize_skin_png(&decoded)?;
        return encode_rgba_png(&norm.image);
    }
    if let (Some(ref wid), Some(wdir)) = (&item.wardrobe_id, wardrobe_dir) {
        let clean_uuid = Uuid::parse_str(wid.trim())
            .map_err(|_| format!("Invalid wardrobe UUID: {}", wid))?;
        let path = wdir.join(format!("{}.png", clean_uuid));
        let bytes = fs::read(&path)
            .map_err(|e| format!("Could not read wardrobe skin {}: {}", clean_uuid, e))?;
        let norm = normalize_skin_png(&bytes)?;
        return encode_rgba_png(&norm.image);
    }
    Err(format!("Skin '{}' is missing PNG data", item.name))
}

fn to_bedrock_geometry(geom: &str) -> &'static str {
    if geom.eq_ignore_ascii_case("slim")
        || geom.eq_ignore_ascii_case("geometry.humanoid.customSlim")
    {
        "geometry.humanoid.customSlim"
    } else {
        "geometry.humanoid.custom"
    }
}

fn sanitize_lang_value(val: &str, fallback: &str) -> String {
    let cleaned: String = val
        .chars()
        .filter(|&c| c != '\r' && c != '\n' && c != '#')
        .collect::<String>()
        .trim()
        .to_string();
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

/// Core `.mcpack` builder writing all Bedrock skin-pack files directly at the root of the ZIP archive.
pub fn build_mcpack_archive(
    pack_name: &str,
    skins: &[McpackSkinInput],
    destination_path: &Path,
    wardrobe_dir: Option<&Path>,
) -> Result<PathBuf, String> {
    if skins.is_empty() {
        return Err("Select at least one skin to forge a .mcpack!".to_string());
    }

    let clean_pack_name = sanitize_lang_value(pack_name, "Skinvil Pack");
    let pack_slug = sanitize_ascii_slug(&clean_pack_name, "skinvil_pack");

    // Generate two guaranteed-distinct UUID v4 values for header & skin_pack module
    let header_uuid = Uuid::new_v4();
    let mut module_uuid = Uuid::new_v4();
    while module_uuid == header_uuid {
        module_uuid = Uuid::new_v4();
    }

    let manifest = BedrockManifest {
        format_version: 2,
        header: ManifestHeader {
            name: clean_pack_name.clone(),
            uuid: header_uuid.to_string(),
            version: [1, 0, 0],
        },
        modules: vec![ManifestModule {
            module_type: "skin_pack",
            uuid: module_uuid.to_string(),
            version: [1, 0, 0],
        }],
    };

    let mut used_slugs = HashSet::new();
    let mut skin_entries = Vec::with_capacity(skins.len());
    let mut texture_files: Vec<(String, Vec<u8>)> = Vec::with_capacity(skins.len());
    let mut lang_lines = vec![format!("skinpack.{}={}", pack_slug, clean_pack_name)];

    for (idx, item) in skins.iter().enumerate() {
        let display_name =
            sanitize_lang_value(&item.name, &format!("Skin {}", idx + 1));
        let base_slug = sanitize_ascii_slug(&display_name, &format!("skin_{}", idx + 1));
        let mut unique_slug = base_slug.clone();
        let mut suffix = 2usize;
        while !used_slugs.insert(unique_slug.clone()) {
            unique_slug = format!("{}_{}", base_slug, suffix);
            suffix += 1;
        }

        let png_bytes = resolve_skin_png_bytes(item, wardrobe_dir)?;
        let texture_filename = format!("{}.png", unique_slug);

        skin_entries.push(SkinEntryJson {
            localization_name: unique_slug.clone(),
            geometry: to_bedrock_geometry(&item.geometry),
            texture: texture_filename.clone(),
            skin_type: "free",
        });

        lang_lines.push(format!(
            "skin.{}.{}={}",
            pack_slug, unique_slug, display_name
        ));
        texture_files.push((texture_filename, png_bytes));
    }

    let skins_json = BedrockSkinsJson {
        serialize_name: pack_slug.clone(),
        localization_name: pack_slug,
        skins: skin_entries,
    };

    let languages_json = serde_json::to_string_pretty(&vec!["en_US"])
        .map_err(|e| format!("Failed to serialize languages.json: {}", e))?;
    let manifest_str = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest.json: {}", e))?;
    let skins_str = serde_json::to_string_pretty(&skins_json)
        .map_err(|e| format!("Failed to serialize skins.json: {}", e))?;
    let lang_content = format!("{}\n", lang_lines.join("\n"));

    let mut final_path = destination_path.to_path_buf();
    if final_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| !s.eq_ignore_ascii_case("mcpack"))
        .unwrap_or(true)
    {
        final_path.set_extension("mcpack");
    }

    if let Some(parent) = final_path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output folder: {}", e))?;
        }
    }

    let file = File::create(&final_path)
        .map_err(|e| format!("Failed to create .mcpack file: {}", e))?;
    let mut zip = ZipWriter::new(file);
    let opts = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    // Strictly write all entries directly at the root of the ZIP archive (no parent wrapper dir!)
    zip.start_file("manifest.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(manifest_str.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file("skins.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(skins_str.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file("texts/languages.json", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(languages_json.as_bytes())
        .map_err(|e| e.to_string())?;

    zip.start_file("texts/en_US.lang", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(lang_content.as_bytes())
        .map_err(|e| e.to_string())?;

    for (tex_name, png_bytes) in texture_files {
        zip.start_file(&tex_name, opts).map_err(|e| e.to_string())?;
        zip.write_all(&png_bytes).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| format!("Failed to finalize .mcpack ZIP: {}", e))?;
    Ok(final_path)
}

/// Exports multiple standalone `.png` skin files directly into `destination_dir` for Minecraft Java Edition.
pub fn export_standalone_pngs(
    skins: &[McpackSkinInput],
    destination_dir: &Path,
    wardrobe_dir: Option<&Path>,
) -> Result<Vec<String>, String> {
    if skins.is_empty() {
        return Err("Select at least one skin to export!".to_string());
    }
    fs::create_dir_all(destination_dir)
        .map_err(|e| format!("Failed to create destination folder: {}", e))?;

    let mut used_slugs = HashSet::new();
    let mut written_paths = Vec::with_capacity(skins.len());

    for (idx, item) in skins.iter().enumerate() {
        let base_slug = sanitize_ascii_slug(&item.name, &format!("skin_{}", idx + 1));
        let mut unique_slug = base_slug.clone();
        let mut suffix = 2usize;
        while !used_slugs.insert(unique_slug.clone()) {
            unique_slug = format!("{}_{}", base_slug, suffix);
            suffix += 1;
        }

        let png_bytes = resolve_skin_png_bytes(item, wardrobe_dir)?;
        let out_path = destination_dir.join(format!("{}.png", unique_slug));
        fs::write(&out_path, png_bytes)
            .map_err(|e| format!("Failed to write PNG {:?}: {}", out_path, e))?;
        written_paths.push(out_path.to_string_lossy().into_owned());
    }

    Ok(written_paths)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};
    use serde_json::Value;
    use std::io::Read;
    use tempfile::tempdir;
    use zip::ZipArchive;

    #[test]
    fn builds_valid_bedrock_mcpack_at_zip_root() {
        let dir = tempdir().unwrap();
        let dest = dir.path().join("Eroii Mei.mcpack");

        let img64 = RgbaImage::from_pixel(64, 64, Rgba([20, 120, 220, 255]));
        let bytes64 = encode_rgba_png(&img64).unwrap();

        let img128 = RgbaImage::from_pixel(128, 128, Rgba([220, 80, 40, 255]));
        let bytes128 = encode_rgba_png(&img128).unwrap();

        let skins = vec![
            McpackSkinInput {
                name: "Cavalerul Roșu".to_string(),
                geometry: "classic".to_string(),
                wardrobe_id: None,
                png_base64: None,
                png_bytes: Some(bytes64),
            },
            McpackSkinInput {
                name: "Aventurier Subțire".to_string(),
                geometry: "slim".to_string(),
                wardrobe_id: None,
                png_base64: None,
                png_bytes: Some(bytes128),
            },
        ];

        let out_path = build_mcpack_archive("Eroii Mei!", &skins, &dest, None).unwrap();
        assert!(out_path.exists());

        let file = File::open(&out_path).unwrap();
        let mut archive = ZipArchive::new(file).unwrap();

        // Collect all entry names & ensure NO top-level wrapper folder exists
        let mut names = Vec::new();
        for i in 0..archive.len() {
            names.push(archive.by_index(i).unwrap().name().to_string());
        }
        assert!(names.contains(&"manifest.json".to_string()));
        assert!(names.contains(&"skins.json".to_string()));
        assert!(names.contains(&"texts/languages.json".to_string()));
        assert!(names.contains(&"texts/en_US.lang".to_string()));
        assert!(names.contains(&"cavalerul_rosu.png".to_string()));
        assert!(names.contains(&"aventurier_subtire.png".to_string()));
        assert_eq!(names.len(), 6);

        // Validate manifest.json
        let mut manifest_str = String::new();
        archive
            .by_name("manifest.json")
            .unwrap()
            .read_to_string(&mut manifest_str)
            .unwrap();
        let manifest: Value = serde_json::from_str(&manifest_str).unwrap();
        assert_eq!(manifest["format_version"], 2);
        assert_eq!(manifest["header"]["name"], "Eroii Mei!");
        assert_eq!(manifest["header"]["version"], serde_json::json!([1, 0, 0]));
        assert_eq!(manifest["modules"][0]["type"], "skin_pack");
        assert_eq!(manifest["modules"][0]["version"], serde_json::json!([1, 0, 0]));
        let u1 = manifest["header"]["uuid"].as_str().unwrap();
        let u2 = manifest["modules"][0]["uuid"].as_str().unwrap();
        assert!(Uuid::parse_str(u1).is_ok());
        assert!(Uuid::parse_str(u2).is_ok());
        assert_ne!(u1, u2);

        // Validate skins.json
        let mut skins_str = String::new();
        archive
            .by_name("skins.json")
            .unwrap()
            .read_to_string(&mut skins_str)
            .unwrap();
        let sj: Value = serde_json::from_str(&skins_str).unwrap();
        assert_eq!(sj["serialize_name"], "eroii_mei");
        assert_eq!(sj["localization_name"], "eroii_mei");
        assert_eq!(sj["skins"][0]["geometry"], "geometry.humanoid.custom");
        assert_eq!(sj["skins"][0]["texture"], "cavalerul_rosu.png");
        assert_eq!(sj["skins"][0]["type"], "free");
        assert_eq!(sj["skins"][1]["geometry"], "geometry.humanoid.customSlim");
        assert_eq!(sj["skins"][1]["texture"], "aventurier_subtire.png");

        // Validate texts/en_US.lang
        let mut lang_str = String::new();
        archive
            .by_name("texts/en_US.lang")
            .unwrap()
            .read_to_string(&mut lang_str)
            .unwrap();
        assert!(lang_str.contains("skinpack.eroii_mei=Eroii Mei!"));
        assert!(lang_str.contains("skin.eroii_mei.cavalerul_rosu=Cavalerul Roșu"));
        assert!(lang_str.contains("skin.eroii_mei.aventurier_subtire=Aventurier Subțire"));
    }
}
