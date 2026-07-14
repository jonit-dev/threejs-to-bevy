"""Owned Blender background runner for bounded ThreeNative recipes.

This file deliberately contains no dynamic code evaluation or arbitrary Blender
operator dispatch. Every accepted recipe field reaches a named handler below.
"""

import json
import math
import os
import sys
import traceback

import bpy
from mathutils import Euler, Matrix


RESULT_PREFIX = "THREENATIVE_RESULT "
TO_BLENDER = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)))


def fail(message):
    result = {"ok": False, "message": message}
    print(RESULT_PREFIX + json.dumps(result, sort_keys=True), flush=True)
    return result


def vec3(value, default):
    return tuple(float(component) for component in (value if value is not None else default))


def position_to_blender(value):
    x_value, y_value, z_value = vec3(value, [0.0, 0.0, 0.0])
    return (x_value, -z_value, y_value)


def authored_axis_to_blender(value):
    """Map an authored Y-up axis label to Blender's Z-up object axes."""
    return {"x": "x", "y": "z", "z": "y"}[value]


def scale_to_blender(value):
    x_value, y_value, z_value = vec3(value, [1.0, 1.0, 1.0])
    return (x_value, z_value, y_value)


def rotation_to_blender(value):
    desired = Euler(tuple(math.radians(component) for component in vec3(value, [0.0, 0.0, 0.0])), "XYZ").to_matrix()
    return (TO_BLENDER @ desired @ TO_BLENDER.inverted()).to_euler("XYZ")


def create_material(row):
    material = bpy.data.materials.new(name=row["id"])
    material.diffuse_color = tuple(row.get("baseColor", [1.0, 1.0, 1.0])[:3]) + (
        float(row.get("baseColor", [1.0, 1.0, 1.0, 1.0])[3])
        if len(row.get("baseColor", [])) == 4
        else 1.0,
    )
    material.metallic = float(row.get("metallic", 0.0))
    material.roughness = float(row.get("roughness", 0.5))
    material.diffuse_color = tuple(material.diffuse_color)
    material.use_nodes = True
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is not None:
        node.inputs["Base Color"].default_value = material.diffuse_color
        node.inputs["Metallic"].default_value = material.metallic
        node.inputs["Roughness"].default_value = material.roughness
        emissive = tuple(row.get("emissive", [0.0, 0.0, 0.0])[:3]) + (1.0,)
        emission_input = node.inputs.get("Emission Color") or node.inputs.get("Emission")
        if emission_input is not None:
            emission_input.default_value = emissive
    alpha_mode = row.get("alphaMode", "opaque")
    if alpha_mode != "opaque":
        material.surface_render_method = "DITHERED"
    material.use_backface_culling = not bool(row.get("doubleSided", False))
    return material


def add_primitive(part):
    primitive = part["primitive"]
    segments = int(part.get("segments", 32))
    rings = int(part.get("rings", 16))
    if primitive == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1.0)
    elif primitive == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=0.5)
    elif primitive == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=0.5, depth=1.0)
    elif primitive == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=segments, radius1=0.5, radius2=0.0, depth=1.0)
    elif primitive == "torus":
        bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=rings, major_radius=0.375, minor_radius=0.125)
    else:
        raise ValueError("unsupported primitive: " + str(primitive))
    obj = bpy.context.object
    obj.name = part["id"]
    obj.data.name = part["id"] + ".mesh"
    obj.location = position_to_blender(part.get("position"))
    obj.rotation_euler = rotation_to_blender(part.get("rotation"))
    obj.scale = scale_to_blender(part.get("scale"))
    for polygon in obj.data.polygons:
        polygon.use_smooth = part.get("shading", "flat") == "smooth"
    return obj


def add_modifier(obj, row, objects):
    kind = row["kind"]
    modifier = obj.modifiers.new(name=kind, type={
        "array": "ARRAY", "bevel": "BEVEL", "boolean": "BOOLEAN",
        "mirror": "MIRROR", "solidify": "SOLIDIFY",
    }[kind])
    if kind == "bevel":
        modifier.width = float(row.get("width", 0.05))
        modifier.segments = int(row.get("segments", 1))
    elif kind == "array":
        modifier.count = int(row["count"])
        modifier.use_relative_offset = False
        modifier.use_constant_offset = True
        modifier.constant_offset_displace = position_to_blender(row.get("offset", [1.0, 0.0, 0.0]))
    elif kind == "mirror":
        axis = authored_axis_to_blender(row.get("axis", "x"))
        modifier.use_axis = [axis == "x", axis == "y", axis == "z"]
    elif kind == "boolean":
        modifier.object = objects[row["target"]]
        modifier.operation = {"difference": "DIFFERENCE", "intersect": "INTERSECT", "union": "UNION"}[row["operation"]]
    elif kind == "solidify":
        modifier.thickness = float(row["thickness"])


