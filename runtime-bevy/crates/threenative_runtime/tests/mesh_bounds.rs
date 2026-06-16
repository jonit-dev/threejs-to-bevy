use threenative_loader::{AssetIr, MeshAttributeIr};
use threenative_runtime::mesh_bounds::{
    aabb_intersects_aabb, mesh_aabb, mesh_bounding_sphere, sample_mesh_points,
    sphere_intersects_sphere,
};

#[test]
fn mesh_bounds_should_compute_custom_mesh_samples_aabb_and_sphere_intersections() {
    let custom = AssetIr {
        id: "mesh.custom".to_owned(),
        kind: "mesh".to_owned(),
        format: "generated".to_owned(),
        animation_graph: None,
        animations: None,
        attributes: Some(vec![MeshAttributeIr {
            item_size: 3,
            name: "position".to_owned(),
            values: vec![-1.0, -2.0, 0.0, 2.0, 0.0, 1.0, 0.0, 3.0, -1.0],
        }]),
        binary_attributes: None,
        binary_indices: None,
        bounds: None,
        budget: None,
        center: None,
        generation: None,
        indices: Some(vec![0, 1, 2]),
        mag_filter: None,
        min_filter: None,
        offset: None,
        particle_emitters: None,
        primitive: Some("custom".to_owned()),
        path: None,
        repeat: None,
        rotation: None,
        size: None,
        topology: None,
        usage: None,
        wrap_s: None,
        wrap_t: None,
    };
    let box_asset = AssetIr {
        id: "mesh.box".to_owned(),
        kind: "mesh".to_owned(),
        format: "generated".to_owned(),
        animation_graph: None,
        animations: None,
        attributes: None,
        binary_attributes: None,
        binary_indices: None,
        bounds: None,
        budget: None,
        center: None,
        generation: None,
        indices: None,
        mag_filter: None,
        min_filter: None,
        offset: None,
        particle_emitters: None,
        primitive: Some("box".to_owned()),
        path: None,
        repeat: None,
        rotation: None,
        size: Some(vec![2.0, 2.0, 2.0]),
        topology: None,
        usage: None,
        wrap_s: None,
        wrap_t: None,
    };

    assert_eq!(
        sample_mesh_points(&custom, Some(2)),
        vec![[-1.0, -2.0, 0.0], [2.0, 0.0, 1.0]]
    );
    assert_eq!(mesh_aabb(&custom).unwrap().min, [-1.0, -2.0, -1.0]);
    assert_eq!(mesh_aabb(&custom).unwrap().max, [2.0, 3.0, 1.0]);
    assert!(aabb_intersects_aabb(
        mesh_aabb(&custom).unwrap(),
        mesh_aabb(&box_asset).unwrap()
    ));
    assert!(sphere_intersects_sphere(
        mesh_bounding_sphere(&custom).unwrap(),
        mesh_bounding_sphere(&box_asset).unwrap()
    ));
}
