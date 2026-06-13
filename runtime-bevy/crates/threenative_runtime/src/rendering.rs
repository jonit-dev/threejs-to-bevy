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
        fog_mode: profile.fog.as_ref().filter(|fog| fog.enabled).map(|fog| fog.mode.clone()),
        sky_color: Some(color_string(&profile.sky.color)),
        shadow_map_size: Some(profile.shadows.map_size),
        tone_mapping: Some(profile.color_management.tone_mapping.clone()),
        diagnostics: Vec::new(),
    }
}

fn color_string(color: &ColorIr) -> String {
    match color {
        ColorIr::Hex(value) => value.clone(),
        ColorIr::Rgb(value) => format!("rgb({},{},{})", value[0], value[1], value[2]),
    }
}
