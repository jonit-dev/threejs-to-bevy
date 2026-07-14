import argparse
import json
import math
from pathlib import Path

import bpy


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--") + 1:])


def require_vector(value, name, length=3):
    if not isinstance(value, list) or len(value) != length or not all(isinstance(item, (int, float)) for item in value):
        raise ValueError(f"{name} must contain exactly {length} numbers")
    return value


def create_material(spec):
    color = require_vector(spec.get("color", [0.8, 0.8, 0.8, 1.0]), "material.color", 4)
    material = bpy.data.materials.new(spec.get("name", "material"))
    material.use_nodes = True
    material.diffuse_color = color
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("Blender material is missing its Principled BSDF node")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = float(spec.get("metallic", 0.0))
    principled.inputs["Roughness"].default_value = float(spec.get("roughness", 0.5))
    return material


def create_part(part, materials):
    primitive = part.get("primitive")
    if primitive == "cube":
        bpy.ops.mesh.primitive_cube_add()
    elif primitive == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=int(part.get("vertices", 32)))
    elif primitive == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=int(part.get("segments", 32)), ring_count=int(part.get("rings", 16)))
    elif primitive == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=int(part.get("vertices", 32)))
    else:
        raise ValueError(f"unsupported primitive: {primitive!r}")

    obj = bpy.context.object
    obj.name = part.get("name", primitive)
    obj.location = require_vector(part.get("position", [0, 0, 0]), f"{obj.name}.position")
    obj.rotation_euler = [math.radians(value) for value in require_vector(part.get("rotationDegrees", [0, 0, 0]), f"{obj.name}.rotationDegrees")]
    obj.scale = require_vector(part.get("scale", [1, 1, 1]), f"{obj.name}.scale")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    bevel = float(part.get("bevel", 0.0))
    if bevel > 0:
        modifier = obj.modifiers.new(name="Bevel", type="BEVEL")
        modifier.width = bevel
        modifier.segments = int(part.get("bevelSegments", 2))
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)

    material_name = part.get("material")
    if material_name is not None:
        if material_name not in materials:
            raise ValueError(f"unknown material: {material_name}")
        obj.data.materials.append(materials[material_name])


def main():
    args = parse_args()
    with open(args.input, "r", encoding="utf-8") as source:
        job = json.load(source)
    if job.get("schema") != "threenative.blender-object-job" or job.get("version") != "0.1.0":
        raise ValueError("job must use threenative.blender-object-job version 0.1.0")
    if not isinstance(job.get("parts"), list) or not job["parts"]:
        raise ValueError("job.parts must be a non-empty array")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    materials = {spec["name"]: create_material(spec) for spec in job.get("materials", [])}
    for part in job["parts"]:
        create_part(part, materials)

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_yup=True, use_selection=True)
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError("Blender did not produce a GLB")
    print(json.dumps({"code": "TN_BLENDER_JOB_OK", "output": str(output), "parts": len(job["parts"])}))


main()
