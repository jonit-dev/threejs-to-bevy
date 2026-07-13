use bevy::{
    app::{App, Plugin},
    asset::{Handle, load_internal_asset},
    render::render_resource::Shader,
};

// This intentionally reuses Bevy's SSR shader handle so the native adapter
// can retain the stock render-graph node while matching the web pass's
// bounded composite semantics.
const BEVY_SSR_SHADER_HANDLE: Handle<Shader> = Handle::weak_from_u128(10438925299917978850);

pub struct NativeSsrCompatibilityPlugin;

impl Plugin for NativeSsrCompatibilityPlugin {
    fn build(&self, app: &mut App) {
        load_internal_asset!(
            app,
            BEVY_SSR_SHADER_HANDLE,
            "native_ssr.wgsl",
            Shader::from_wgsl
        );
    }
}
