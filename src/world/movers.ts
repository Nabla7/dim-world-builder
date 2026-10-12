// Where a scripted mover is at a given time: the same kinematics sim2 runs (dimos/sim2/movers.py), so the editor's
// motion preview matches the simulation.

import type { WorldMover } from "./geometry.ts";
import type { Quat, Vec3 } from "./types.ts";

/** position along the path at `time` seconds, and (heading "path") yaw along travel; null when the path has no length */
export function moverPose(
  mover: WorldMover,
  time: number,
): { position: Vec3; quat: Quat | null } | null {
  const given = mover.waypoints;
  if (given.length < 2) return null;
  const points = mover.mode === "loop"
    ? [...given, given[0]]
    : [...given, ...given.slice(0, -1).reverse()];
  const lengths = points.slice(1).map((p, i) =>
    Math.hypot(p[0] - points[i][0], p[1] - points[i][1], p[2] - points[i][2])
  );
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let distance = ((time * mover.speed) % total + total) % total;
  let index = 0;
  while (index < lengths.length - 1 && (distance > lengths[index] || lengths[index] === 0)) {
    distance -= lengths[index];
    index++;
  }
  const from = points[index];
  const to = points[index + 1];
  const f = lengths[index] > 0 ? Math.min(1, Math.max(0, distance / lengths[index])) : 0;
  const position: Vec3 = [
    from[0] + (to[0] - from[0]) * f,
    from[1] + (to[1] - from[1]) * f,
    from[2] + (to[2] - from[2]) * f,
  ];
  if (mover.heading === "fixed") return { position, quat: null };
  const yaw = Math.atan2(to[1] - from[1], to[0] - from[0]);
  return { position, quat: [0, 0, Math.sin(yaw / 2), Math.cos(yaw / 2)] };
}
