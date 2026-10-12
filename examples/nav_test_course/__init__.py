"""nav_test_course: a dim-world-builder world for dimos sim2 (MuJoCo).

Files beside this one: scene.xml (MJCF), scene.json (dimos.scene.v1: entities, spawns), movers.json
(dimos.movers.v1: scripted obstacles), meshes/ and world.project.json (the editor's project).
11 items, 2 floor(s).
"""

from __future__ import annotations

import json
from pathlib import Path
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


def blueprint(robot: str = "unitree-go2-freewalk") -> Any:
    """A dimos blueprint for `robot` in this world (sets the global scene package first)."""
    from dimos.core.global_config import global_config

    global_config.update(simulation="mujoco", scene_package=str(SCENE_DIR))
    from dimos.robot.get_all_blueprints import get_blueprint_by_name

    return get_blueprint_by_name(robot)


if __name__ == "__main__":
    model = check()
    print(f"{SCENE_XML}: {model.nbody} bodies, {model.ngeom} geoms, {len(MOVERS)} movers, spawns {sorted(SPAWNS)}")
