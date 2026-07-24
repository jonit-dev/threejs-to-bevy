"""Owned Blender background runner for bounded ThreeNative recipes.

This file deliberately contains no dynamic code evaluation or arbitrary Blender
operator dispatch. Every accepted recipe field reaches a named handler below.
"""

import json
import math
import os
import sys
import traceback

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


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


def attach_material_textures(material, row, texture_paths):
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is None:
        return
    texture = row.get("texture")
    if texture is not None:
        image_node = material.node_tree.nodes.new("ShaderNodeTexImage")
        image_node.image = bpy.data.images.load(texture_paths[texture])
        material.node_tree.links.new(image_node.outputs["Color"], node.inputs["Base Color"])
        if row.get("alphaMode", "opaque") == "opaque":
            image_node.image.alpha_mode = "NONE"
    normal_texture = row.get("normalTexture")
    if normal_texture is not None:
        normal_image_node = material.node_tree.nodes.new("ShaderNodeTexImage")
        normal_image_node.image = bpy.data.images.load(texture_paths[normal_texture])
        normal_image_node.image.colorspace_settings.name = "Non-Color"
        normal_map_node = material.node_tree.nodes.new("ShaderNodeNormalMap")
        material.node_tree.links.new(normal_image_node.outputs["Color"], normal_map_node.inputs["Color"])
        material.node_tree.links.new(normal_map_node.outputs["Normal"], node.inputs["Normal"])


def scale_part_uvs(obj, factor):
    layer = obj.data.uv_layers.active
    if layer is None:
        return
    for item in layer.data:
        item.uv[0] *= factor
        item.uv[1] *= factor


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


def override_source_material(row):
    material = bpy.data.materials.get(row["id"])
    if material is None:
        raise ValueError("source material was not found: " + row["id"])
    node = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
    if "baseColor" in row:
        color = tuple(row["baseColor"][:3]) + (
            float(row["baseColor"][3]) if len(row["baseColor"]) == 4 else 1.0,
        )
        material.diffuse_color = color
        if node is not None:
            node.inputs["Base Color"].default_value = color
    if "metallic" in row:
        material.metallic = float(row["metallic"])
        if node is not None:
            socket = node.inputs["Metallic"]
            for link in list(socket.links):
                material.node_tree.links.remove(link)
            socket.default_value = material.metallic
    if "roughness" in row:
        material.roughness = float(row["roughness"])
        if node is not None:
            socket = node.inputs["Roughness"]
            for link in list(socket.links):
                material.node_tree.links.remove(link)
            socket.default_value = material.roughness
    if "emissive" in row and node is not None:
        emissive = tuple(row["emissive"][:3]) + (1.0,)
        emission_input = node.inputs.get("Emission Color") or node.inputs.get("Emission")
        if emission_input is not None:
            emission_input.default_value = emissive
    if row.get("alphaMode", "opaque") != "opaque":
        material.surface_render_method = "DITHERED"
    if "doubleSided" in row:
        material.use_backface_culling = not bool(row["doubleSided"])
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


def authored_coordinate(coordinate, axis):
    """Read a Blender-local mesh coordinate in the recipe's authored Y-up space."""
    if axis == "x":
        return float(coordinate.x)
    if axis == "y":
        return float(coordinate.z)
    return -float(coordinate.y)


def retain_source_split_side(obj, axis, threshold, positive):
    mesh = obj.data
    editable = bmesh.new()
    editable.from_mesh(mesh)
    removed = [
        vertex
        for vertex in editable.verts
        if (authored_coordinate(vertex.co, axis) > threshold) != positive
    ]
    bmesh.ops.delete(editable, geom=removed, context="VERTS")
    if not editable.verts or not editable.faces:
        editable.free()
        raise ValueError("source split produced an empty mesh: " + obj.name)
    editable.to_mesh(mesh)
    editable.free()
    mesh.update()


