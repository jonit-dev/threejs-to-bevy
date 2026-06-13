use bevy::prelude::*;
use threenative_loader::{ColorIr, LoadedBundle};

#[derive(Debug, PartialEq)]
pub struct AtmosphereObservation {
    pub profile_id: Option<String>,
    pub sun_intensity: Option<f32>,
    pub sun_direction: Option<[f32; 3]>,
    pub ambient_intensity: Option<f32>,
    pub fog_mode: Option<String>,
    pub sky_color: Option<String>,
    pub shadow_map_size: Option<u32>,
    pub tone_mapping: Option<String>,
    pub diagnostics: Vec<String>,
}

pub fn observe_atmosphere(bundle: &LoadedBundle) -> AtmosphereObservation {
    let Some(profile) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active)
    else {
        return AtmosphereObservation {
            profile_id: None,
            sun_intensity: None,
            sun_direction: None,
            ambient_intensity: None,
            fog_mode: None,
            sky_color: None,
            shadow_map_size: None,
            tone_mapping: None,
            diagnostics: vec!["TN-BEVY-ATMOSPHERE-MISSING".to_owned()],
        };
    };

    AtmosphereObservation {
        profile_id: Some(profile.id.clone()),
        sun_intensity: Some(profile.sun.intensity),
        sun_direction: Some(profile.sun.direction),
        ambient_intensity: Some(profile.ambient.intensity),
        fog_mode: profile
            .fog
            .as_ref()
            .filter(|fog| fog.enabled)
            .map(|fog| fog.mode.clone()),
        sky_color: Some(color_string(&profile.sky.color)),
        shadow_map_size: Some(profile.shadows.map_size),
        tone_mapping: Some(profile.color_management.tone_mapping.clone()),
        diagnostics: Vec::new(),
    }
}

pub fn apply_atmosphere_to_world(world: &mut World, bundle: &LoadedBundle) {
    let Some(profile) = bundle
        .environment_scene
        .as_ref()
        .and_then(|scene| scene.atmosphere.as_ref())
        .filter(|profile| profile.active)
    else {
        return;
    };

    world.insert_resource(ClearColor(color_to_bevy(&profile.sky.color)));
    world.insert_resource(AmbientLight {
        color: color_to_bevy(&profile.ambient.color),
        brightness: profile.ambient.intensity,
    });
}

fn color_string(color: &ColorIr) -> String {
    match color {
        ColorIr::Hex(value) => value.clone(),
        ColorIr::Rgb(value) => format!("rgb({},{},{})", value[0], value[1], value[2]),
    }
}

fn color_to_bevy(color: &ColorIr) -> Color {
    match color {
        ColorIr::Hex(value) => hex_to_bevy(value).unwrap_or(Color::WHITE),
        ColorIr::Rgb(value) => Color::srgb(value[0], value[1], value[2]),
    }
}

fn hex_to_bevy(value: &str) -> Option<Color> {
    let hex = value.strip_prefix('#').unwrap_or(value);
    if hex.len() != 6 {
        return None;
    }
    let r = u8::from_str_radix(&hex[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()? as f32 / 255.0;
    Some(Color::srgb(r, g, b))
}
