"""Runnable blueprints for this world (the pyproject's dimos.blueprints entry points): `dimos run clutter-yard.go2`."""

from __future__ import annotations

from clutter_yard.scene_data import SceneData
from clutter_yard.world import SCENE_DIR

from dimos.core.coordination.blueprints import Blueprint, autoconnect
from dimos.core.global_config import global_config
from dimos.robot.get_all_blueprints import get_blueprint_by_name


def with_robot(robot: str) -> Blueprint:
    """`robot` (any sim2 blueprint that honors scene_package) in this world, plus the SceneData module."""
    global_config.update(simulation="mujoco", scene_package=str(SCENE_DIR))
    return autoconnect(get_blueprint_by_name(robot), SceneData.blueprint())


go2 = with_robot("unitree-go2-freewalk")
