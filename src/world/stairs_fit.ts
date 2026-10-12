// Stairs that join two floors: steps that climb exactly to the floor above, and the opening cut into its slab.

import { makeItem } from "./defaults.ts";
import { stairsShapes } from "./geometry.ts";
import type { Floor, Item, StairsParams } from "./types.ts";

/** a comfortable riser: the step count that keeps each step at most this tall */
const MAX_RISER = 0.19;

/** the floor right above `floor`, if any */
export function floorAbove(floors: Floor[], floor: string): Floor | undefined {
  const here = floors.find((f) => f.id === floor);
  if (!here) return undefined;
  return floors.filter((f) => f.elevation > here.elevation)
    .sort((a, b) => a.elevation - b.elevation)[0];
}

/** the same stairs, with as many equal steps as it takes to climb `rise` */
export function climbing(p: StairsParams, rise: number): StairsParams {
  const steps = Math.max(1, Math.ceil(rise / MAX_RISER - 1e-9));
  return { ...p, steps, stepHeight: Math.round((rise / steps) * 10000) / 10000 };
}

/**
 * A hole in the floor above, over the stairs' footprint plus a margin (axis-aligned, as holes are), so the climb
 * comes out through the slab instead of into it.
 */
export function openingAbove(
  stairs: Extract<Item, { kind: "stairs" }>,
  above: Floor,
  margin = 0.15,
): Extract<Item, { kind: "hole" }> {
  const [qx, qy, qz, qw] = stairs.rotation;
  const yaw = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz));
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const shape of stairsShapes(stairs.params)) {
    if (shape.type !== "box") continue;
    const r = Math.max(shape.size[0], shape.size[1]);
    for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const lx = (shape.pos[0] + dx) * stairs.scale[0];
      const ly = (shape.pos[1] + dy) * stairs.scale[1];
      const x = stairs.position[0] + c * lx - s * ly;
      const y = stairs.position[1] + s * lx + c * ly;
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return makeItem("hole", {
    sizeX: round(x1 - x0 + 2 * margin),
    sizeY: round(y1 - y0 + 2 * margin),
    depth: Math.max(0.05, above.slab?.thickness ?? 0.3),
  }, {
    name: `Opening for ${stairs.name}`,
    floor: above.id,
    position: [round((x0 + x1) / 2), round((y0 + y1) / 2), 0],
  });
}
