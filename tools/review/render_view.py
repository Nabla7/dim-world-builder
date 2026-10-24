"""Render an immutable review snapshot using its source materials and lights.

Run inside Blender; request.json contains a validated browser camera and the
source calibration. Never save the loaded blend or tune exposure per viewpoint.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
import time

import bpy
from mathutils import Quaternion


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--device", default="AUTO")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])
    request = json.loads(args.request.read_text())
    actual_hash = hashlib.file_digest(Path(bpy.data.filepath).open("rb"), "sha256").hexdigest()
    if actual_hash != request["sourceSha256"]:
        raise ValueError("The saved scene does not match the requested revision.")
    started = time.monotonic()
    scene = bpy.context.scene
    prefs = bpy.context.preferences.addons["cycles"].preferences
    devices = [args.device] if args.device != "AUTO" else ["OPTIX", "METAL", "CUDA"]
    selected = None
    for backend in devices:
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            if any(device.type == backend for device in prefs.devices):
                for device in prefs.devices:
                    device.use = device.type == backend
                selected = backend
                break
        except (TypeError, RuntimeError):
            continue
    if selected is None:
        raise RuntimeError("No supported rendering GPU is available.")

    focus = request["focus"]
    if focus["cutHeight"] < 90:
        raise ValueError("Turn off the building cutaway before rendering this view.")
    camera = bpy.data.objects.new("Scene_review_render_camera", bpy.data.cameras.new("Scene_review_camera"))
    scene.collection.objects.link(camera)
    state = focus["camera"]
    camera.location = state["position"]
    x, y, z, w = state["quaternion"]
    camera.rotation_mode = "QUATERNION"
    camera.rotation_quaternion = Quaternion((w, x, y, z)).normalized()
    camera.data.clip_start = 0.02
    camera.data.clip_end = 1000
    scene.camera = camera
    width = 1280 if request["quality"] == "draft" else 1920
    aspect = state["aspect"]
    scene.render.pixel_aspect_x = 1
    scene.render.pixel_aspect_y = 1
    if focus["sourceSecond"] is not None:
        calibration = request["calibration"]
        original_w, original_h = calibration["width"], calibration["height"]
        fx, fy, cx, cy = (calibration["k"][i] for i in (0, 4, 2, 5))
        aspect = original_w / original_h
        camera.data.sensor_fit = "HORIZONTAL"
        camera.data.sensor_width = 36
        camera.data.lens = fx * 36 / original_w
        scene.render.pixel_aspect_y = fx / fy
        camera.data.shift_x = (original_w / 2 - cx) / original_w
        camera.data.shift_y = (cy - original_h / 2) * (fx / fy) / original_w
    else:
        camera.data.sensor_fit = "VERTICAL"
        camera.data.sensor_height = 24
        camera.data.lens = 12 / math.tan(math.radians(state["fov"]) / 2)
    scene.render.resolution_x = width
    scene.render.resolution_y = round(width / aspect)
    scene.render.resolution_percentage = 100
    scene.render.use_border = False
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = 32 if request["quality"] == "draft" else 128
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = str(args.output)
    # A scene's File Output nodes must not write outside the render job directory.
    if scene.compositing_node_group:
        for node in scene.compositing_node_group.nodes:
            if node.type == "OUTPUT_FILE":
                node.mute = True
    matrix = camera.calc_matrix_camera(
        bpy.context.evaluated_depsgraph_get(),
        x=scene.render.resolution_x,
        y=scene.render.resolution_y,
        scale_x=scene.render.pixel_aspect_x,
        scale_y=scene.render.pixel_aspect_y,
    )
    bpy.ops.render.render(write_still=True)
    result = {
        "revision": request["revision"],
        "sourceSha256": actual_hash,
        "camera": state,
        "sourceSecond": focus["sourceSecond"],
        "projection": [list(row) for row in matrix],
        "device": selected,
        "blender": bpy.app.version_string,
        "samples": scene.cycles.samples,
        "width": scene.render.resolution_x,
        "height": scene.render.resolution_y,
        "elapsedSeconds": round(time.monotonic() - started, 3),
    }
    args.output.with_suffix(".json").write_text(json.dumps(result, indent=2) + "\n")
    print("REVIEW_RENDER_COMPLETE", json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
