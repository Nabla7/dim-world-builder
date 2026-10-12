// A cluttered yard: the kind of floor a robot actually meets. Built from the same scatter the palette uses.
import { defaultStairs, emptyProject, makeItem, PAINT, yaw } from "./defaults.ts";
import { footprintRadius, Footprints } from "./placement.ts";
import { scatterClutter } from "./scatter.ts";
import type { Project } from "./types.ts";

export function clutterYard(): Project {
  const project = emptyProject("clutter_yard");
  const ground = project.floors[0].id;
  project.spawns = [{ name: "start", floor: ground, position: [-5, 0, 0], yaw: 0 }];
  // the fixed pieces claim their floor first, so the scatter lands around them
  const footprints = new Footprints();
  footprints.claim(-2.5, -1.2, footprintRadius(2.4, 0.45)); // the ladder
  footprints.claim(5.7, 0, footprintRadius(1.6, 1.2)); // the open stairs, 5 steps up +x from x = 5
  footprints.claim(1, 3.5, footprintRadius(3, 0.6)); // the big pipe
  project.items.push(
    ...scatterClutter(ground, [0, 0, 0], 2026, 22, 4, footprints),
    makeItem("primitive", { shape: "ladder", color: PAINT.yellow }, {
      name: "Ladder",
      floor: ground,
      position: [-2.5, -1.2, 0],
      rotation: yaw(0.3),
      scale: [2.4, 0.45, 0.06],
    }),
    makeItem("stairs", {
      ...defaultStairs(),
      steps: 5,
      stepHeight: 0.18,
      openRisers: true,
      treadThickness: 0.04,
    }, {
      name: "Open stairs",
      floor: ground,
      position: [5, 0, 0],
    }),
    makeItem("primitive", { shape: "pipe", color: PAINT.steel }, {
      name: "Big pipe",
      floor: ground,
      position: [1, 3.5, 0],
      scale: [3, 0.6, 0.6],
    }),
  );
  return project;
}