def apply_source_operations(recipe, objects):
    for row in recipe.get("operations", []):
        if row["kind"] == "decimate":
            ratio = float(row["ratio"])
            for source_name in sorted(objects):
                source = objects[source_name]
                if source.type != "MESH" or len(source.data.polygons) == 0:
                    continue
                modifier = source.modifiers.new(name="ThreeNativeDecimate", type="DECIMATE")
                modifier.decimate_type = "COLLAPSE"
                modifier.ratio = ratio
                modifier.use_collapse_triangulate = True
                bpy.context.view_layer.objects.active = source
                source.select_set(True)
                bpy.ops.object.modifier_apply(modifier=modifier.name)
                source.select_set(False)
            continue
        if row["kind"] == "transform":
            source = objects[row["node"]]
            if "position" in row:
                source.location = relative_transform("location", row["position"], source.location.copy())
            if "rotation" in row:
                source.rotation_mode = "XYZ"
                baseline = source.matrix_basis.to_quaternion()
                source.rotation_euler = relative_transform("rotation_euler", row["rotation"], baseline)
            if "scale" in row:
                source.scale = relative_transform("scale", row["scale"], source.scale.copy())
            bpy.context.view_layer.update()
            continue
        if row["kind"] != "split-by-axis":
            raise ValueError("unsupported source operation: " + str(row["kind"]))
        source_name = row["node"]
        source = objects[source_name]
        if source.type != "MESH":
            raise ValueError("source split target is not a mesh: " + source_name)
        if source.animation_data is not None:
            raise ValueError("source split target already owns animation data: " + source_name)
        negative_name = row["negative"]
        positive_name = row["positive"]
        if bpy.data.objects.get(negative_name) is not None or bpy.data.objects.get(positive_name) is not None:
            raise ValueError("source split output name collides with an imported node")
        axis = row["axis"]
        threshold = float(row["threshold"])
        epsilon = 1e-6
        for polygon in source.data.polygons:
            coordinates = [authored_coordinate(source.data.vertices[index].co, axis) for index in polygon.vertices]
            if any(abs(value - threshold) <= epsilon for value in coordinates):
                raise ValueError("source split threshold intersects a mesh vertex: " + source_name)
            if min(coordinates) < threshold < max(coordinates):
                raise ValueError("source split threshold intersects a mesh face: " + source_name)

        positive = source.copy()
        positive.data = source.data.copy()
        for collection in source.users_collection:
            collection.objects.link(positive)
        source.name = negative_name
        source.data.name = negative_name + ".mesh"
        positive.name = positive_name
        positive.data.name = positive_name + ".mesh"
        retain_source_split_side(source, axis, threshold, False)
        retain_source_split_side(positive, axis, threshold, True)
        del objects[source_name]
        objects[negative_name] = source
        objects[positive_name] = positive


def relative_transform(data_path, value, baseline):
    if data_path == "location":
        return Vector(baseline) + Vector(position_to_blender(value))
    if data_path == "rotation_euler":
        offset = rotation_to_blender(value).to_quaternion()
        return (baseline @ offset).to_euler("XYZ")
    authored_scale = scale_to_blender(value)
    return tuple(float(baseline[index]) * authored_scale[index] for index in range(3))


def prepare_source_animation_pivots(recipe, objects):
    pivots = {}
    pivot_values = {}
    for clip in sorted(recipe.get("animations", []), key=lambda row: row["id"]):
        for track in sorted(clip["tracks"], key=lambda row: (row["node"], row["property"])):
            if "pivot" not in track:
                continue
            if track["property"] != "rotation":
                raise ValueError("source animation pivots require rotation tracks")
            node = track["node"]
            value = vec3(track["pivot"], [0.0, 0.0, 0.0])
            if node in pivot_values:
                if any(abs(left - right) > 1e-9 for left, right in zip(pivot_values[node], value)):
                    raise ValueError("source animation node uses conflicting pivots: " + node)
                continue
            target = objects[node]
            pivot_name = node + ".ThreeNativePivot"
            if bpy.data.objects.get(pivot_name) is not None:
                raise ValueError("source animation pivot name collides with imported node: " + pivot_name)
            target_world = target.matrix_world.copy()
            original_parent = target.parent
            pivot = bpy.data.objects.new(pivot_name, None)
            bpy.context.scene.collection.objects.link(pivot)
            pivot.rotation_mode = "XYZ"
            pivot.parent = original_parent
            pivot.matrix_world = Matrix.Translation(Vector(position_to_blender(value)))
            target.parent = pivot
            target.matrix_world = target_world
            pivots[node] = pivot
            pivot_values[node] = value
    return pivots


def unwrap_euler(value, previous):
    if previous is None:
        return value
    unwrapped = list(value)
    for index in range(3):
        while unwrapped[index] - previous[index] > math.pi:
            unwrapped[index] -= math.tau
        while unwrapped[index] - previous[index] < -math.pi:
            unwrapped[index] += math.tau
    return Euler(tuple(unwrapped), "XYZ")


def action_fcurves(action):
    curves = []
    seen = set()
    for curve in action.fcurves:
        if curve.as_pointer() not in seen:
            seen.add(curve.as_pointer())
            curves.append(curve)
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for channelbag in getattr(strip, "channelbags", []):
                for curve in channelbag.fcurves:
                    if curve.as_pointer() not in seen:
                        seen.add(curve.as_pointer())
                        curves.append(curve)
    return curves


def restore_animation_baselines(scene, animated_objects, baselines):
    """Disable NLA scene evaluation and restore each object's authored pose."""
    for name, obj in animated_objects.items():
        if obj.animation_data is not None:
            obj.animation_data.action = None
            for track in obj.animation_data.nla_tracks:
                track.mute = True
        obj.matrix_basis = baselines[name]["matrix_basis"]
    scene.frame_set(scene.frame_start)


