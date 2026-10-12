"""Score a navigation stack on a world's nav test (nav_eval.json, drawn in World Builder). Any robot, any nav stack.

1. drive the robot along the mapping path with plain Twist commands (so the stack builds its map),
2. send each goal as a PoseStamped and time how long the stack takes to get within the goal's tolerance.

The robot and its nav stack are whatever blueprint is running: start it yourself (the robot at the plan's start spawn)
and point this at its topics, or pass --blueprint to build one here in sim2 with the world loaded:

    dimos --simulation mujoco --transport zenoh --scene-package <world> run unitree-go2-freewalk &
    python verify/nav_eval.py <world> --report nav.json
    python verify/nav_eval.py <world> --blueprint unitree-go2-freewalk --report nav.json
    python verify/nav_eval.py <world> --cmd-vel /robot/cmd_vel --odom /robot/odometry --odom-type Odometry --goal /goal

Exit status: 0 when every goal was reached, 1 otherwise.
"""

from __future__ import annotations

import argparse
from dataclasses import replace
import json
import math
from pathlib import Path
import sys
import threading
import time
from typing import Any

from dimos.core.global_config import global_config
from dimos.core.transport_factory import make_transport
from dimos.msgs.geometry_msgs.PoseStamped import PoseStamped
from dimos.msgs.geometry_msgs.Twist import Twist
from dimos.msgs.nav_msgs.Odometry import Odometry


class Robot:
    """Whatever robot is on the bus: its pose from an odometry topic, Twist commands out, goals out."""

    def __init__(self, args: argparse.Namespace) -> None:
        odom_type = {"PoseStamped": PoseStamped, "Odometry": Odometry}[args.odom_type]
        self.cmd = make_transport(args.cmd_vel, Twist)
        self.goal = make_transport(args.goal, PoseStamped)
        self.cmd.start()
        self.goal.start()
        self.odom = make_transport(args.odom, odom_type)
        self.lock = threading.Lock()
        self.pose: tuple[float, float, float] | None = None
        self.track: list[tuple[float, float, float, float]] = []
        self.odom.subscribe(self._on_odom)
        self.frame = args.frame

    def _on_odom(self, msg: Any) -> None:
        pose = msg.pose.pose if hasattr(msg.pose, "pose") else msg
        p, q = pose.position, pose.orientation
        yaw = math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z))
        with self.lock:
            self.pose = (p.x, p.y, yaw)
            self.track.append((time.monotonic(), p.x, p.y, p.z))

    def where(self) -> tuple[float, float, float] | None:
        with self.lock:
            return self.pose

    def drive(self, vx: float, wz: float) -> None:
        self.cmd.broadcast(None, Twist(linear=(vx, 0, 0), angular=(0, 0, wz)))

    def send_goal(self, xyz: list[float]) -> None:
        self.goal.broadcast(None, PoseStamped(position=tuple(xyz), orientation=(0, 0, 0, 1), frame_id=self.frame))

    def stop(self) -> None:
        for transport in (self.cmd, self.goal, self.odom):
            transport.stop()


