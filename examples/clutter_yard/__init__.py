"""clutter_yard: a dim-world-builder world for dimos sim2 (MuJoCo).

Files beside this one: scene.xml (MJCF), scene.json (dimos.scene.v1: entities, spawns), movers.json
(dimos.movers.v1: scripted obstacles), views.json (remembered camera views; render_view() looks from one), meshes/,
world.project.json (the editor's project) and scene_data.py (the
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
VIEWS_JSON = SCENE_DIR / "views.json"
# remembered camera views: each is a fixed <camera> in scene.xml named by its "camera" id
VIEWS: list[dict[str, Any]] = json.loads(VIEWS_JSON.read_text()).get("views", []) if VIEWS_JSON.exists() else []


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


def render_view(name: str, width: int = 640, height: int = 480, model: Any = None, data: Any = None) -> Any:
    """An RGB image (height x width x 3 uint8) from the remembered view `name` (see VIEWS).

    Without `model`/`data` it renders this world as exported; pass a running simulation's MjModel and MjData (whose
    scene includes this world's cameras) to see the live state, e.g. to check whether a task was done.
    """
    import mujoco

    if model is None:
        model = check()
    if data is None:
        data = mujoco.MjData(model)
        mujoco.mj_forward(model, data)
    camera = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_CAMERA, name)
    if camera < 0:
        known = [view["camera"] for view in VIEWS]
        raise KeyError(f"no camera {name!r} in the model (this world's views: {known})")
    width = min(width, int(model.vis.global_.offwidth))
    height = min(height, int(model.vis.global_.offheight))
    with mujoco.Renderer(model, height, width) as renderer:
        renderer.update_scene(data, camera=camera)
        return renderer.render()


def __getattr__(attribute: str) -> Any:
    # the go2 entry point (dimos run <world>.go2) is built on first use, not on import
    if attribute == "go2":
        return blueprint("unitree-go2-freewalk")
    raise AttributeError(attribute)


def main() -> None:
    model = check()
    print(
        f"{SCENE_XML}: {model.nbody} bodies, {model.ngeom} geoms, {len(MOVERS)} movers, spawns {sorted(SPAWNS)}, "
        f"views {[view['camera'] for view in VIEWS]}"
    )
