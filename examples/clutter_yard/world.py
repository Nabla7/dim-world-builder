"""clutter_yard: a dim-world-builder world for dimos sim2 (MuJoCo); `python -m clutter_yard.world` checks it.

Files beside this one: scene.xml (MJCF), scene.json (dimos.scene.v1: entities, spawns, movers; its extensions.dim_world_builder
holds the remembered camera views, the nav test and the editor's project), meshes/, textures/, scene_data.py (the SceneData module) and
blueprints.py (`go2`).
23 items, 1 floor(s).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import mujoco
import numpy as np
from numpy.typing import NDArray

SCENE_DIR = Path(__file__).resolve().parent
SCENE_XML = SCENE_DIR / "scene.xml"
SCENE_JSON = SCENE_DIR / "scene.json"

_scene = json.loads(SCENE_JSON.read_text())
_world = _scene.get("extensions", {}).get("dim_world_builder", {})
SPAWNS: dict[str, dict[str, Any]] = _scene.get("spawns", {})
ENTITIES: dict[str, dict[str, Any]] = _scene.get("entities", {})
MOVERS: list[dict[str, Any]] = _scene.get("movers", [])
# remembered camera views: each is a fixed <camera> in scene.xml named by its "camera" id
VIEWS: list[dict[str, Any]] = _world.get("views", [])
# the nav test: mapping path and goals (verify/nav_eval.py runs it)
NAV: dict[str, Any] = _world.get("nav", {})


def check() -> mujoco.MjModel:
    """Compile scene.xml with MuJoCo."""
    return mujoco.MjModel.from_xml_path(str(SCENE_XML))


def render_view(
    name: str,
    width: int = 640,
    height: int = 480,
    model: mujoco.MjModel | None = None,
    data: mujoco.MjData | None = None,
) -> NDArray[np.uint8]:
    """An RGB image (height x width x 3) from the remembered view `name` (see VIEWS).

    Without `model`/`data` it renders this world as exported; pass a running simulation's MjModel and MjData (whose
    scene includes this world's cameras) to see the live state, e.g. to check whether a task was done.
    """
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
    renderer = mujoco.Renderer(model, height, width)
    try:
        renderer.update_scene(data, camera=camera)
        image: NDArray[np.uint8] = renderer.render()
        return image
    finally:
        renderer.close()


def main() -> None:
    model = check()
    print(
        f"{SCENE_XML}: {model.nbody} bodies, {model.ngeom} geoms, {len(MOVERS)} movers, spawns {sorted(SPAWNS)}, "
        f"views {[view['camera'] for view in VIEWS]}"
    )


if __name__ == "__main__":
    main()
