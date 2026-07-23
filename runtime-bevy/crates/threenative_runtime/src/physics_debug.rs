use serde::Serialize;

pub const MAX_PHYSICS_DEBUG_ARTIFACT_PRIMITIVES: usize = 16_384;
pub const MAX_PHYSICS_DEBUG_SUMMARY_PRIMITIVES: usize = 512;
pub const MAX_PHYSICS_DEBUG_TIMINGS: usize = 256;
const DEFAULT_PHYSICS_DEBUG_ARTIFACT_PRIMITIVES: usize = 4096;
const DEFAULT_PHYSICS_DEBUG_SUMMARY_PRIMITIVES: usize = 128;
const DEFAULT_PHYSICS_DEBUG_SUMMARY_TIMINGS: usize = 64;
pub const PHYSICS_DEBUG_SCHEMA: &str = "threenative.physics-debug-snapshot";
pub const PHYSICS_DEBUG_VERSION: &str = "0.1.0";
pub const PHYSICS_DEBUG_CATEGORIES: [&str; 13] = [
    "aero",
    "bond",
    "budget",
    "center-of-mass",
    "collider",
    "contact",
    "force",
    "joint-load",
    "piece",
    "sleep",
    "slip",
    "suspension",
    "wheel",
];
pub const PHYSICS_DEBUG_PRIMITIVE_KINDS: [&str; 5] = ["box", "line", "point", "sphere", "vector"];
const MAX_DEBUG_SCALAR: f32 = 1_000_000_000.0;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsDebugPrimitive {
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from: Option<[f32; 3]>,
    pub id: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub position: Option<[f32; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<[f32; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<[f32; 3]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<f32>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsDebugBodies {
    pub active: usize,
    pub sleeping: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsDebugTiming {
    pub milliseconds: f32,
    pub system: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsDebugTelemetry {
    pub allocated_pieces: usize,
    pub bodies: PhysicsDebugBodies,
    pub contacts: usize,
    pub fixed_dt: f32,
    pub queries: usize,
    pub rebuilds: u64,
    pub solver_iterations: usize,
    pub tick: u64,
    pub timings: Vec<PhysicsDebugTiming>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsDebugSnapshot {
    pub artifact: PhysicsDebugDepth,
    pub schema: &'static str,
    pub summary: PhysicsDebugDepth,
    pub version: &'static str,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicsDebugDepth {
    pub omitted_primitives: usize,
    pub primitives: Vec<PhysicsDebugPrimitive>,
    pub telemetry: PhysicsDebugTelemetry,
    pub truncated: bool,
}

impl PhysicsDebugSnapshot {
    pub fn bounded(
        primitives: Vec<PhysicsDebugPrimitive>,
        telemetry: PhysicsDebugTelemetry,
    ) -> Self {
        Self::bounded_with_limits(
            primitives,
            telemetry,
            DEFAULT_PHYSICS_DEBUG_SUMMARY_PRIMITIVES,
            DEFAULT_PHYSICS_DEBUG_ARTIFACT_PRIMITIVES,
            DEFAULT_PHYSICS_DEBUG_SUMMARY_TIMINGS,
        )
    }

    pub fn bounded_with_limits(
        mut primitives: Vec<PhysicsDebugPrimitive>,
        mut telemetry: PhysicsDebugTelemetry,
        summary_primitives: usize,
        artifact_primitives: usize,
        timings: usize,
    ) -> Self {
        let summary_primitives = summary_primitives.min(MAX_PHYSICS_DEBUG_SUMMARY_PRIMITIVES);
        let artifact_primitives = artifact_primitives.min(MAX_PHYSICS_DEBUG_ARTIFACT_PRIMITIVES);
        let timings = timings.min(MAX_PHYSICS_DEBUG_TIMINGS);
        primitives.sort_by(|left, right| left.id.cmp(&right.id));
        telemetry
            .timings
            .sort_by(|left, right| left.system.cmp(&right.system));
        let total_primitives = primitives.len();
        primitives.truncate(artifact_primitives);
        telemetry.timings.truncate(timings);
        for primitive in &mut primitives {
            primitive.id.truncate(128);
            primitive.category.truncate(32);
            primitive.kind.truncate(16);
            if let Some(entity) = primitive.entity.as_mut() {
                entity.truncate(128);
            }
            primitive.from = primitive.from.map(bounded_vec3);
            primitive.to = primitive.to.map(bounded_vec3);
            primitive.position = primitive.position.map(bounded_vec3);
            primitive.size = primitive.size.map(bounded_vec3);
            primitive.value = primitive.value.map(bounded_scalar);
        }
        telemetry.fixed_dt = bounded_scalar(telemetry.fixed_dt);
        for timing in &mut telemetry.timings {
            timing.system.truncate(64);
            timing.milliseconds = bounded_scalar(timing.milliseconds);
        }
        let artifact = PhysicsDebugDepth {
            omitted_primitives: total_primitives.saturating_sub(primitives.len()),
            primitives,
            telemetry,
            truncated: total_primitives > artifact_primitives,
        };
        let summary_omitted = total_primitives.saturating_sub(summary_primitives);
        let summary_telemetry = artifact.telemetry.clone();
        let summary = PhysicsDebugDepth {
            omitted_primitives: summary_omitted,
            primitives: artifact
                .primitives
                .iter()
                .take(summary_primitives)
                .cloned()
                .collect(),
            telemetry: summary_telemetry,
            truncated: summary_omitted > 0,
        };
        Self {
            artifact,
            schema: PHYSICS_DEBUG_SCHEMA,
            summary,
            version: PHYSICS_DEBUG_VERSION,
        }
    }

    pub fn bounded_json(&self, max_bytes: usize) -> Result<String, serde_json::Error> {
        let mut bounded = self.clone();
        loop {
            let encoded = serde_json::to_string(&bounded)?;
            if encoded.len() <= max_bytes
                || (bounded.summary.primitives.is_empty()
                    && bounded.summary.telemetry.timings.is_empty())
            {
                return Ok(encoded);
            }
            if !bounded.summary.primitives.is_empty() {
                bounded.summary.primitives.pop();
                bounded.summary.omitted_primitives += 1;
                bounded.summary.truncated = true;
            } else {
                bounded.summary.telemetry.timings.pop();
            }
            bounded.artifact = bounded.summary.clone();
        }
    }
}

fn bounded_vec3(value: [f32; 3]) -> [f32; 3] {
    value.map(bounded_scalar)
}

fn bounded_scalar(value: f32) -> f32 {
    if value.is_finite() {
        value.clamp(-MAX_DEBUG_SCALAR, MAX_DEBUG_SCALAR)
    } else {
        0.0
    }
}