def apply_operations(recipe, objects):
    for row in recipe.get("operations", []):
        if row["kind"] == "parent":
            child = objects[row["child"]]
            child.parent = objects[row["parent"]]
            child.matrix_parent_inverse = objects[row["parent"]].matrix_world.inverted()
        elif row["kind"] == "join":
            bpy.ops.object.select_all(action="DESELECT")
            selected = [objects[name] for name in row["inputs"]]
            for obj in selected:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = selected[0]
            bpy.ops.object.join()
            selected[0].name = row["id"]
            objects[row["id"]] = selected[0]
        else:
            raise ValueError("unsupported operation: " + str(row["kind"]))


def add_animations(recipe, objects):
    scene = bpy.context.scene
    scene.render.fps = 30
    for clip in sorted(recipe.get("animations", []), key=lambda row: row["id"]):
        frame_end = max(1, round(float(clip["duration"]) * scene.render.fps))
        scene.frame_end = max(scene.frame_end, frame_end)
        touched = []
        for track in sorted(clip["tracks"], key=lambda row: (row["node"], row["property"])):
            obj = objects[track["node"]]
            touched.append(obj)
            if obj.animation_data is None:
                obj.animation_data_create()
            action = bpy.data.actions.new(name=clip["id"] + "." + track["node"] + "." + track["property"])
            obj.animation_data.action = action
            data_path = {"position": "location", "rotation": "rotation_euler", "scale": "scale"}[track["property"]]
            for keyframe in track["keyframes"]:
                if track["property"] == "position":
                    value = position_to_blender(keyframe["value"])
                elif track["property"] == "rotation":
                    value = rotation_to_blender(keyframe["value"])
                else:
                    value = scale_to_blender(keyframe["value"])
                setattr(obj, data_path, value)
                frame = round(float(keyframe["time"]) * scene.render.fps)
                obj.keyframe_insert(data_path=data_path, frame=frame, group=clip["id"])
                for curve in action.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = "CONSTANT" if keyframe.get("interpolation") == "step" else "LINEAR"
            track_data = obj.animation_data.nla_tracks.new()
            track_data.name = clip["id"]
            strip = track_data.strips.new(clip["id"], 0, action)
            strip.action_frame_start = 0
            strip.action_frame_end = frame_end
            obj.animation_data.action = None
        for obj in touched:
            if obj.animation_data is not None:
                obj.animation_data.use_nla = True


def run(job_path):
    with open(job_path, "r", encoding="utf-8") as handle:
        job = json.load(handle)
    with open(job["recipePath"], "r", encoding="utf-8") as handle:
        recipe = json.load(handle)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.actions):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)

    materials = {row["id"]: create_material(row) for row in sorted(recipe.get("materials", []), key=lambda item: item["id"])}
    objects = {}
    for part in sorted(recipe["parts"], key=lambda item: item["id"]):
        obj = add_primitive(part)
        if part.get("material") is not None:
            obj.data.materials.append(materials[part["material"]])
        objects[part["id"]] = obj
    for part in sorted(recipe["parts"], key=lambda item: item["id"]):
        obj = objects[part["id"]]
        for modifier in part.get("modifiers", []):
            add_modifier(obj, modifier, objects)

    apply_operations(recipe, objects)
    add_animations(recipe, objects)
    bpy.ops.object.select_all(action="SELECT")
    os.makedirs(os.path.dirname(job["outputPath"]), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=job["outputPath"], export_format="GLB", use_selection=True,
        export_yup=True, export_animations=True, export_nla_strips=True,
        export_animation_mode="NLA_TRACKS",
        export_apply=False,
    )
    result = {
        "animations": sorted(row["id"] for row in recipe.get("animations", [])),
        "materials": sorted(materials.keys()),
        "nodes": sorted(objects.keys()),
        "ok": True,
        "outputPath": job["outputPath"],
    }
    with open(job["resultPath"], "w", encoding="utf-8") as handle:
        json.dump(result, handle, sort_keys=True)
        handle.write("\n")
    print(RESULT_PREFIX + json.dumps(result, sort_keys=True), flush=True)
    return result


if __name__ == "__main__":
    try:
        separator = sys.argv.index("--")
        arguments = sys.argv[separator + 1:]
        job_index = arguments.index("--job")
        run(os.path.abspath(arguments[job_index + 1]))
    except Exception as error:
        traceback.print_exc()
        fail(str(error))
        sys.exit(1)
