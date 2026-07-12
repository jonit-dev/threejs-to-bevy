use bevy::{
    app::{App, Plugin},
    asset::{load_internal_asset, Handle},
    render::render_resource::Shader,
};

// Keep Bevy's volumetric render-graph node and bindings, but use the adapter
// shader so its shadow march has the same per-pixel sample jitter as the web
// GodRays pass.
const BEVY_VOLUMETRIC_FOG_SHADER_HANDLE: Handle<Shader> =
    Handle::weak_from_u128(17400058287583986650);

pub struct NativeVolumetricCompatibilityPlugin;

impl Plugin for NativeVolumetricCompatibilityPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            BEVY_VOLUMETRIC_FOG_SHADER_HANDLE,
            "native_volumetric.wgsl",
            Shader::from_wgsl
        );
    }
}
