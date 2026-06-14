use bevy::{
    prelude::*,
    render::{mesh::PrimitiveTopology, render_asset::RenderAssetUsages},
};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GizmoKind {
    Axis,
    WireBox,
    WireSphere,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GizmoLine {
    pub color: [f32; 3],
    pub from: [f32; 3],
    pub to: [f32; 3],
}

#[derive(Clone, Debug, PartialEq)]
pub struct GizmoGeometry {
    pub debug_only: bool,
    pub kind: GizmoKind,
    pub lines: Vec<GizmoLine>,
}

pub fn create_axis_gizmo(length: f32) -> GizmoGeometry {
    let size = length.max(0.0);
    GizmoGeometry {
        debug_only: true,
        kind: GizmoKind::Axis,
        lines: vec![
            GizmoLine {
                color: [1.0, 0.0, 0.0],
                from: [0.0, 0.0, 0.0],
                to: [size, 0.0, 0.0],
            },
            GizmoLine {
                color: [0.0, 1.0, 0.0],
                from: [0.0, 0.0, 0.0],
                to: [0.0, size, 0.0],
            },
            GizmoLine {
                color: [0.0, 0.35, 1.0],
                from: [0.0, 0.0, 0.0],
                to: [0.0, 0.0, size],
            },
        ],
    }
}

pub fn create_wire_box_gizmo(size: [f32; 3], color: [f32; 3]) -> GizmoGeometry {
    let hx = size[0].max(0.0) / 2.0;
    let hy = size[1].max(0.0) / 2.0;
    let hz = size[2].max(0.0) / 2.0;
    let corners = [
        [-hx, -hy, -hz],
        [hx, -hy, -hz],
        [hx, hy, -hz],
        [-hx, hy, -hz],
        [-hx, -hy, hz],
        [hx, -hy, hz],
        [hx, hy, hz],
        [-hx, hy, hz],
    ];
    let edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
    ];
    GizmoGeometry {
        debug_only: true,
        kind: GizmoKind::WireBox,
        lines: edges
            .into_iter()
            .map(|[from, to]| GizmoLine {
                color,
                from: corners[from],
                to: corners[to],
            })
            .collect(),
    }
}

pub fn create_wire_sphere_gizmo(radius: f32, segments: usize, color: [f32; 3]) -> GizmoGeometry {
    let clamped_radius = radius.max(0.0);
    let count = segments.max(3);
    let mut lines = Vec::new();
    for plane in [CirclePlane::Xy, CirclePlane::Xz, CirclePlane::Yz] {
        for index in 0..count {
            let from = circle_point(
                plane,
                clamped_radius,
                index as f32 / count as f32 * std::f32::consts::TAU,
            );
            let to = circle_point(
                plane,
                clamped_radius,
                (index + 1) as f32 / count as f32 * std::f32::consts::TAU,
            );
            lines.push(GizmoLine { color, from, to });
        }
    }
    GizmoGeometry {
        debug_only: true,
        kind: GizmoKind::WireSphere,
        lines,
    }
}

pub fn gizmo_to_mesh(gizmo: &GizmoGeometry) -> Mesh {
    let mut positions = Vec::new();
    let mut colors = Vec::new();
    for line in &gizmo.lines {
        positions.push(line.from);
        positions.push(line.to);
        colors.push([line.color[0], line.color[1], line.color[2], 1.0]);
        colors.push([line.color[0], line.color[1], line.color[2], 1.0]);
    }
    let mut mesh = Mesh::new(PrimitiveTopology::LineList, RenderAssetUsages::default());
    mesh.insert_attribute(Mesh::ATTRIBUTE_POSITION, positions);
    mesh.insert_attribute(Mesh::ATTRIBUTE_COLOR, colors);
    mesh
}

#[derive(Clone, Copy)]
enum CirclePlane {
    Xy,
    Xz,
    Yz,
}

fn circle_point(plane: CirclePlane, radius: f32, angle: f32) -> [f32; 3] {
    let x = angle.cos() * radius;
    let y = angle.sin() * radius;
    match plane {
        CirclePlane::Xy => [x, y, 0.0],
        CirclePlane::Xz => [x, 0.0, y],
        CirclePlane::Yz => [0.0, x, y],
    }
}
