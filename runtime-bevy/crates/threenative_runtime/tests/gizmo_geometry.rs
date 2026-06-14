use bevy::{
    prelude::Mesh,
    render::{mesh::VertexAttributeValues, render_resource::PrimitiveTopology},
};
use threenative_runtime::gizmo_geometry::{
    create_axis_gizmo, create_wire_box_gizmo, create_wire_sphere_gizmo, gizmo_to_mesh,
};

#[test]
fn gizmo_geometry_should_emit_debug_only_line_geometry() {
    let axis = create_axis_gizmo(2.0);
    assert!(axis.debug_only);
    assert_eq!(axis.lines.len(), 3);
    assert_eq!(axis.lines[0].color, [1.0, 0.0, 0.0]);
    assert_eq!(axis.lines[0].to, [2.0, 0.0, 0.0]);

    let box_gizmo = create_wire_box_gizmo([2.0, 4.0, 6.0], [1.0, 1.0, 0.0]);
    assert_eq!(box_gizmo.lines.len(), 12);
    assert_eq!(box_gizmo.lines[0].from, [-1.0, -2.0, -3.0]);
    assert_eq!(box_gizmo.lines[0].to, [1.0, -2.0, -3.0]);

    let sphere = create_wire_sphere_gizmo(1.0, 4, [0.0, 0.75, 1.0]);
    assert_eq!(sphere.lines.len(), 12);

    let mesh = gizmo_to_mesh(&axis);
    assert_eq!(mesh.primitive_topology(), PrimitiveTopology::LineList);
    let Some(VertexAttributeValues::Float32x3(positions)) =
        mesh.attribute(Mesh::ATTRIBUTE_POSITION)
    else {
        panic!("expected position attribute");
    };
    assert_eq!(positions.len(), 6);
    let Some(VertexAttributeValues::Float32x4(colors)) = mesh.attribute(Mesh::ATTRIBUTE_COLOR)
    else {
        panic!("expected color attribute");
    };
    assert_eq!(colors.len(), 6);
}
