"""Drive a simulated Go2 (dimos sim2) through an exported world and check its collisions; exit 1 on any failure.

Run with a dimos checkout that has sim2 movers (branch jeff/feat/sim2_world_builder) and the Go2 FREE policy:
    python verify/drive_go2.py examples/nav_test_course [--video out.mp4]

Lanes are the test course's spawns (src/world/examples.ts). For each: put the Go2 at the spawn, stand it up, send
cmd_vel through the normal stack, and judge from simulator truth (pose, entity contacts) and the robot's own lidar.
"""

from __future__ import annotations

import argparse
from dataclasses import replace
import json
import math
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

import mujoco
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from dimos.core.coordination.blueprint_config.parser import BlueprintConfigParser
from dimos.core.coordination.module_coordinator import ModuleCoordinator
from dimos.core.global_config import global_config
from dimos.core.transport_factory import make_transport
from dimos.msgs.geometry_msgs.Twist import Twist
from dimos.msgs.sensor_msgs.PointCloud2 import PointCloud2
from dimos.robot.get_all_blueprints import get_blueprint_by_name
from dimos.robot.unitree.go2.freewalk_connection import Go2FreewalkConnection
from dimos.sim2.module import SimulationModule
from dimos.sim2.sensors.reader import WorldReader

ROBOT = "go2"
STAND_HEIGHT = 0.33


class Recorder:
    """Chase-camera frames from the live physics snapshot, piped to ffmpeg."""

    def __init__(self, description: dict[str, Any], path: Path, fps: int = 20) -> None:
        self.reader = WorldReader(description)
        self.reader.model.vis.global_.offwidth = 1280
        self.reader.model.vis.global_.offheight = 720
        self.renderer = mujoco.Renderer(self.reader.model, 720, 1280)
        self.camera = mujoco.MjvCamera()
        self.camera.distance = 4.5
        self.camera.elevation = -25
        self.root = self.reader.model.body(f"{ROBOT}/base").id
        self.font = ImageFont.load_default(size=20)
        self.fps = fps
        self.start = time.monotonic()
        self.written = 0
        self.caption = ""
        self.ffmpeg = subprocess.Popen(
            ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "1280x720",
             "-r", str(fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)],
            stdin=subprocess.PIPE,
        )

    def tick(self) -> None:
        # real-time video: repeat the latest frame for however many frame slots have passed
        due = int((time.monotonic() - self.start) * self.fps)
        if due <= self.written:
            return
        self.reader.update()
        data = self.reader.data
        self.camera.lookat[:] = data.xpos[self.root]
        self.renderer.update_scene(data, camera=self.camera)
        image = Image.fromarray(self.renderer.render())
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 1280, 44), fill=(20, 22, 26))
        draw.text((16, 12), self.caption, fill=(235, 235, 235), font=self.font)
        frame = image.tobytes()
        assert self.ffmpeg.stdin is not None
        for _ in range(due - self.written):
            self.ffmpeg.stdin.write(frame)
        self.written = due

    def close(self) -> None:
        assert self.ffmpeg.stdin is not None
        self.ffmpeg.stdin.close()
        self.ffmpeg.wait()
        self.renderer.close()
        self.reader.close()


class Course:
    def __init__(self, scene_dir: Path) -> None:
        self.scene = json.loads((scene_dir / "scene.json").read_text())
        global_config.update(
            simulation="mujoco", viewer="none", transport="zenoh", scene_package=str(scene_dir)
        )
        blueprint = get_blueprint_by_name("unitree-go2-freewalk")
        blueprint = replace(
            blueprint,
            blueprints=tuple(
                replace(atom, kwargs={**atom.kwargs, "viewer": False})
                if atom.module is SimulationModule
                else atom
                for atom in blueprint.blueprints
            ),
        )
        parsed = BlueprintConfigParser(blueprint).parse(
            global_overrides=global_config.model_dump(mode="python")
        )
        self.coordinator = ModuleCoordinator.build(blueprint, parsed_config=parsed)
        self.sim = self.coordinator.get_instance(SimulationModule)
        self.policy = self.coordinator.get_instance(Go2FreewalkConnection)
        self.cmd = make_transport("cmd_vel", Twist)
        self.cmd.start()
        self.clouds: list[PointCloud2] = []
        self.lidar = make_transport("pointcloud", PointCloud2)
        self.lidar.subscribe(self.clouds.append)
        self.recorder: Recorder | None = None
        self.failures: list[str] = []
        self.results: dict[str, Any] = {}

    def wait(self, seconds: float, twist: tuple[float, float, float] = (0, 0, 0)) -> list[dict[str, Any]]:
        """Command (vx, vy, wz) for `seconds`; returns ~10 Hz samples of pose and contacts."""
        samples = []
        end = time.monotonic() + seconds
        next_sample = 0.0
        while time.monotonic() < end:
            self.cmd.broadcast(None, Twist(linear=(twist[0], twist[1], 0), angular=(0, 0, twist[2])))
            if self.recorder:
                self.recorder.tick()
            if time.monotonic() >= next_sample:
                next_sample = time.monotonic() + 0.1
                state = self.sim.scene_state()
                pose = state.robots[ROBOT]
                samples.append({
                    "xyz": pose.position.to_tuple(),
                    "contacts": [tuple(c) for c in state.contacts],
                    "entities": {k: v.pose.position.to_tuple() for k, v in state.entities.items()},
                })
            time.sleep(0.02)
        return samples

    def spawn(self, name: str) -> tuple[float, float, float]:
        pose = self.scene["spawns"][name]
        x, y, z = pose["position"]
        qx, qy, qz, qw = pose["orientation"]
        yaw = math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz))
        self.policy.disarm()
        self.sim.set_spawn(ROBOT, (x, y, z + STAND_HEIGHT), (0.0, 0.0, yaw))
        self.wait(1.0)
        deadline = time.monotonic() + 10
        while not self.policy.arm():
            if time.monotonic() > deadline:
                raise TimeoutError("Go2 policy would not arm")
            self.wait(0.2)
        self.wait(3.0)
        return (x, y, z)

    def say(self, caption: str) -> None:
        print(caption, flush=True)
        if self.recorder:
            self.recorder.caption = caption

    def check(self, lane: str, ok: bool, detail: str) -> None:
        self.say(f"[{'PASS' if ok else 'FAIL'}] {lane}: {detail}")
        self.results.setdefault(lane, []).append({"ok": ok, "detail": detail})
        if not ok:
            self.failures.append(f"{lane}: {detail}")

    def touched(self, samples: list[dict[str, Any]], entity: str) -> bool:
        return any(
            entity in pair and any(str(p).startswith(f"{ROBOT}/") or p == ROBOT for p in pair)
            for s in samples
            for pair in s["contacts"]
        )

    def lidar_hits(self, box_min: tuple[float, float, float], box_max: tuple[float, float, float]) -> int:
        """lidar points (world frame) inside a box, over the last second of scans"""
        recent = self.clouds[-10:]
        lo, hi = np.array(box_min), np.array(box_max)
        count = 0
        for cloud in recent:
            points = cloud.points_f32()
            count += int(np.count_nonzero(np.all((points >= lo) & (points <= hi), axis=1)))
        return count

    def stop(self) -> None:
        if self.recorder:
            self.recorder.close()
        self.cmd.stop()
        self.lidar.stop()
        self.coordinator.stop()


