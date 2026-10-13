"""Shapes -> a World Builder project (dim-world-builder.project.v1): one primitive item per shape, one floor per storey."""

import json
import urllib.request
import uuid
from pathlib import Path

import numpy as np

from shapes import Shape

COLORS = {
    "floor": [0.66, 0.64, 0.6],
    "ceiling": [0.85, 0.85, 0.85],
    "horizontal": [0.55, 0.42, 0.3],
    "wall": [0.93, 0.92, 0.9],
    "ramp": [0.9, 0.6, 0.2],
    "clutter": [0.35, 0.55, 0.75],
}
NAMES = {"floor": "Floor", "ceiling": "Ceiling", "horizontal": "Surface", "wall": "Wall", "ramp": "Ramp",
         "clutter": "Clutter"}


def item_for(shape: Shape, floor_id: str, elevation: float, count: int) -> dict:
    base = shape.center.copy()
    base[2] -= shape.size[2] / 2 + elevation
    half = shape.yaw / 2
    return {
        "id": uuid.uuid4().hex[:12],
        "kind": "primitive",
        "params": {"shape": shape.kind, "color": COLORS.get(shape.role, [0.6, 0.6, 0.6])},
        "name": f"{NAMES.get(shape.role, shape.role)} {count}",
        "floor": floor_id,
        "position": [round(float(v), 4) for v in base],
        "rotation": [0, 0, round(float(np.sin(half)), 6), round(float(np.cos(half)), 6)],
        "scale": [round(float(v), 4) for v in shape.size],
    }


def build_project(name: str, shapes: list[Shape], storey_heights: list[float]) -> dict:
    heights = sorted(storey_heights) or [0.0]
    floors = [{"id": "ground" if i == 0 else f"storey_{i + 1}", "name": f"Floor {i + 1}", "elevation": round(h, 3)}
              for i, h in enumerate(heights)]
    counts: dict[str, int] = {}
    items = []
    for shape in shapes:
        bottom = shape.center[2] - shape.size[2] / 2
        # the highest storey at or below its bottom (a floor slab's top is its storey)
        top = shape.center[2] + shape.size[2] / 2
        reference = top if shape.role == "floor" else bottom
        index = max([i for i, h in enumerate(heights) if h <= reference + 0.15] or [0])
        counts[shape.role] = counts.get(shape.role, 0) + 1
        items.append(item_for(shape, floors[index]["id"], heights[index], counts[shape.role]))
    return {
        "format": "dim-world-builder.project.v1",
        "name": name,
        "floors": floors,
        "items": items,
        "spawns": [],
        "activeFloor": "ground",
        "annotations": [],
    }


def write_project(path: Path, name: str, shapes: list[Shape], storey_heights: list[float]) -> None:
    path.write_text(json.dumps(build_project(name, shapes, storey_heights), indent=1))


def save_to_app(project_path: Path, url: str) -> str:
    """POST the project to a running World Builder (through dimOS Desktop); returns the name it was saved under"""
    project = json.loads(project_path.read_text())
    request = urllib.request.Request(
        f"{url.rstrip('/')}/api/project", data=json.dumps({"project": project}).encode(),
        headers={"content-type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read())["saved"]
