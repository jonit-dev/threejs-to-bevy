use std::{env, fs, path::PathBuf, process};

use serde::Serialize;
use threenative_loader::{load_bundle, SystemIr, SystemQueryIr};
use threenative_runtime::{
    input::{NativeDragPickingEvent, NativeDragPickingFrame, NativeDragPickingTracker},
    systems_context::{build_system_context_snapshot, NativeSystemTimeSnapshot},
    systems_services::{
        pick_mesh, pointer_ray, NativePickMeshResult, NativePointerRayRequest,
        NativePointerRayResult, NativeRaycastRequest,
    },
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DragPickingTraceReport {
    schema: &'static str,
    version: &'static str,
    trace: Vec<DragPickingTraceEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DragPickingTraceEntry {
    button_down: bool,
    events: Vec<NativeDragPickingEvent>,
    picked_entity: Option<String>,
    pointer: [f64; 2],
    ray: NativePointerRayResult,
    time_ms: f64,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let bundle_path = args.next().ok_or("missing bundle path")?;
    let output_path = PathBuf::from(args.next().ok_or("missing output path")?);
    let bundle = load_bundle(bundle_path)?;
    let system = drag_picking_system();
    let snapshot = build_system_context_snapshot(&bundle, &system, time());
    let mut tracker = NativeDragPickingTracker::new(0.05);
    let mut trace = Vec::new();

    for frame in frames() {
        let ray = pointer_ray(
            &snapshot,
            &NativePointerRayRequest {
                aspect: Some(1.0),
                camera: None,
                max_distance: None,
                pointer: frame.pointer,
            },
        );
        let picked_entity = match &ray {
            NativePointerRayResult::Hit(hit) => match pick_mesh(
                &snapshot,
                &NativeRaycastRequest {
                    direction: hit.direction,
                    ignore: Vec::new(),
                    layer: None,
                    layers: Vec::new(),
                    mask: Vec::new(),
                    max_distance: hit.max_distance,
                    origin: hit.origin,
                },
            ) {
                NativePickMeshResult::Hit(hit) => Some(hit.entity),
                NativePickMeshResult::Miss(_) => None,
            },
            NativePointerRayResult::Miss(_) => None,
        };
        let events = tracker.update(NativeDragPickingFrame {
            button_down: frame.button_down,
            picked_entity: picked_entity.clone(),
            pointer: frame.pointer,
            time_ms: frame.time_ms,
        });
        trace.push(DragPickingTraceEntry {
            button_down: frame.button_down,
            events,
            picked_entity,
            pointer: frame.pointer,
            ray,
            time_ms: frame.time_ms,
        });
    }

    let report = DragPickingTraceReport {
        schema: "threenative.drag-picking-trace",
        version: "0.1.0",
        trace,
    };
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        output_path,
        format!("{}\n", serde_json::to_string_pretty(&report)?),
    )?;
    Ok(())
}

fn drag_picking_system() -> SystemIr {
    SystemIr {
        after: Vec::new(),
        before: Vec::new(),
        commands: Vec::new(),
        event_reads: Vec::new(),
        event_writes: Vec::new(),
        name: "traceDragPicking".to_owned(),
        queries: vec![SystemQueryIr {
            changed: Vec::new(),
            limit: None,
            offset: None,
            order_by: None,
            with: Vec::new(),
            without: Vec::new(),
        }],
        reads: vec![
            "Camera".to_owned(),
            "MeshRenderer".to_owned(),
            "Transform".to_owned(),
        ],
        resource_reads: Vec::new(),
        resource_writes: Vec::new(),
        schedule: "update".to_owned(),
        script: None,
        services: vec!["picking.mesh".to_owned(), "picking.pointerRay".to_owned()],
        writes: Vec::new(),
    }
}

fn frames() -> Vec<NativeDragPickingFrame> {
    vec![
        NativeDragPickingFrame {
            button_down: true,
            picked_entity: None,
            pointer: [0.5, 0.5],
            time_ms: 0.0,
        },
        NativeDragPickingFrame {
            button_down: true,
            picked_entity: None,
            pointer: [0.51, 0.5],
            time_ms: 16.0,
        },
        NativeDragPickingFrame {
            button_down: true,
            picked_entity: None,
            pointer: [0.6, 0.5],
            time_ms: 32.0,
        },
        NativeDragPickingFrame {
            button_down: false,
            picked_entity: None,
            pointer: [0.8, 0.5],
            time_ms: 48.0,
        },
    ]
}

fn time() -> NativeSystemTimeSnapshot {
    NativeSystemTimeSnapshot {
        delta: 0.016,
        dt: 0.016,
        elapsed: 1.0,
        fixed_delta: 0.016,
        fixed_dt: 0.016,
        paused: false,
    }
}
