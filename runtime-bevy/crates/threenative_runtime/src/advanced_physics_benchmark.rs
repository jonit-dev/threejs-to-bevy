use std::{
    alloc::{GlobalAlloc, Layout, System},
    collections::{BTreeMap, BTreeSet},
    env,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
    time::Instant,
};

use serde::Serialize;
use threenative_loader::load_bundle;
use threenative_runtime::{
    physics::{
        inspect_cached_physics_debug, queue_cached_physics_destruction_damage,
        step_bundle_physics_with_script_poses,
    },
    physics_aerodynamics::{AerodynamicInputs, set_physics_aerodynamic_inputs},
    physics_destruction::{DestructionCause, DestructionCauseKind, DestructionDamage},
    physics_vehicle::{VehicleControlInput, set_physics_vehicle_controller_inputs},
};

const VEHICLES: usize = 16;
const WHEELS_PER_VEHICLE: usize = 4;
const DEBRIS: usize = 128;
const COMPOUND_CHILDREN: usize = 256;
const PROJECTILES: usize = 64;
const WARMUP_STEPS: usize = 600;
const MEASURED_STEPS: usize = 3_600;
const FIXED_DELTA: f32 = 1.0 / 60.0;

struct CountingAllocator;
static CURRENT_BYTES: AtomicUsize = AtomicUsize::new(0);
static PEAK_BYTES: AtomicUsize = AtomicUsize::new(0);

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        // SAFETY: Delegates the unchanged layout to the system allocator.
        let pointer = unsafe { System.alloc(layout) };
        if !pointer.is_null() {
            let current = CURRENT_BYTES.fetch_add(layout.size(), Ordering::Relaxed) + layout.size();
            PEAK_BYTES.fetch_max(current, Ordering::Relaxed);
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        CURRENT_BYTES.fetch_sub(layout.size(), Ordering::Relaxed);
        // SAFETY: The pointer and layout came from the matching system allocation.
        unsafe { System.dealloc(pointer, layout) };
    }
}

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Workload {
    vehicle_count: usize,
    wheels_per_vehicle: usize,
    debris_bodies: usize,
    compound_children: usize,
    projectile_bodies: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AllocationTelemetry {
    heap_used_end_bytes: usize,
    heap_used_peak_bytes: usize,
    heap_used_start_bytes: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TimingSummary {
    max_ms: f64,
    p95_ms: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    schema: &'static str,
    version: &'static str,
    runtime: &'static str,
    simulated_seconds: f64,
    sample_count: usize,
    p50_step_ms: f64,
    p95_step_ms: f64,
    max_step_ms: f64,
    active_bodies: usize,
    sleeping_bodies: usize,
    contacts: usize,
    queries: usize,
    allocated_pieces: usize,
    allocation_telemetry: AllocationTelemetry,
    executed_systems: [&'static str; 5],
    system_timings: BTreeMap<String, TimingSummary>,
    workload: Workload,
}

fn main() {
    let bundle_path = env::args()
        .nth(1)
        .expect("advanced physics benchmark requires a generated benchmark bundle path");
    let mut bundle = load_bundle(Path::new(&bundle_path)).expect("load benchmark bundle");
    let script_poses = BTreeSet::new();
    let runtime_id = (&script_poses as *const BTreeSet<String>) as usize;
    for index in 0..VEHICLES {
        let entity = format!("vehicle-{index:02}");
        assert!(set_physics_vehicle_controller_inputs(
            runtime_id,
            entity.clone(),
            VehicleControlInput {
                brake: 0.0,
                clutch: 0.0,
                gear: None,
                handbrake: 0.0,
                steer: 0.1,
                throttle: 0.65,
            },
        ));
        assert!(set_physics_aerodynamic_inputs(
            runtime_id,
            &bundle,
            &entity,
            AerodynamicInputs {
                surfaces: BTreeMap::from([("downforce".to_owned(), 0.1)]),
                thrusters: BTreeMap::new(),
            },
        ));
    }

    // Create the retained runtime, then activate all authored debris pieces
    // through the production destruction queue before the warm-up window.
    step_bundle_physics_with_script_poses(&mut bundle, FIXED_DELTA, &script_poses);
    for index in 0..DEBRIS - 1 {
        assert!(queue_cached_physics_destruction_damage(
            &script_poses,
            DestructionDamage {
                amount: Some(2.0),
                assembly: "debris-assembly".to_owned(),
                bond: format!("bond-{index:03}"),
                cause: DestructionCause {
                    contact: None,
                    entity: None,
                    kind: DestructionCauseKind::Script,
                },
                energy: None,
                impulse: None,
                layer: None,
                tick: 2,
            },
        ));
    }
    step_bundle_physics_with_script_poses(&mut bundle, FIXED_DELTA, &script_poses);

    for _ in 0..WARMUP_STEPS {
        step_bundle_physics_with_script_poses(&mut bundle, FIXED_DELTA, &script_poses);
    }
    let heap_used_start_bytes = CURRENT_BYTES.load(Ordering::Relaxed);
    let mut samples = Vec::with_capacity(MEASURED_STEPS);
    let mut queries = 0;
    let mut contacts = 0;
    let mut allocated_pieces = 0;
    let mut active_bodies = 0;
    let mut sleeping_bodies = 0;
    let mut timing_samples = BTreeMap::<String, Vec<f64>>::new();
    for _ in 0..MEASURED_STEPS {
        let started_at = Instant::now();
        step_bundle_physics_with_script_poses(&mut bundle, FIXED_DELTA, &script_poses);
        samples.push(started_at.elapsed().as_secs_f64() * 1_000.0);
        let snapshot = inspect_cached_physics_debug(&bundle, &script_poses)
            .expect("benchmark retained physics debug snapshot");
        let telemetry = snapshot.artifact.telemetry;
        queries += telemetry.queries;
        contacts = contacts.max(telemetry.contacts);
        allocated_pieces = allocated_pieces.max(telemetry.allocated_pieces);
        active_bodies = telemetry.bodies.active;
        sleeping_bodies = telemetry.bodies.sleeping;
        for timing in telemetry.timings {
            timing_samples
                .entry(timing.system)
                .or_default()
                .push(f64::from(timing.milliseconds));
        }
    }
    samples.sort_by(f64::total_cmp);
    let system_timings = timing_samples
        .into_iter()
        .map(|(system, mut values)| {
            values.sort_by(f64::total_cmp);
            (
                system,
                TimingSummary {
                    max_ms: values.last().copied().unwrap_or_default(),
                    p95_ms: percentile(&values, 0.95),
                },
            )
        })
        .collect();
    let report = Report {
        schema: "threenative.advanced-physics-benchmark",
        version: "0.2.0",
        runtime: "desktop",
        simulated_seconds: MEASURED_STEPS as f64 / 60.0,
        sample_count: samples.len(),
        p50_step_ms: percentile(&samples, 0.5),
        p95_step_ms: percentile(&samples, 0.95),
        max_step_ms: samples.last().copied().unwrap_or_default(),
        active_bodies,
        sleeping_bodies,
        contacts,
        queries,
        allocated_pieces,
        allocation_telemetry: AllocationTelemetry {
            heap_used_end_bytes: CURRENT_BYTES.load(Ordering::Relaxed),
            heap_used_peak_bytes: PEAK_BYTES.load(Ordering::Relaxed),
            heap_used_start_bytes,
        },
        executed_systems: [
            "vehicle-controller",
            "wheel-raycast",
            "aerodynamics",
            "destruction",
            "rapier",
        ],
        system_timings,
        workload: Workload {
            vehicle_count: VEHICLES,
            wheels_per_vehicle: WHEELS_PER_VEHICLE,
            debris_bodies: DEBRIS,
            compound_children: COMPOUND_CHILDREN,
            projectile_bodies: PROJECTILES,
        },
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&report).expect("serialize benchmark report")
    );
}

fn percentile(samples: &[f64], ratio: f64) -> f64 {
    let index = ((samples.len() as f64 * ratio).ceil() as usize).saturating_sub(1);
    samples.get(index).copied().unwrap_or_default()
}