def entity_named(scene: dict[str, Any], label: str) -> str:
    return next(k for k, v in scene["entities"].items() if v["label"] == label)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene_dir", type=Path)
    parser.add_argument("--video", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    course = Course(args.scene_dir.resolve())
    scene = course.scene
    try:
        if args.video:
            course.recorder = Recorder(course.sim.describe(), args.video)
        # wall lane: the room's solid west wall faces x = 2.425; the Go2's nose is ~0.35 m ahead of its base
        room = entity_named(scene, "Lab room")
        course.say("wall lane: walk at a solid room wall")
        course.spawn("wall_lane")
        course.wait(1.0)
        course.check(
            "wall", course.lidar_hits((2.3, -2, 0.05), (2.6, 2, 2.5)) > 50, "lidar sees the wall ahead"
        )
        samples = course.wait(9.0, (0.5, 0, 0))
        xs = [s["xyz"][0] for s in samples]
        course.check("wall", max(xs) > 1.3, f"walked toward the wall (max x {max(xs):.2f})")
        course.check("wall", max(xs) < 2.425, f"never crossed the wall plane x=2.425 (max base x {max(xs):.2f})")
        course.check("wall", course.touched(samples, room), f"contact with {room} recorded")

        # box lane: a static crate whose near face is x = 2.0
        crate = entity_named(scene, "Crate")
        course.say("box lane: walk at a static crate")
        course.spawn("box_lane")
        samples = course.wait(8.0, (0.5, 0, 0))
        xs = [s["xyz"][0] for s in samples]
        course.check("box", max(xs) < 2.0, f"stopped by the crate (max base x {max(xs):.2f})")
        course.check("box", course.touched(samples, crate), f"contact with {crate} recorded")

        # mover lane: walk to the cart's track, stand there, let the cart come through
        cart = entity_named(scene, "Cart")
        course.say("mover lane: stand on the cart's track and let it come through")
        course.spawn("mover_lane")
        course.wait(1.0)
        course.wait(3.4, (0.5, 0, 0))
        course.check(
            "mover", course.lidar_hits((1.0, -14.5, 0.0), (1.8, -9.5, 0.6)) > 20, "lidar sees the cart"
        )
        samples = course.wait(14.0)
        ys = [s["entities"][cart][1] for s in samples]
        course.check("mover", max(ys) - min(ys) > 1.0, f"the cart moved ({min(ys):.2f}..{max(ys):.2f})")
        pushed = max(math.dist(s["xyz"][:2], samples[0]["xyz"][:2]) for s in samples)
        course.check("mover", course.touched(samples, cart), f"contact with {cart} recorded")
        course.check("mover", pushed > 0.1, f"the cart displaced the Go2 by {pushed:.2f} m")

        # stairs lane: 0.17 m steps starting at x = 1.5
        stairs = entity_named(scene, "Stairs")
        course.say("stairs lane: walk at 0.17 m stairs")
        course.spawn("stairs_lane")
        course.wait(1.0)
        course.check(
            "stairs", course.lidar_hits((1.4, 5.3, 0.0), (3.0, 6.7, 1.1)) > 50, "lidar sees the stairs"
        )
        samples = course.wait(8.0, (0.4, 0, 0))
        top = max(s["xyz"][2] for s in samples)
        xs = [s["xyz"][0] for s in samples]
        climbed = top > STAND_HEIGHT + 0.3
        course.check(
            "stairs",
            climbed or (max(xs) < 1.5 + 0.3 and course.touched(samples, stairs)),
            f"{'climbed' if climbed else 'blocked at'} the stairs (max x {max(xs):.2f}, max z {top:.2f})",
        )
    finally:
        course.stop()
    if args.report:
        args.report.write_text(json.dumps(course.results, indent=2))
    print("FAILURES:\n  " + "\n  ".join(course.failures) if course.failures else "ALL PASSED", flush=True)
    return 1 if course.failures else 0


if __name__ == "__main__":
    sys.exit(main())
