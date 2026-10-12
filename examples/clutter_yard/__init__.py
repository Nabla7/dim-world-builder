"""clutter_yard: a dim-world-builder world for dimos sim2 (MuJoCo).

Files beside this one: scene.xml (MJCF), scene.json (dimos.scene.v1: entities, spawns), movers.json
(dimos.movers.v1: scripted obstacles), meshes/, world.project.json (the editor's project) and scene_data.py (the
SceneData module: publish on scene_data_request, get the world's bodies, meshes and lights on scene_data).
25 items, 1 floor(s).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any

SCENE_DIR = Path(__file__).resolve().parent
SCENE_XML = SCENE_DIR / "scene.xml"
SCENE_JSON = SCENE_DIR / "scene.json"
MOVERS_JSON = SCENE_DIR / "movers.json"
PROJECT_JSON = SCENE_DIR / "world.project.json"

_scene = json.loads(SCENE_JSON.read_text())
SPAWNS: dict[str, dict[str, Any]] = _scene.get("spawns", {})
ENTITIES: dict[str, dict[str, Any]] = _scene.get("entities", {})
MOVERS: list[dict[str, Any]] = json.loads(MOVERS_JSON.read_text()).get("movers", [])


def check() -> Any:
    """Compile scene.xml with MuJoCo; returns the MjModel."""
    import mujoco

    return mujoco.MjModel.from_xml_path(str(SCENE_XML))


def blueprint(robot: str = "unitree-go2-freewalk", scene_data: bool = True) -> Any:
    """A dimos blueprint for `robot` in this world (sets the global scene package first), plus the SceneData module
    (scene_data_request -> scene_data) so frontends can draw the world."""
    from dimos.core.global_config import global_config

    global_config.update(simulation="mujoco", scene_package=str(SCENE_DIR))
    from dimos.robot.get_all_blueprints import get_blueprint_by_name

    robot_blueprint = get_blueprint_by_name(robot)
    if not scene_data:
        return robot_blueprint
    # module workers import SceneData by this package's name, so they need its parent on their path
    parent = str(SCENE_DIR.parent)
    paths = [p for p in os.environ.get("PYTHONPATH", "").split(os.pathsep) if p]
    if parent not in paths:
        os.environ["PYTHONPATH"] = os.pathsep.join([parent, *paths])
    if parent not in sys.path:
        sys.path.insert(0, parent)
    from dimos.core.coordination.blueprints import autoconnect

    from .scene_data import SceneData

    return autoconnect(robot_blueprint, SceneData.blueprint())


def main() -> None:
    model = check()
    print(f"{SCENE_XML}: {model.nbody} bodies, {model.ngeom} geoms, {len(MOVERS)} movers, spawns {sorted(SPAWNS)}")