def add_animations(recipe, objects, relative=False):
    scene = bpy.context.scene
    scene.render.fps = 30
    pivots = prepare_source_animation_pivots(recipe, objects) if relative else {}
    animated_objects = {**objects, **pivots}
    baselines = {
        name: {
            "location": obj.location.copy(),
            "matrix_basis": obj.matrix_basis.copy(),
            "rotation_euler": obj.matrix_basis.to_quaternion(),
            "scale": obj.scale.copy(),
        }
        for name, obj in animated_objects.items()
    }
    for clip in sorted(recipe.get("animations", []), key=lambda row: row["id"]):
        frame_end = max(1, round(float(clip["duration"]) * scene.render.fps))
        scene.frame_start = 0
        scene.frame_end = max(scene.frame_end, frame_end)
        touched = []
        action = bpy.data.actions.new(name=clip["id"])
        for track in sorted(clip["tracks"], key=lambda row: (row["node"], row["property"])):
            obj = pivots.get(track["node"], objects[track["node"]]) if track["property"] == "rotation" else objects[track["node"]]
            touched.append(obj)
            if track["property"] == "rotation":
                obj.rotation_mode = "XYZ"
            if obj.animation_data is None:
                obj.animation_data_create()
            obj.animation_data.action = action
            data_path = {"position": "location", "rotation": "rotation_euler", "scale": "scale"}[track["property"]]
            previous_rotation = None
            for keyframe in track["keyframes"]:
                if track["property"] == "position":
                    value = position_to_blender(keyframe["value"])
                elif track["property"] == "rotation":
                    value = rotation_to_blender(keyframe["value"])
                else:
                    value = scale_to_blender(keyframe["value"])
                if relative:
                    value = relative_transform(data_path, keyframe["value"], baselines[track["node"]][data_path])
                if track["property"] == "rotation":
                    value = unwrap_euler(value, previous_rotation)
                    previous_rotation = value.copy()
                setattr(obj, data_path, value)
                frame = round(float(keyframe["time"]) * scene.render.fps)
                obj.keyframe_insert(data_path=data_path, frame=frame, group=clip["id"])
                for curve in action_fcurves(action):
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
    # NLA strips are retained so Blender's ACTIONS exporter can associate the
    # shared clip with every animated object. Mute their scene evaluation and
    # restore the authored bind pose before export; otherwise overlapping
    # frame-zero strips bake the first frame of the last clip into the GLB node
    # transforms (for example, neutral flaps/rudders export deflected).
    restore_animation_baselines(scene, animated_objects, baselines)
    bpy.context.view_layer.update()


def import_source(source_path):
    bpy.ops.import_scene.gltf(filepath=source_path)
    objects = {}
    for obj in bpy.context.scene.objects:
        if obj.name in objects:
            raise ValueError("ambiguous imported node name: " + obj.name)
        objects[obj.name] = obj
    if not objects:
        raise ValueError("source GLB imported no objects")
    return objects


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

    source_path = job.get("sourcePath")
    materials = {}
    if source_path is not None:
        objects = import_source(source_path)
        for row in sorted(recipe.get("materials", []), key=lambda item: item["id"]):
            override_source_material(row)
        apply_source_operations(recipe, objects)
    else:
        texture_paths = job.get("texturePaths", {})
        material_rows = {row["id"]: row for row in recipe.get("materials", [])}
        materials = {}
        for row in sorted(recipe.get("materials", []), key=lambda item: item["id"]):
            materials[row["id"]] = create_material(row)
            attach_material_textures(materials[row["id"]], row, texture_paths)
        objects = {}
        for part in sorted(recipe["parts"], key=lambda item: item["id"]):
            obj = add_primitive(part)
            if part.get("material") is not None:
                obj.data.materials.append(materials[part["material"]])
                texture_scale = material_rows[part["material"]].get("textureScale")
                if texture_scale is not None:
                    scale_part_uvs(obj, float(texture_scale))
            objects[part["id"]] = obj
        for part in sorted(recipe["parts"], key=lambda item: item["id"]):
            obj = objects[part["id"]]
            for modifier in part.get("modifiers", []):
                add_modifier(obj, modifier, objects)
        apply_operations(recipe, objects)

    add_animations(recipe, objects, relative=source_path is not None)
    bpy.ops.object.select_all(action="SELECT")
    os.makedirs(os.path.dirname(job["outputPath"]), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=job["outputPath"], export_format="GLB", use_selection=True,
        export_yup=True, export_animations=True, export_nla_strips=True,
        export_animation_mode="ACTIONS", export_merge_animation="ACTION",
        export_apply=False,
    )
    result = {
        "animations": sorted(row["id"] for row in recipe.get("animations", [])),
        "materials": sorted(material.name for material in bpy.data.materials),
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
