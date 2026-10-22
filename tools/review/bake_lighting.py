"""Bake the saved scene's static diffuse illumination without changing its source.

Blender --background SOURCE --disable-autoexec --python bake_lighting.py --
  --out EXPORT --baseline BASELINE_EXPORT [--pilot] [--samples 64]

The evaluated meshes retain source IDs, positions, normals and original UVs.
Temporary joined receivers only reduce bake overhead; every room still participates
in light transport. Per-corner correspondence returns the atlas UVs to each source.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import ctypes
import hashlib
import json
import math
from pathlib import Path
import runpy
import shutil
import sys
import time

import bpy
from mathutils import Vector
import numpy as np


UV_NAME = "ReviewLightUV"
PIPELINE = "fraction-atlas-oidn-v2"


def denoise(rgb: np.ndarray) -> np.ndarray:
    """Use Blender's bundled OpenImageDenoise on linear diffuse radiance."""
    library = Path(bpy.app.binary_path).parents[1] / "Resources/lib/libOpenImageDenoise.dylib"
    lib = ctypes.CDLL(str(library))
    pointer = ctypes.c_void_p
    lib.oidnNewDevice.argtypes, lib.oidnNewDevice.restype = [ctypes.c_int], pointer
    lib.oidnCommitDevice.argtypes = [pointer]
    lib.oidnNewFilter.argtypes, lib.oidnNewFilter.restype = [pointer, ctypes.c_char_p], pointer
    lib.oidnSetSharedFilterImage.argtypes = [pointer, ctypes.c_char_p, pointer, ctypes.c_int,
                                           ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t,
                                           ctypes.c_size_t, ctypes.c_size_t]
    lib.oidnSetFilterBool.argtypes = [pointer, ctypes.c_char_p, ctypes.c_bool]
    lib.oidnCommitFilter.argtypes = [pointer]
    lib.oidnExecuteFilter.argtypes = [pointer]
    lib.oidnReleaseFilter.argtypes = [pointer]
    lib.oidnReleaseDevice.argtypes = [pointer]
    lib.oidnGetDeviceError.argtypes = [pointer, ctypes.POINTER(ctypes.c_char_p)]
    device = lib.oidnNewDevice(1)  # CPU, leaving Metal for Cycles.
    lib.oidnCommitDevice(device)
    filter_ = lib.oidnNewFilter(device, b"RT")
    source = np.ascontiguousarray(rgb, dtype=np.float32)
    result = np.empty_like(source)
    height, width, _ = source.shape
    try:
        for name, array in [(b"color", source), (b"output", result)]:
            lib.oidnSetSharedFilterImage(filter_, name, array.ctypes.data, 3,
                                        width, height, 0, 12, width * 12)
        lib.oidnSetFilterBool(filter_, b"hdr", True)
        lib.oidnCommitFilter(filter_)
        lib.oidnExecuteFilter(filter_)
        message = ctypes.c_char_p()
        code = lib.oidnGetDeviceError(device, ctypes.byref(message))
        if code:
            raise RuntimeError(f"OpenImageDenoise: {message.value!r}")
        return np.maximum(result, 0)
    finally:
        lib.oidnReleaseFilter(filter_)
        lib.oidnReleaseDevice(device)


def report(event: str, **values) -> None:
    print("REVIEW_BAKE " + json.dumps({"event": event, **values}), flush=True)


def material_needs_diffuse(material) -> bool:
    if not material or not material.node_tree:
        return True
    bsdf = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    return bsdf is None or (
        bsdf.inputs["Metallic"].default_value < .9
        and bsdf.inputs["Transmission Weight"].default_value < .2
    )


def receiver_material(material, image):
    """Keep procedural generated/object coordinates after joining receivers."""
    copy = material.copy()
    tree = copy.node_tree
    generated = tree.nodes.new("ShaderNodeAttribute")
    generated.attribute_name = "review_generated"
    object_co = tree.nodes.new("ShaderNodeAttribute")
    object_co.attribute_name = "review_object_co"
    for node in list(tree.nodes):
        if node.type == "TEX_NOISE" and not node.inputs["Vector"].is_linked:
            tree.links.new(generated.outputs["Vector"], node.inputs["Vector"])
        if node.type == "TEX_COORD":
            for output, replacement in [("Generated", generated), ("Object", object_co)]:
                if output == "Object" and node.object:
                    continue  # Explicit external object coordinates are already stable.
                for link in list(node.outputs[output].links):
                    tree.links.new(replacement.outputs["Vector"], link.to_socket)
    target = tree.nodes.new("ShaderNodeTexImage")
    target.image = image
    tree.nodes.active = target
    return copy