def path_length(points: list[tuple[float, float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(points, points[1:], strict=False))


def follow(robot: Robot, waypoints: list[list[float]], speed: float, reach: float = 0.35) -> dict[str, Any]:
    """Pure pursuit through the waypoints: turn toward the next one, walk when roughly facing it."""
    started = time.monotonic()
    reached = 0
    for target in waypoints:
        pose = robot.where()
        budget = 20 + (math.dist(pose[:2], target[:2]) / max(speed, 0.05) * 3 if pose else 60)
        deadline = time.monotonic() + budget
        while time.monotonic() < deadline:
            pose = robot.where()
            if pose is None:
                time.sleep(0.1)
                continue
            dx, dy = target[0] - pose[0], target[1] - pose[1]
            if math.hypot(dx, dy) < reach:
                reached += 1
                break
            error = math.atan2(dy, dx) - pose[2]
            error = math.atan2(math.sin(error), math.cos(error))
            wz = max(-0.8, min(0.8, 1.5 * error))
            vx = speed * max(0.0, math.cos(error)) if abs(error) < 0.7 else 0.0
            robot.drive(vx, wz)
            time.sleep(0.1)
    robot.drive(0, 0)
    return {"waypoints": len(waypoints), "reached": reached, "seconds": round(time.monotonic() - started, 1)}


def run_goals(robot: Robot, goals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results = []
    for goal in goals:
        start = robot.where()
        mark = len(robot.track)
        robot.send_goal(goal["position"])
        began = time.monotonic()
        reached_at = None
        closest = math.inf
        while time.monotonic() - began < goal["timeout"]:
            pose = robot.where()
            if pose:
                distance = math.dist(pose[:2], goal["position"][:2])
                closest = min(closest, distance)
                if distance <= goal["tolerance"]:
                    reached_at = time.monotonic() - began
                    break
            time.sleep(0.1)
        walked = [(x, y) for _, x, y, _ in robot.track[mark:]]
        straight = math.dist(start[:2], goal["position"][:2]) if start else None
        results.append({
            "goal": goal["name"],
            "reached": reached_at is not None,
            "seconds": round(reached_at, 1) if reached_at is not None else None,
            "closest_m": round(closest, 2),
            "path_m": round(path_length(walked), 2),
            "straight_line_m": round(straight, 2) if straight is not None else None,
        })
        print(f"[{'PASS' if reached_at is not None else 'FAIL'}] {goal['name']}: {results[-1]}", flush=True)
    return results


def build_blueprint(name: str, world: Path) -> Any:
    """Optional: run the robot here, in sim2, with this world loaded (any blueprint that honors --scene-package)."""
    from dimos.core.coordination.blueprint_config.parser import BlueprintConfigParser
    from dimos.core.coordination.module_coordinator import ModuleCoordinator
    from dimos.robot.get_all_blueprints import get_blueprint_by_name

    global_config.update(simulation="mujoco", viewer="none", scene_package=str(world))
    blueprint = get_blueprint_by_name(name)
    try:
        from dimos.sim2.module import SimulationModule

        blueprint = replace(
            blueprint,
            blueprints=tuple(
                replace(atom, kwargs={**atom.kwargs, "viewer": False}) if atom.module is SimulationModule else atom
                for atom in blueprint.blueprints
            ),
        )
    except ImportError:
        pass
    parsed = BlueprintConfigParser(blueprint).parse(global_overrides=global_config.model_dump(mode="python"))
    return ModuleCoordinator.build(blueprint, parsed_config=parsed)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("world", type=Path, help="an exported world folder (with nav_eval.json)")
    parser.add_argument("--cmd-vel", default="cmd_vel", help="Twist topic that drives the robot (mapping phase)")
    parser.add_argument("--odom", default="odom", help="the robot's pose topic")
    parser.add_argument("--odom-type", default="PoseStamped", choices=["PoseStamped", "Odometry"])
    parser.add_argument("--goal", default="goal_request", help="PoseStamped topic the nav stack takes goals on")
    parser.add_argument("--frame", default="world", help="frame_id of the goals")
    parser.add_argument("--transport", default="zenoh", choices=["zenoh", "lcm"])
    parser.add_argument("--speed", type=float, default=0.4, help="mapping walk speed, m/s")
    parser.add_argument("--blueprint", help="build and run this blueprint here (sim2) instead of using a running one")
    parser.add_argument("--settle", type=float, default=8.0, help="seconds to wait for the robot before starting")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    plan = json.loads((args.world / "nav_eval.json").read_text())
    if not plan["goals"] and not plan["mapping_path"]:
        print(f"{args.world}/nav_eval.json has no mapping path or goals: draw them in World Builder's Nav test tab")
        return 1
    global_config.update(transport=args.transport)
    coordinator = build_blueprint(args.blueprint, args.world.resolve()) if args.blueprint else None
    robot = Robot(args)
    report: dict[str, Any] = {"world": str(args.world), "plan": plan}
    try:
        deadline = time.monotonic() + args.settle + 30
        while robot.where() is None and time.monotonic() < deadline:
            time.sleep(0.2)
        if robot.where() is None:
            print(f"no odometry on {args.odom}: is a robot running?", flush=True)
            return 1
        time.sleep(args.settle)
        print(f"mapping: {len(plan['mapping_path'])} waypoints", flush=True)
        report["mapping"] = follow(robot, plan["mapping_path"], args.speed)
        print(f"mapping done: {report['mapping']}", flush=True)
        report["goals"] = run_goals(robot, plan["goals"])
    finally:
        robot.stop()
        if coordinator is not None:
            coordinator.stop()
    passed = all(g["reached"] for g in report["goals"])
    print(f"{sum(g['reached'] for g in report['goals'])}/{len(report['goals'])} goals reached", flush=True)
    if args.report:
        args.report.write_text(json.dumps(report, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
