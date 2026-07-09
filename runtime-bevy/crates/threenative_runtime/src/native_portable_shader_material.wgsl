#import bevy_pbr::{
    mesh_functions,
    forward_io::{Vertex, VertexOutput},
    view_transformations::position_world_to_clip,
}

@group(2) @binding(0) var<uniform> base_color: vec4<f32>;
@group(2) @binding(1) var base_color_texture: texture_2d<f32>;
@group(2) @binding(2) var base_color_texture_sampler: sampler;
@group(2) @binding(3) var<uniform> displacement_amount: f32;

@vertex
fn vertex(vertex: Vertex) -> VertexOutput {
    var out: VertexOutput;
    let world_from_local = mesh_functions::get_world_from_local(vertex.instance_index);

#ifdef VERTEX_NORMALS
    out.world_normal = mesh_functions::mesh_normal_local_to_world(
        vertex.normal,
        vertex.instance_index
    );
#endif

#ifdef VERTEX_POSITIONS
    var local_position = vertex.position;
#ifdef VERTEX_NORMALS
    local_position = local_position + vertex.normal * displacement_amount;
#endif
    out.world_position = mesh_functions::mesh_position_local_to_world(world_from_local, vec4<f32>(local_position, 1.0));
    out.position = position_world_to_clip(out.world_position.xyz);
#endif

#ifdef VERTEX_UVS_A
    out.uv = vertex.uv;
#endif

#ifdef VERTEX_COLORS
    out.color = vertex.color;
#endif

    return out;
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let sampled = textureSample(base_color_texture, base_color_texture_sampler, vec2<f32>(in.uv.x, 1.0 - in.uv.y));
    return sampled * base_color;
}