def make_display_lut(scene, out: Path) -> dict:
    """Sample Blender's actual view transform/look, including its display encoding."""
    size, low, high = 65, -12.0, 8.0
    values = np.exp2(np.linspace(low, high, size, dtype=np.float32))
    values[0] = 0
    pixels = np.ones((size, size, size, 4), dtype=np.float32)  # green, blue, red
    pixels[..., 0] = values[None, None, :]
    pixels[..., 1] = values[:, None, None]
    pixels[..., 2] = values[None, :, None]
    image = bpy.data.images.new("Review display transform", size * size, size, float_buffer=True)
    image.pixels.foreach_set(pixels.ravel())
    settings = scene.render.image_settings
    old = (settings.file_format, settings.color_mode, settings.color_depth)
    settings.file_format, settings.color_mode, settings.color_depth = "PNG", "RGB", "16"
    image.save_render(str(out / "lighting/display.png"), scene=scene)
    settings.file_format, settings.color_mode, settings.color_depth = old
    bpy.data.images.remove(image)
    return {"file": "lighting/display.png", "size": size, "minEv": low, "maxEv": high,
            "view": scene.view_settings.view_transform, "look": scene.view_settings.look,
            "exposure": scene.view_settings.exposure, "gamma": scene.view_settings.gamma}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--samples", type=int, default=64)
    parser.add_argument("--density", type=float, default=56)
    parser.add_argument("--pilot", action="store_true")
    parser.add_argument("--revision", default="V11-Cycles-lighting")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    out = args.out.resolve()
    if out == args.baseline.resolve():
        raise ValueError("Use a new derived export directory.")
    (out / "lighting").mkdir(parents=True, exist_ok=True)
    source = Path(bpy.data.filepath)
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "METAL"
    scene.cycles.device = "GPU"
    scene.cycles.samples = args.samples
    scene.cycles.use_adaptive_sampling = False
    scene.render.use_persistent_data = True
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 8
    scene.render.bake.margin_type = "EXTEND"
    scene.render.bake.use_selected_to_active = False
    start = time.monotonic()
    collection = bpy.data.collections.new("Review evaluated geometry")
    scene.collection.children.link(collection)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    originals = [o for o in scene.objects if o.type in {"MESH", "CURVE", "FONT", "SURFACE"} and not o.hide_render]
    copies, rows = [], []
    for index, original in enumerate(originals):
        evaluated = original.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        if not mesh.polygons:
            bpy.data.meshes.remove(mesh)
            continue
        obj = bpy.data.objects.new(f"ReviewReceiver_{index}", mesh)
        collection.objects.link(obj)
        obj.matrix_world = original.matrix_world.copy()
        obj["review_id"] = original.name
        obj["source_collection"] = original.users_collection[0].name if original.users_collection else ""
        if not mesh.uv_layers:
            mesh.uv_layers.new(name="OriginalUV")
        mesh.uv_layers[0].active_render = True
        mesh.uv_layers.new(name=UV_NAME)
        points = np.empty(len(mesh.vertices) * 3, np.float32)
        mesh.vertices.foreach_get("co", points)
        points = points.reshape(-1, 3)
        lo, hi = points.min(axis=0), points.max(axis=0)
        for name, values in [("review_generated", (points - lo) / np.maximum(hi - lo, 1e-8)),
                             ("review_object_co", points)]:
            mesh.attributes.new(name, "FLOAT_VECTOR", "POINT").data.foreach_set("vector", values.ravel())
        mesh.attributes.new("review_object", "INT", "CORNER").data.foreach_set(
            "value", np.full(len(mesh.loops), len(copies), np.int32))
        mesh.attributes.new("review_loop", "INT", "CORNER").data.foreach_set(
            "value", np.arange(len(mesh.loops), dtype=np.int32))
        corners = [obj.matrix_world @ Vector(c) for c in evaluated.bound_box]
        minimum = np.min([tuple(v) for v in corners], axis=0)
        maximum = np.max([tuple(v) for v in corners], axis=0)
        # Actual transformed area, without changing the mesh used by export.
        world_mesh = mesh.copy()
        world_mesh.transform(obj.matrix_world)
        area = sum(p.area for p in world_mesh.polygons)
        bpy.data.meshes.remove(world_mesh)
        center = (minimum + maximum) / 2
        eligible = any(material_needs_diffuse(m) for m in mesh.materials)
        pilot = center[0] < 5.2 and 13.7 < center[1] < 17.6 and 4.8 < center[2] < 6.6
        rows.append({"id": original.name, "area": area, "faces": len(mesh.polygons),
                     "center": center.tolist(), "eligible": eligible,
                     "pilot": bool(pilot)})
        copies.append(obj)
        if index % 2000 == 0:
            report("prepare", objects=index, total=len(originals))
    for original in originals:
        original.hide_render = True
    groups = defaultdict(list)
    for index, row in enumerate(rows):
        if not row["eligible"] or (args.pilot and not row["pilot"]):
            continue
        cell = tuple(math.floor(v / s) for v, s in zip(row["center"], [6, 6, 4]))
        key = ("large", index) if row["area"] > 130 else ("cell", *cell)
        groups[str(key)].append(index)
    batches = []
    for key in sorted(groups):
        batch, area, faces = [], 0, 0
        for index in groups[key]:
            row = rows[index]
            if batch and (area + row["area"] > 300 or faces + row["faces"] > 90000):
                batches.append(batch)
                batch, area, faces = [], 0, 0
            batch.append(index)
            area += row["area"]
            faces += row["faces"]
        if batch:
            batches.append(batch)
    lighting = {"kind": "cycles-diffuse", "source_sha256": source_sha,
                "samples": args.samples, "density": args.density, "pilot": args.pilot,
                "atlases": [], "objects": {}, "display": make_display_lut(scene, out),
                "exclusions": [r["id"] for r in rows if not r["eligible"]]}
    report("plan", objects=len(copies), receivers=sum(len(b) for b in batches),
           batches=len(batches), area=sum(rows[i]["area"] for b in batches for i in b))
    for tile, indices in enumerate(batches):
        tick = time.monotonic()
        area = sum(rows[i]["area"] for i in indices)
        # Dense props need enough room for chart padding as well as surface area.
        faces = sum(rows[i]["faces"] for i in indices)
        requested = max(args.density * math.sqrt(max(area, .1) / .6), 8 * math.sqrt(faces))
        resolution = min(4096, max(256, 2 ** math.ceil(math.log2(requested))))
        name = f"atlas_{tile:03d}"
        cache = out / f"lighting/{name}_uv.npz"
        exr = out / f"lighting/{name}.exr"
        signature = hashlib.sha256(json.dumps([PIPELINE, source_sha, args.samples, args.density, indices]).encode()).hexdigest()
        metadata_path = out / f"lighting/{name}.json"
        resumed = metadata_path.exists() and cache.exists() and exr.exists() and json.loads(metadata_path.read_text()).get("signature") == signature
        if resumed:
            with np.load(cache) as data:
                for index in indices:
                    copies[index].data.uv_layers[UV_NAME].data.foreach_set("uv", data[str(index)].ravel())
            meta = json.loads(metadata_path.read_text())
            report("resume", tile=tile)
        else:
            bpy.ops.object.select_all(action="DESELECT")
            temporary = []
            for index in indices:
                copy = copies[index].copy()
                # Join modifies its active mesh. Each duplicate owns its mesh.
                copy.data = copies[index].data.copy()
                collection.objects.link(copy)
                copy.select_set(True)
                temporary.append(copy)
            bpy.context.view_layer.objects.active = temporary[0]
            bpy.ops.object.join()
            receiver = bpy.context.object
            receiver.name = f"Review bake {tile}"
            for index in indices:
                copies[index].hide_render = True
            mesh = receiver.data
            mesh.uv_layers.active = mesh.uv_layers[UV_NAME]
            report("unwrap", tile=tile, objects=len(indices), faces=len(mesh.polygons), area=round(area, 2), resolution=resolution)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0, area_weight=0, correct_aspect=True, scale_to_bounds=True)
            bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method="FRACTION",
                                    margin=18 / resolution, shape_method="AABB")
            bpy.ops.object.mode_set(mode="OBJECT")
            uv = np.empty(len(mesh.loops) * 2, np.float32)
            ids, loops = np.empty(len(mesh.loops), np.int32), np.empty(len(mesh.loops), np.int32)
            mesh.uv_layers[UV_NAME].data.foreach_get("uv", uv)
            mesh.attributes["review_object"].data.foreach_get("value", ids)
            mesh.attributes["review_loop"].data.foreach_get("value", loops)
            uv = uv.reshape(-1, 2)
            saved_uv = {}
            for index in indices:
                mask = ids == index
                mapped = np.empty((len(copies[index].data.loops), 2), np.float32)
                mapped[loops[mask]] = uv[mask]
                copies[index].data.uv_layers[UV_NAME].data.foreach_set("uv", mapped.ravel())
                saved_uv[str(index)] = mapped
            np.savez_compressed(cache, **saved_uv)
            image = bpy.data.images.new(name, resolution, resolution, float_buffer=True)
            image.colorspace_settings.name = "Non-Color"
            receiver_mats = []
            for slot in receiver.material_slots:
                if slot.material:
                    slot.material = receiver_material(slot.material, image)
                    receiver_mats.append(slot.material)
            report("trace", tile=tile, samples=args.samples)
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, uv_layer=UV_NAME)
            pixels = np.empty(resolution * resolution * 4, np.float32)
            image.pixels.foreach_get(pixels)
            rgba = pixels.reshape(resolution, resolution, 4)
            rgb = rgba[:, :, :3]
            if not np.isfinite(rgb).all():
                raise ValueError(f"Nonfinite lighting in {name}")
            report("denoise", tile=tile)
            rgba[:, :, :3] = denoise(rgb)
            image.pixels.foreach_set(pixels)
            settings = scene.render.image_settings
            old_settings = (settings.file_format, settings.color_mode, settings.color_depth, settings.exr_codec)
            settings.file_format, settings.color_mode = "OPEN_EXR", "RGB"
            settings.color_depth, settings.exr_codec = "16", "ZIP"
            image.save_render(str(exr), scene=scene)
            settings.file_format, settings.color_mode, settings.color_depth, settings.exr_codec = old_settings
            meta = {"signature": signature, "file": f"lighting/{name}.exr", "size": resolution,
                    "objects": len(indices), "area": area, "seconds": round(time.monotonic() - tick, 2),
                    "max": float(rgb.max()), "mean": float(rgb.mean()), "denoiser": "OpenImageDenoise RT"}
            metadata_path.write_text(json.dumps(meta, indent=2))
            bpy.data.objects.remove(receiver, do_unlink=True)
            bpy.data.meshes.remove(mesh)
            for material in receiver_mats:
                bpy.data.materials.remove(material)
            bpy.data.images.remove(image)
            for index in indices:
                copies[index].hide_render = False
            report("baked", tile=tile, **meta)
        lighting["atlases"].append(meta)
        for index in indices:
            lighting["objects"][rows[index]["id"]] = tile
    lighting["seconds"] = round(time.monotonic() - start, 2)
    (out / "lighting.json").write_text(json.dumps(lighting, indent=2))
    sys.argv = ["export_blender.py", "--", "--out", str(out), "--revision", args.revision,
                "--lighting", str(out / "lighting.json")]
    runpy.run_path(str(Path(__file__).with_name("export_blender.py")), run_name="__main__")
    shutil.copy2(args.baseline / "evidence.json", out / "evidence.json")
    evidence = json.loads((out / "evidence.json").read_text())
    evidence["render_source_sha256"] = source_sha  # Same immutable Blender source and illumination.
    (out / "evidence.json").write_text(json.dumps(evidence, indent=2))
    if not (out / "views").exists():
        (out / "views").symlink_to((args.baseline / "views").resolve(), target_is_directory=True)
    report("complete", seconds=round(time.monotonic() - start, 2), atlases=len(batches), out=str(out))


if __name__ == "__main__":
    main()
