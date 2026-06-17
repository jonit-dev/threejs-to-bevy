#[derive(Clone, Debug, PartialEq)]
pub struct NativeDebugDrawPrimitive {
    pub id: String,
    pub kind: String,
    pub label: Option<String>,
    pub lifetime_seconds: Option<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeDebugCounter {
    pub category: String,
    pub id: String,
    pub label: String,
    pub severity: String,
    pub value: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct NativeDebugOverlayReport {
    pub counters: Vec<NativeDebugCounter>,
    pub enabled: bool,
    pub fps: Option<f32>,
    pub primitives: Vec<NativeDebugDrawPrimitive>,
}

pub fn observe_debug_overlay(
    fps: Option<f32>,
    primitives: &[NativeDebugDrawPrimitive],
    counters: &[NativeDebugCounter],
) -> NativeDebugOverlayReport {
    let mut primitives = primitives.to_vec();
    primitives.sort_by(|left, right| left.id.cmp(&right.id));
    let mut counters = counters.to_vec();
    counters.sort_by(|left, right| left.id.cmp(&right.id));
    NativeDebugOverlayReport {
        enabled: fps.is_some() || !primitives.is_empty() || !counters.is_empty(),
        fps,
        primitives,
        counters,
    }
}
