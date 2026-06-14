use threenative_loader::AssetIr;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AabbBounds {
    pub min: [f32; 3],
    pub max: [f32; 3],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BoundingSphere {
    pub center: [f32; 3],
    pub radius: f32,
}

pub fn sample_mesh_points(asset: &AssetIr, max_samples: Option<usize>) -> Vec<[f32; 3]> {
    if asset.kind != "mesh" {
        return Vec::new();
    }
    let samples = if asset.primitive.as_deref() == Some("custom") {
        sample_custom_mesh_points(asset)
    } else {
        sample_primitive_mesh_points(asset)
    };
    samples
        .into_iter()
        .take(max_samples.unwrap_or(usize::MAX))
        .collect()
}

pub fn mesh_aabb(asset: &AssetIr) -> Option<AabbBounds> {
    let samples = sample_mesh_points(asset, None);
    let first = *samples.first()?;
    let mut min = first;
    let mut max = first;
    for sample in samples.iter().skip(1) {
        for index in 0..3 {
            min[index] = min[index].min(sample[index]);
            max[index] = max[index].max(sample[index]);
        }
    }
    Some(AabbBounds { min, max })
}

pub fn mesh_bounding_sphere(asset: &AssetIr) -> Option<BoundingSphere> {
    let bounds = mesh_aabb(asset)?;
    let center = [
        (bounds.min[0] + bounds.max[0]) / 2.0,
        (bounds.min[1] + bounds.max[1]) / 2.0,
        (bounds.min[2] + bounds.max[2]) / 2.0,
    ];
    let radius = sample_mesh_points(asset, None)
        .iter()
        .map(|point| distance(*point, center))
        .fold(0.0, f32::max);
    Some(BoundingSphere { center, radius })
}

pub fn aabb_intersects_aabb(left: AabbBounds, right: AabbBounds) -> bool {
    left.min[0] <= right.max[0]
        && left.max[0] >= right.min[0]
        && left.min[1] <= right.max[1]
        && left.max[1] >= right.min[1]
        && left.min[2] <= right.max[2]
        && left.max[2] >= right.min[2]
}

pub fn sphere_intersects_sphere(left: BoundingSphere, right: BoundingSphere) -> bool {
    distance(left.center, right.center) <= left.radius + right.radius
}

fn sample_custom_mesh_points(asset: &AssetIr) -> Vec<[f32; 3]> {
    let Some(position) = asset.attributes.as_deref().and_then(|attributes| {
        attributes
            .iter()
            .find(|attribute| attribute.name == "position")
    }) else {
        return Vec::new();
    };
    position
        .values
        .chunks_exact(3)
        .map(|chunk| [chunk[0], chunk[1], chunk[2]])
        .collect()
}

fn sample_primitive_mesh_points(asset: &AssetIr) -> Vec<[f32; 3]> {
    let size = asset.size.as_deref().unwrap_or(&[]);
    match asset.primitive.as_deref() {
        Some("box") | Some("extrudedRectangle") => {
            let half_x = size.first().copied().unwrap_or(1.0) / 2.0;
            let half_y = size.get(1).copied().unwrap_or(1.0) / 2.0;
            let half_z = size.get(2).copied().unwrap_or(1.0) / 2.0;
            vec![[-half_x, -half_y, -half_z], [half_x, half_y, half_z]]
        }
        Some("plane") => {
            let half_x = size.first().copied().unwrap_or(1.0) / 2.0;
            let half_y = size.get(1).copied().unwrap_or(1.0) / 2.0;
            vec![[-half_x, -half_y, 0.0], [half_x, half_y, 0.0]]
        }
        _ => {
            let radius = primitive_radius(asset);
            let half_height = primitive_half_height(asset);
            vec![
                [-radius, -half_height, -radius],
                [radius, half_height, radius],
            ]
        }
    }
}

fn primitive_radius(asset: &AssetIr) -> f32 {
    let size = asset.size.as_deref().unwrap_or(&[]);
    match asset.primitive.as_deref() {
        Some("torus") | Some("annulus") => size.get(1).copied().unwrap_or(1.0),
        Some("conicalFrustum") => size
            .first()
            .copied()
            .unwrap_or(0.25)
            .max(size.get(1).copied().unwrap_or(0.5)),
        Some("regularPolygon") | Some("circle") | Some("sphere") => {
            size.first().copied().unwrap_or(0.5)
        }
        _ => size.first().copied().unwrap_or(0.5),
    }
}

fn primitive_half_height(asset: &AssetIr) -> f32 {
    match asset.primitive.as_deref() {
        Some("sphere") | Some("torus") => primitive_radius(asset),
        Some("annulus") | Some("circle") | Some("regularPolygon") => 0.0,
        _ => {
            asset
                .size
                .as_deref()
                .and_then(|size| size.get(1))
                .copied()
                .unwrap_or(1.0)
                / 2.0
        }
    }
}

fn distance(left: [f32; 3], right: [f32; 3]) -> f32 {
    ((left[0] - right[0]).powi(2) + (left[1] - right[1]).powi(2) + (left[2] - right[2]).powi(2))
        .sqrt()
}
