use serde::Serialize;
use serde_json::{Value, json};
use threenative_loader::LoadedBundle;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativePerformanceMetricsReport {
    pub schema: &'static str,
    pub version: &'static str,
    pub runtime: NativePerformanceRuntime,
    pub metrics: Vec<NativePerformanceMetric>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct NativePerformanceRuntime {
    pub adapter: &'static str,
    pub target: &'static str,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum NativePerformanceMetric {
    Measured {
        key: &'static str,
        value: Value,
    },
    Unsupported {
        key: &'static str,
        diagnostic: NativePerformanceDiagnostic,
    },
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct NativePerformanceDiagnostic {
    pub code: &'static str,
    pub severity: &'static str,
    pub message: &'static str,
}

pub fn trace_native_performance_metrics(bundle: &LoadedBundle) -> NativePerformanceMetricsReport {
    NativePerformanceMetricsReport {
        schema: "threenative.native-performance-metrics",
        version: "0.1.0",
        runtime: NativePerformanceRuntime {
            adapter: "bevy",
            target: "desktop",
        },
        metrics: vec![
            unsupported_metric(
                "frameTimeMs",
                "TN_PERFORMANCE_NATIVE_FRAME_TIME_UNSUPPORTED",
                "Native frame-time percentile capture is not promoted for the Bevy adapter.",
            ),
            unsupported_metric(
                "drawCalls",
                "TN_PERFORMANCE_NATIVE_DRAW_CALLS_UNSUPPORTED",
                "Native draw-call counting is not promoted for the Bevy adapter.",
            ),
            unsupported_metric(
                "drawGroups",
                "TN_PERFORMANCE_NATIVE_DRAW_GROUPS_UNSUPPORTED",
                "Native draw-group counting is not promoted for the Bevy adapter.",
            ),
            unsupported_metric(
                "visibleInstances",
                "TN_PERFORMANCE_NATIVE_VISIBLE_INSTANCES_UNSUPPORTED",
                "Native visible-instance counting is not promoted for the Bevy adapter.",
            ),
            NativePerformanceMetric::Measured {
                key: "activeLodBands",
                value: json!(native_active_lod_bands(bundle)),
            },
            NativePerformanceMetric::Measured {
                key: "loadedTextureBytes",
                value: json!(0),
            },
            NativePerformanceMetric::Measured {
                key: "textureVariants",
                value: json!({
                    "loadedBytes": 0,
                    "selectedVariantCount": native_texture_variant_count(bundle)
                }),
            },
            NativePerformanceMetric::Measured {
                key: "entityCount",
                value: json!(bundle.world.entities.len()),
            },
        ],
    }
}

fn unsupported_metric(
    key: &'static str,
    code: &'static str,
    message: &'static str,
) -> NativePerformanceMetric {
    NativePerformanceMetric::Unsupported {
        key,
        diagnostic: NativePerformanceDiagnostic {
            code,
            severity: "warning",
            message,
        },
    }
}

fn native_active_lod_bands(bundle: &LoadedBundle) -> Vec<&'static str> {
    let mut bands = Vec::new();
    if bundle.assets.assets.iter().any(|asset| {
        asset.kind == "texture"
            && asset
                .variants
                .as_ref()
                .is_some_and(|variants| !variants.is_empty())
    }) {
        bands.push("texture-variant");
    }
    if bands.is_empty() && !bundle.world.entities.is_empty() {
        bands.push("default");
    }
    bands
}

fn native_texture_variant_count(bundle: &LoadedBundle) -> usize {
    bundle
        .assets
        .assets
        .iter()
        .filter(|asset| asset.kind == "texture")
        .map(|asset| {
            asset
                .variants
                .as_ref()
                .map_or(1, |variants| variants.len().max(1))
        })
        .sum()
}
